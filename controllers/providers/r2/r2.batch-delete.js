/**
 * R2 Batch Delete
 * Delete multiple files in one request using DeleteObjectsCommand
 * 
 * OPTIMIZED: Uses only updateRequestMetrics (Redis-backed)
 */

import { DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getR2Client, formatR2Error } from './r2.config.js';
import { checkMemoryRateLimit } from './cache/memory-guard.js';

// Quota check
import { checkUserQuota } from '../shared/analytics.new.js';

// 🚀 REDIS METRICS: Single source of truth
import { updateRequestMetrics } from '../shared/metrics.helper.js';

/**
 * Delete multiple R2 files in one request
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export const batchDeleteR2Files = async (req, res) => {
    const requestId = `batch_del_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const startTime = Date.now();

    try {
        const {
            filenames,
            r2AccessKey,
            r2SecretKey,
            r2AccountId,
            r2Bucket
        } = req.body;

        const apiKeyId = req.apiKeyId;
        const userId = req.userId || apiKeyId;

        // LAYER 1: Memory Guard
        const memoryStart = Date.now();
        const memCheck = checkMemoryRateLimit(userId, 'r2-batch-delete');
        const memoryTime = Date.now() - memoryStart;

        if (!memCheck.allowed) {
            return res.status(429).json(formatR2Error(
                'RATE_LIMIT_EXCEEDED',
                'Rate limit exceeded - too many batch delete requests',
                'Wait a moment before submitting another batch delete'
            ));
        }

        // QUOTA CHECK
        const quotaCheck = await checkUserQuota(userId);
        if (!quotaCheck.allowed) {
            return res.status(403).json(formatR2Error(
                'QUOTA_EXCEEDED',
                'Monthly quota exceeded',
                `Used: ${quotaCheck.used}, Limit: ${quotaCheck.limit}`
            ));
        }

        // VALIDATION: Filenames Array
        if (!Array.isArray(filenames) || filenames.length === 0) {
            return res.status(400).json(formatR2Error(
                'INVALID_FILENAMES_ARRAY',
                'filenames must be a non-empty array',
                'Provide an array of file keys to delete: ["file1.jpg", "file2.png", ...]'
            ));
        }

        if (!r2AccessKey || !r2SecretKey || !r2AccountId || !r2Bucket) {
            return res.status(400).json(formatR2Error(
                'MISSING_CREDENTIALS',
                'R2 credentials are required: r2AccessKey, r2SecretKey, r2AccountId, r2Bucket',
                'Include all R2 credentials in request body'
            ));
        }

        // VALIDATION: Batch Size Limit
        const MAX_DELETE_BATCH = 1000;

        if (filenames.length > MAX_DELETE_BATCH) {
            return res.status(400).json(formatR2Error(
                'BATCH_TOO_LARGE',
                `Maximum ${MAX_DELETE_BATCH} files per batch delete request`,
                `You requested ${filenames.length} files. Split into multiple batches.`
            ));
        }

        // R2 API CALL: Batch Delete
        const deleteStart = Date.now();
        const client = getR2Client(r2AccountId, r2AccessKey, r2SecretKey);

        const deleteCommand = new DeleteObjectsCommand({
            Bucket: r2Bucket,
            Delete: {
                Objects: filenames.map(Key => ({ Key })),
                Quiet: false
            }
        });

        const result = await client.send(deleteCommand);

        const deleteTime = Date.now() - deleteStart;
        const totalTime = Date.now() - startTime;

        const deleted = result.Deleted || [];
        const errors = result.Errors || [];
        const deletedCount = deleted.length;
        const errorCount = errors.length;

        // 🚀 SINGLE METRICS CALL (Redis-backed)
        updateRequestMetrics(apiKeyId, userId, 'r2', true)
            .catch(() => { });

        console.log(`[${requestId}] ✅ Batch delete: ${deletedCount}/${filenames.length} in ${totalTime}ms`);

        return res.status(200).json({
            success: true,
            provider: 'r2',
            deleted: deleted.map(d => ({
                key: d.Key,
                versionId: d.VersionId || null,
                deleteMarker: d.DeleteMarker || false
            })),
            errors: errors.map(e => ({
                key: e.Key,
                code: e.Code,
                message: e.Message
            })),
            summary: {
                total: filenames.length,
                deleted: deletedCount,
                failed: errorCount
            },
            performance: {
                requestId,
                totalTime: `${totalTime}ms`,
                breakdown: {
                    memoryGuard: `${memoryTime}ms`,
                    r2ApiCall: `${deleteTime}ms`
                }
            }
        });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`[${requestId}] ❌ Batch delete error (${totalTime}ms):`, error.message);

        if (req.apiKeyId) {
            updateRequestMetrics(req.apiKeyId, req.userId || req.apiKeyId, 2, false)
                .catch(() => { });
        }

        if (error.name === 'NoSuchBucket') {
            return res.status(404).json(formatR2Error(
                'BUCKET_NOT_FOUND',
                'R2 bucket not found',
                `Bucket "${req.body.r2Bucket}" does not exist.`
            ));
        }

        if (error.name === 'AccessDenied') {
            return res.status(403).json(formatR2Error(
                'ACCESS_DENIED',
                'Access denied to R2 bucket',
                'Check that your R2 credentials have delete permissions'
            ));
        }

        return res.status(500).json(formatR2Error(
            'BATCH_DELETE_FAILED',
            'Failed to process batch delete',
            error.message
        ));
    }
};
