/**
 * AWS S3 List Controller
 * List files in S3 bucket
 * 
 * OPTIMIZED: Uses only updateRequestMetrics (Redis-backed)
 */

import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import {
    validateS3Credentials,
    getS3Client,
    formatS3Error
} from './s3.config.js';
import { isValidRegion, getInvalidRegionError } from '../../../utils/aws/s3-regions.js';
import { checkUserQuota } from '../shared/analytics.new.js';
import { incrementQuota } from '../../../utils/quota-manager.js';

// 🚀 REDIS METRICS: Single source of truth
import { updateRequestMetrics } from '../shared/metrics.helper.js';

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

        const credValidation = validateS3Credentials(s3AccessKey, s3SecretKey, s3Bucket, s3Region);
        if (!credValidation.valid) {
            return res.status(400).json({
                success: false,
                provider: 's3',
                ...credValidation
            });
        }

        if (!isValidRegion(s3Region)) {
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

        // QUOTA CHECK
        const quotaCheck = await checkUserQuota(userId);
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
        const result = await s3Client.send(command);

        const apiCallTime = Date.now() - apiCallStart;
        const totalTime = Date.now() - startTime;

        // FORMAT FILES
        const files = (result.Contents || []).map(obj => ({
            key: obj.Key,
            size: obj.Size,
            lastModified: obj.LastModified.toISOString(),
            etag: obj.ETag,
            storageClass: obj.StorageClass || 'STANDARD',
            owner: obj.Owner?.DisplayName || null
        }));

        // 🚀 SINGLE METRICS CALL (Redis-backed)
        updateRequestMetrics(apiKeyId, userId, 's3', true)
            .catch(() => { });

        console.log(`[${requestId}] ✅ S3 list: ${result.KeyCount} files in ${totalTime}ms`);

        const response = {
            success: true,
            files,
            count: result.KeyCount || 0,
            isTruncated: result.IsTruncated || false,
            nextContinuationToken: result.NextContinuationToken || null,
            prefix: prefix || null,
            maxKeys,
            provider: 's3',
            region: s3Region,
            hint: result.IsTruncated
                ? 'More files available. Use nextContinuationToken for pagination.'
                : 'All files returned',
            performance: {
                requestId,
                totalTime: `${totalTime}ms`,
                apiCallTime: `${apiCallTime}ms`
            }
        };

        res.status(200).json(response);
        incrementQuota(userId, 1).catch(() => { });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`[${requestId}] 💥 S3 list error after ${totalTime}ms:`, error);

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
            process.env.NODE_ENV === 'development' ? error.message : null
        ));
    }
};
