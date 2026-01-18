/**
 * AWS S3 Delete Controller
 * 
 * Delete files from S3 bucket
 * 
 * Performance:
 * - Single delete: 50-100ms (1 AWS API call)
 * - Batch delete: 200-500ms (1 AWS API call for up to 1000 files)
 * 
 * CRITICAL:
 * - These make AWS API calls (not pure crypto)
 * - Use for file cleanup, user deletions, etc.
 */

import { DeleteObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import {
    validateS3Credentials,
    getS3Client,
    formatS3Response,
    formatS3Error
} from './s3.config.js';
import { isValidRegion, getInvalidRegionError } from '../../../utils/aws/s3-regions.js';
import { checkUserQuota, trackApiUsage } from '../shared/analytics.new.js';
import { incrementQuota, checkUsageWarnings } from '../../../utils/quota-manager.js';

console.log('🔄 [S3 DELETE] Module loaded!');

/**
 * Delete single file from S3
 * DELETE /api/v1/upload/s3/delete
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export const deleteS3File = async (req, res) => {
    const requestId = `del_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    let apiKeyId;

    try {
        const {
            key,                    // Required: S3 object key to delete
            s3AccessKey,           // Required
            s3SecretKey,           // Required
            s3Bucket,              // Required
            s3Region = 'us-east-1' // Optional
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
        // VALIDATION: Required Fields
        // ============================================================================
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
        // QUOTA CHECK
        // ============================================================================
        const quotaCheck = await checkUserQuota(userId);
        if (!quotaCheck.allowed) {
            trackApiUsage({
                userId,
                endpoint: '/api/v1/upload/s3/delete',
                method: 'DELETE',
                provider: 's3',
                operation: 'delete',
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
        // AWS API CALL: Delete Object
        // ============================================================================
        const apiCallStart = Date.now();

        const s3Client = getS3Client(s3Region, s3AccessKey, s3SecretKey);

        const command = new DeleteObjectCommand({
            Bucket: s3Bucket,
            Key: key
        });

        const result = await s3Client.send(command);

        const apiCallTime = Date.now() - apiCallStart;
        const totalTime = Date.now() - startTime;

        // ============================================================================
        // ANALYTICS
        // ============================================================================
        trackApiUsage({
            userId,
            endpoint: '/api/v1/upload/s3/delete',
            method: 'DELETE',
            provider: 's3',
            operation: 'delete',
            statusCode: 200,
            success: true,
            requestCount: 1,
            apiKeyId,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        console.log(`[${requestId}] ✅ S3 delete: ${key} in ${totalTime}ms (API: ${apiCallTime}ms)`);

        // ============================================================================
        // RESPONSE
        // ============================================================================
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

        // Increment quota (fire-and-forget)
        incrementQuota(userId, 1).catch(() => { });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`[${requestId}] 💥 S3 delete error after ${totalTime}ms:`, error);

        // Handle specific S3 errors
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
            trackApiUsage({
                userId: req.userId || apiKeyId,
                endpoint: '/api/v1/upload/s3/delete',
                method: 'DELETE',
                provider: 's3',
                operation: 'delete',
                statusCode: 500,
                success: false,
                apiKeyId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
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
 * POST /api/v1/upload/s3/batch-delete
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export const batchDeleteS3Files = async (req, res) => {
    const requestId = `batch_del_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    let apiKeyId;

    try {
        const {
            keys,                   // Required: Array of S3 object keys
            s3AccessKey,
            s3SecretKey,
            s3Bucket,
            s3Region = 'us-east-1'
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
        // VALIDATION: Keys Array
        // ============================================================================
        if (!keys || !Array.isArray(keys) || keys.length === 0) {
            return res.status(400).json(formatS3Error(
                'INVALID_KEYS',
                'keys must be a non-empty array',
                'Provide an array of object keys: ["file1.jpg", "file2.png"]'
            ));
        }

        // Validate batch size (AWS limit: 1000)
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
        // QUOTA CHECK
        // ============================================================================
        const quotaCheck = await checkUserQuota(userId);
        if (!quotaCheck.allowed) {
            trackApiUsage({
                userId,
                endpoint: '/api/v1/upload/s3/batch-delete',
                method: 'POST',
                provider: 's3',
                operation: 'batch-delete',
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
        // AWS API CALL: Delete Objects (Batch)
        // ============================================================================
        const apiCallStart = Date.now();

        const s3Client = getS3Client(s3Region, s3AccessKey, s3SecretKey);

        const command = new DeleteObjectsCommand({
            Bucket: s3Bucket,
            Delete: {
                Objects: keys.map(key => ({ Key: key })),
                Quiet: false // Return list of deleted objects
            }
        });

        const result = await s3Client.send(command);

        const apiCallTime = Date.now() - apiCallStart;
        const totalTime = Date.now() - startTime;

        // ============================================================================
        // ANALYTICS
        // ============================================================================
        trackApiUsage({
            userId,
            endpoint: '/api/v1/upload/s3/batch-delete',
            method: 'POST',
            provider: 's3',
            operation: 'batch-delete',
            statusCode: 200,
            success: true,
            requestCount: 1,
            apiKeyId,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        console.log(`[${requestId}] ✅ S3 batch delete: ${keys.length} files in ${totalTime}ms (API: ${apiCallTime}ms)`);

        // ============================================================================
        // RESPONSE
        // ============================================================================
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

        // Increment quota (fire-and-forget)
        incrementQuota(userId, 1).catch(() => { });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`[${requestId}] 💥 S3 batch delete error after ${totalTime}ms:`, error);

        if (apiKeyId) {
            trackApiUsage({
                userId: req.userId || apiKeyId,
                endpoint: '/api/v1/upload/s3/batch-delete',
                method: 'POST',
                provider: 's3',
                operation: 'batch-delete',
                statusCode: 500,
                success: false,
                apiKeyId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }

        return res.status(500).json(formatS3Error(
            'S3_BATCH_DELETE_ERROR',
            'Failed to delete files',
            process.env.NODE_ENV === 'development' ? error.message : null
        ));
    }
};
