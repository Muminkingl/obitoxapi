/**
 * AWS S3 Delete Controller
 * Delete files from S3 bucket
 * 
 * OPTIMIZED: Uses only updateRequestMetrics (Redis-backed)
 */

import { DeleteObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import {
    validateS3Credentials,
    getS3Client,
    formatS3Error
} from './s3.config.js';
import { isValidRegion, getInvalidRegionError } from '../../../utils/aws/s3-regions.js';
import { checkUserQuota } from '../shared/analytics.new.js';
import { incrementQuota } from '../../../utils/quota-manager.js';

import { updateRequestMetrics } from '../shared/metrics.helper.js';

// Import memory guard
import { checkMemoryRateLimit } from '../r2/cache/memory-guard.js';

/**
 * Delete single file from S3
 */
export const deleteS3File = async (req, res) => {
    const requestId = `del_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    let apiKeyId;

    try {
        const {
            key,
            s3AccessKey,
            s3SecretKey,
            s3Bucket,
            s3Region = 'us-east-1',
            s3Endpoint  // Custom endpoint for MinIO/LocalStack
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
        if (!key) {
            return res.status(400).json(formatS3Error(
                'MISSING_KEY',
                'S3 object key is required',
                'Provide the key parameter (e.g., "upl123_photo.jpg")'
            ));
        }

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

        // LAYER 1: Memory Guard (fastest possible)
        const memCheck = checkMemoryRateLimit(userId, 's3-delete');
        if (!memCheck.allowed) {
            return res.status(429).json(formatS3Error(
                'RATE_LIMIT_EXCEEDED',
                'Rate limit exceeded - too many delete requests',
                'Wait a moment before trying again'
            ));
        }

        // QUOTA CHECK (OPT-2: use MW2 data if available, else fallback)
        const quotaCheck = req.quotaChecked || await checkUserQuota(userId);
        if (!quotaCheck.allowed) {
            return res.status(429).json(formatS3Error(
                'QUOTA_EXCEEDED',
                'Monthly quota exceeded'
            ));
        }

        // AWS API CALL
        const apiCallStart = Date.now();
        const s3Client = getS3Client(s3Region, s3AccessKey, s3SecretKey, s3Endpoint);

        const command = new DeleteObjectCommand({
            Bucket: s3Bucket,
            Key: key
        });

        const result = await s3Client.send(command);

        const apiCallTime = Date.now() - apiCallStart;
        const totalTime = Date.now() - startTime;

        // 🚀 SINGLE METRICS CALL (Redis-backed)
        updateRequestMetrics(apiKeyId, userId, 's3', true)
            .catch(() => { });

        console.log(`[${requestId}] ✅ S3 delete: ${key} in ${totalTime}ms`);

        const response = {
            success: true,
            deleted: key,
            deletedAt: new Date().toISOString(),
            provider: 's3',
            region: s3Region,
            versionId: result.VersionId || null,
            deleteMarker: result.DeleteMarker || false,
            hint: result.DeleteMarker
                ? 'File marked as deleted (versioning enabled)'
                : 'File permanently deleted',
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
        console.error(`[${requestId}] 💥 S3 delete error after ${totalTime}ms:`, error);

        if (error.name === 'NoSuchKey' || error.message.includes('NoSuchKey')) {
            return res.status(404).json(formatS3Error(
                'FILE_NOT_FOUND',
                `File not found: ${req.body.key}`,
                'Check the key parameter and ensure the file exists'
            ));
        }

        if (error.name === 'AccessDenied' || error.message.includes('AccessDenied')) {
            return res.status(403).json(formatS3Error(
                'ACCESS_DENIED',
                'No permission to delete this file',
                'Check your IAM permissions (need s3:DeleteObject)'
            ));
        }

        if (apiKeyId) {
            updateRequestMetrics(apiKeyId, req.userId || apiKeyId, 's3', false)
                .catch(() => { });
        }

        return res.status(500).json(formatS3Error(
            'S3_DELETE_ERROR',
            'Failed to delete file',
            process.env.NODE_ENV === 'development' ? error.message : null
        ));
    }
};

/**
 * Delete multiple files from S3 (batch operation)
 */
export const batchDeleteS3Files = async (req, res) => {
    const requestId = `batch_del_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    let apiKeyId;

    try {
        const {
            keys,
            s3AccessKey,
            s3SecretKey,
            s3Bucket,
            s3Region = 'us-east-1',
            s3Endpoint  // Custom endpoint for MinIO/LocalStack
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
        if (!keys || !Array.isArray(keys) || keys.length === 0) {
            return res.status(400).json(formatS3Error(
                'INVALID_KEYS',
                'keys must be a non-empty array',
                'Provide an array of object keys: ["file1.jpg", "file2.png"]'
            ));
        }

        if (keys.length > 1000) {
            return res.status(400).json(formatS3Error(
                'BATCH_TOO_LARGE',
                'Cannot delete more than 1000 files in one batch',
                `Split your batch into ${Math.ceil(keys.length / 1000)} smaller requests`
            ));
        }

        if (!s3AccessKey || !s3SecretKey || !s3Bucket) {
            return res.status(400).json(formatS3Error(
                'MISSING_S3_CREDENTIALS',
                'S3 credentials are required'
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

        // LAYER 1: Memory Guard (fastest possible)
        const memCheck = checkMemoryRateLimit(userId, 's3-batch-delete');
        if (!memCheck.allowed) {
            return res.status(429).json(formatS3Error(
                'RATE_LIMIT_EXCEEDED',
                'Rate limit exceeded - too many batch delete requests',
                'Wait a moment before trying again'
            ));
        }

        // QUOTA CHECK (OPT-2: use MW2 data if available, else fallback)
        const quotaCheck = req.quotaChecked || await checkUserQuota(userId);
        if (!quotaCheck.allowed) {
            return res.status(429).json(formatS3Error(
                'QUOTA_EXCEEDED',
                'Monthly quota exceeded'
            ));
        }

        // AWS API CALL
        const apiCallStart = Date.now();
        const s3Client = getS3Client(s3Region, s3AccessKey, s3SecretKey, s3Endpoint);

        const command = new DeleteObjectsCommand({
            Bucket: s3Bucket,
            Delete: {
                Objects: keys.map(key => ({ Key: key })),
                Quiet: false
            }
        });

        const result = await s3Client.send(command);

        const apiCallTime = Date.now() - apiCallStart;
        const totalTime = Date.now() - startTime;

        // 🚀 SINGLE METRICS CALL (Redis-backed)
        updateRequestMetrics(apiKeyId, userId, 's3', true)
            .catch(() => { });

        console.log(`[${requestId}] ✅ S3 batch delete: ${keys.length} files in ${totalTime}ms`);

        const response = {
            success: true,
            deleted: result.Deleted?.map(obj => obj.Key) || [],
            deletedCount: result.Deleted?.length || 0,
            errors: result.Errors || [],
            errorCount: result.Errors?.length || 0,
            deletedAt: new Date().toISOString(),
            provider: 's3',
            region: s3Region,
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
        console.error(`[${requestId}] 💥 S3 batch delete error after ${totalTime}ms:`, error);

        if (apiKeyId) {
            updateRequestMetrics(apiKeyId, req.userId || apiKeyId, 's3', false)
                .catch(() => { });
        }

        return res.status(500).json(formatS3Error(
            'S3_BATCH_DELETE_ERROR',
            'Failed to delete files',
            process.env.NODE_ENV === 'development' ? error.message : null
        ));
    }
};
