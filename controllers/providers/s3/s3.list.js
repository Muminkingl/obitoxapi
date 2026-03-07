/**
 * AWS S3 List Controller
 * List files in S3 bucket
 * 
 * OPTIMIZED: Uses only updateRequestMetrics (Redis-backed)
 */

import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
    validateS3Credentials,
    getS3Client,
    formatS3Error
} from './s3.config.js';
import { isValidRegion, getInvalidRegionError } from '../../../utils/aws/s3-regions.js';



import { updateRequestMetrics } from '../shared/metrics.helper.js';

// Import memory guard
import { checkMemoryRateLimit } from '../r2/cache/memory-guard.js';
import logger from '../../../utils/logger.js';

/**
 * List files in S3 bucket
 */
export const listS3Files = async (req, res) => {
    const requestId = `list_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    let apiKeyId;

    try {
        const {
            s3AccessKey,
            s3SecretKey,
            s3Bucket,
            s3Region = 'us-east-1',
            s3Endpoint,  // Custom endpoint for MinIO/LocalStack
            prefix,
            maxKeys = 1000,
            continuationToken
        } = req.body;

        apiKeyId = req.apiKeyId;
        const userId = req.userId || apiKeyId;

        if (!apiKeyId) {
            return res.status(401).json(formatS3Error(
                'UNAUTHORIZED',
                'API key is required'
            ));
        }

        // VALIDATION
        if (!s3AccessKey || !s3SecretKey || !s3Bucket) {
            return res.status(400).json(formatS3Error(
                'MISSING_S3_CREDENTIALS',
                'S3 credentials are required: s3AccessKey, s3SecretKey, s3Bucket'
            ));
        }

        const credValidation = validateS3Credentials(s3AccessKey, s3SecretKey, s3Bucket, s3Region, s3Endpoint);
        if (!credValidation.valid) {
            return res.status(400).json({
                success: false,
                provider: 's3',
                ...credValidation
            });
        }

        if (!s3Endpoint && !isValidRegion(s3Region)) {
            const regionError = getInvalidRegionError(s3Region);
            return res.status(400).json({
                success: false,
                provider: 's3',
                ...regionError
            });
        }

        if (maxKeys < 1 || maxKeys > 1000) {
            return res.status(400).json(formatS3Error(
                'INVALID_MAX_KEYS',
                'maxKeys must be between 1 and 1000',
                'Adjust your maxKeys parameter'
            ));
        }

        // LAYER 1: Memory Guard (fastest possible)
        const memCheck = checkMemoryRateLimit(userId, 's3-list');
        if (!memCheck.allowed) {
            return res.status(429).json(formatS3Error(
                'RATE_LIMIT_EXCEEDED',
                'Rate limit exceeded - too many list requests',
                'Wait a moment before trying again'
            ));
        }

        // QUOTA CHECK (OPT-2: use MW2 data if available, else fallback)
        const quotaCheck = req.quotaChecked || { allowed: true };
        if (!quotaCheck.allowed) {
            return res.status(429).json(formatS3Error(
                'QUOTA_EXCEEDED',
                'Monthly quota exceeded'
            ));
        }

        // AWS API CALL
        const apiCallStart = Date.now();
        const s3Client = getS3Client(s3Region, s3AccessKey, s3SecretKey, s3Endpoint);

        const commandParams = {
            Bucket: s3Bucket,
            MaxKeys: maxKeys
        };

        if (prefix) {
            commandParams.Prefix = prefix;
        }

        if (continuationToken) {
            commandParams.ContinuationToken = continuationToken;
        }

        const command = new ListObjectsV2Command(commandParams);
        
        // Use presigned URL + manual fetch to handle the XML manually without DOMParser
        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });
        const listResponse = await fetch(signedUrl);

        if (!listResponse.ok) {
            throw new Error(`S3 HTTP ${listResponse.status}: ${await listResponse.text()}`);
        }

        const xmlText = await listResponse.text();
        const apiCallTime = Date.now() - apiCallStart;
        const totalTime = Date.now() - startTime;

        // FORMAT FILES (lightweight regex parsing)
        const files = [];
        const contentsRegex = /<Contents>[\s\S]*?<\/Contents>/g;
        let match;
        let keyCount = 0;
        
        while ((match = contentsRegex.exec(xmlText)) !== null) {
            const item = match[0];
            const key = item.match(/<Key>(.*?)<\/Key>/)?.[1] || '';
            const size = parseInt(item.match(/<Size>(.*?)<\/Size>/)?.[1] || '0', 10);
            const lastModified = item.match(/<LastModified>(.*?)<\/LastModified>/)?.[1] || new Date().toISOString();
            const etag = item.match(/<ETag>(.*?)<\/ETag>/)?.[1]?.replace(/"/g, '') || '';
            const storageClass = item.match(/<StorageClass>(.*?)<\/StorageClass>/)?.[1] || 'STANDARD';
            const owner = item.match(/<DisplayName>(.*?)<\/DisplayName>/)?.[1] || null;

            if (key) {
                files.push({ key, size, lastModified, etag, storageClass, owner });
                keyCount++;
            }
        }

        const isTruncated = xmlText.includes('<IsTruncated>true</IsTruncated>');
        const nextContinuationTokenMatch = xmlText.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/);
        const nextContinuationToken = nextContinuationTokenMatch ? nextContinuationTokenMatch[1] : null;

        // 🚀 SINGLE METRICS CALL (Redis-backed)
        updateRequestMetrics(apiKeyId, userId, 's3', true)
            .catch(() => { });

        logger.info(`[${requestId}] ✅ S3 list: ${keyCount} files in ${totalTime}ms`);

        const response = {
            success: true,
            files,
            count: keyCount,
            isTruncated,
            nextContinuationToken,
            prefix: prefix || null,
            maxKeys,
            provider: 's3',
            region: s3Region,
            hint: isTruncated
                ? 'More files available. Use nextContinuationToken for pagination.'
                : 'All files returned',
            performance: {
                requestId,
                totalTime: `${totalTime}ms`,
                apiCallTime: `${apiCallTime}ms`
            }
        };

        res.status(200).json(response);


    } catch (error) {
        const totalTime = Date.now() - startTime;
        logger.error(`s3 error:`, { error });

        if (error.name === 'NoSuchBucket' || error.message.includes('NoSuchBucket')) {
            return res.status(404).json(formatS3Error(
                'BUCKET_NOT_FOUND',
                `Bucket not found: ${req.body.s3Bucket}`,
                'Check your bucket name and region'
            ));
        }

        if (error.name === 'AccessDenied' || error.message.includes('AccessDenied')) {
            return res.status(403).json(formatS3Error(
                'ACCESS_DENIED',
                'No permission to list bucket contents',
                'Check your IAM permissions (need s3:ListBucket)'
            ));
        }

        if (apiKeyId) {
            updateRequestMetrics(apiKeyId, req.userId || apiKeyId, 's3', false)
                .catch(() => { });
        }

        return res.status(500).json(formatS3Error(
            'S3_LIST_ERROR',
            'Failed to list files',
            error.stack
        ));
    }
};
