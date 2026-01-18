/**
 * AWS S3 List Controller
 * 
 * List files in S3 bucket
 * 
 * Performance: 100-300ms (1 AWS API call)
 * 
 * CRITICAL:
 * - Makes AWS API call (not pure crypto)
 * - Supports pagination (up to 1000 files per request)
 * - Optional prefix filtering
 */

import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import {
    validateS3Credentials,
    getS3Client,
    formatS3Response,
    formatS3Error
} from './s3.config.js';
import { isValidRegion, getInvalidRegionError } from '../../../utils/aws/s3-regions.js';
import { checkUserQuota, trackApiUsage } from '../shared/analytics.new.js';
import { incrementQuota, checkUsageWarnings } from '../../../utils/quota-manager.js';

console.log('🔄 [S3 LIST] Module loaded!');

/**
 * List files in S3 bucket
 * POST /api/v1/upload/s3/list
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
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
            prefix,                      // Optional: Filter by prefix (e.g., "uploads/")
            maxKeys = 1000,              // Optional: Max files to return (default: 1000)
            continuationToken            // Optional: For pagination
        } = req.body;

        apiKeyId = req.apiKeyId;
        const userId = req.userId || apiKeyId;

        if (!apiKeyId) {
            return res.status(401).json(formatS3Error(
                'UNAUTHORIZED',
                'API key is required'
            ));
        }

        // ============================================================================
        // VALIDATION: Credentials
        // ============================================================================
        if (!s3AccessKey || !s3SecretKey || !s3Bucket) {
            return res.status(400).json(formatS3Error(
                'MISSING_S3_CREDENTIALS',
                'S3 credentials are required: s3AccessKey, s3SecretKey, s3Bucket'
            ));
        }

        // ============================================================================
        // VALIDATION: Credentials & Region
        // ============================================================================
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

        // ============================================================================
        // VALIDATION: MaxKeys
        // ============================================================================
        if (maxKeys < 1 || maxKeys > 1000) {
            return res.status(400).json(formatS3Error(
                'INVALID_MAX_KEYS',
                'maxKeys must be between 1 and 1000',
                'Adjust your maxKeys parameter'
            ));
        }

        // ============================================================================
        // QUOTA CHECK
        // ============================================================================
        const quotaCheck = await checkUserQuota(userId);
        if (!quotaCheck.allowed) {
            trackApiUsage({
                userId,
                endpoint: '/api/v1/upload/s3/list',
                method: 'POST',
                provider: 's3',
                operation: 'list',
                statusCode: 429,
                success: false,
                apiKeyId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
            return res.status(429).json(formatS3Error(
                'QUOTA_EXCEEDED',
                'Monthly quota exceeded'
            ));
        }

        // ============================================================================
        // AWS API CALL: List Objects
        // ============================================================================
        const apiCallStart = Date.now();

        const s3Client = getS3Client(s3Region, s3AccessKey, s3SecretKey);

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

        // ============================================================================
        // FORMAT: Files Array
        // ============================================================================
        const files = (result.Contents || []).map(obj => ({
            key: obj.Key,
            size: obj.Size,
            lastModified: obj.LastModified.toISOString(),
            etag: obj.ETag,
            storageClass: obj.StorageClass || 'STANDARD',
            owner: obj.Owner?.DisplayName || null
        }));

        // ============================================================================
        // ANALYTICS
        // ============================================================================
        trackApiUsage({
            userId,
            endpoint: '/api/v1/upload/s3/list',
            method: 'POST',
            provider: 's3',
            operation: 'list',
            statusCode: 200,
            success: true,
            requestCount: 1,
            apiKeyId,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        console.log(`[${requestId}] ✅ S3 list: ${result.KeyCount} files in ${totalTime}ms (API: ${apiCallTime}ms)`);

        // ============================================================================
        // RESPONSE
        // ============================================================================
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

        // Increment quota (fire-and-forget)
        incrementQuota(userId, 1).catch(() => { });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`[${requestId}] 💥 S3 list error after ${totalTime}ms:`, error);

        // Handle specific S3 errors
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
            trackApiUsage({
                userId: req.userId || apiKeyId,
                endpoint: '/api/v1/upload/s3/list',
                method: 'POST',
                provider: 's3',
                operation: 'list',
                statusCode: 500,
                success: false,
                apiKeyId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }

        return res.status(500).json(formatS3Error(
            'S3_LIST_ERROR',
            'Failed to list files',
            process.env.NODE_ENV === 'development' ? error.message : null
        ));
    }
};
