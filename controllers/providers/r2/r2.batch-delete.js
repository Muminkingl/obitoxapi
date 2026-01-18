/**
 * R2 Batch Delete
 * Delete multiple files in one request using DeleteObjectsCommand
 * 
 * Target Performance:
 * - 10 files: 200-400ms
 * - 100 files: 300-600ms
 * - 1000 files: 800-1200ms
 * 
 * Architecture:
 * - Single DeleteObjectsCommand (ONE R2 API call for all files!)
 * - Max 1000 files (R2/S3 limit)
 * - Returns detailed deleted + errors arrays
 * - Memory Guard rate limiting
 * 
 * Following Rules:
 * - Rule #8: Clear error reporting per file
 * - Rule #9: Same metrics tracking
 * - Rule #6: Non-blocking analytics
 */

import { DeleteObjectsCommand } from '@aws-sdk/client-s3';
import {
    getR2Client,
    formatR2Error
} from './r2.config.js';
import { updateR2Metrics } from './r2.helpers.js';
import { checkMemoryRateLimit } from './cache/memory-guard.js';

// NEW: Analytics & Quota
import { checkUserQuota, trackApiUsage } from '../shared/analytics.new.js';

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
            filenames,              // Array of file keys to delete
            r2AccessKey,
            r2SecretKey,
            r2AccountId,
            r2Bucket
        } = req.body;

        const apiKeyId = req.apiKeyId;
        const userId = req.userId || apiKeyId;

        console.log(`[${requestId}] 🗑️  Batch delete request for ${filenames?.length || 0} files`);

        // ============================================================================
        // LAYER 1: Memory Guard (Target: 0-2ms)
        // Rate limit batch delete requests
        // ============================================================================
        const memoryStart = Date.now();
        const memCheck = checkMemoryRateLimit(userId, 'r2-batch-delete');
        const memoryTime = Date.now() - memoryStart;

        if (!memCheck.allowed) {
            console.log(`[${requestId}] ❌ Blocked by memory guard in ${memoryTime}ms`);
            return res.status(429).json(formatR2Error(
                'RATE_LIMIT_EXCEEDED',
                'Rate limit exceeded - too many batch delete requests',
                'Wait a moment before submitting another batch delete'
            ));
        }

        // ========================================================================
        // QUOTA CHECK (Database RPC) 💰
        // ========================================================================
        const quotaCheck = await checkUserQuota(userId);
        if (!quotaCheck.allowed) {
            trackApiUsage({
                userId,
                endpoint: '/api/v1/upload/r2/batch/delete',
                method: 'DELETE',
                provider: 'r2',
                operation: 'batch-delete',
                statusCode: 403,
                success: false,
                apiKeyId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
            return res.status(403).json(formatR2Error(
                'QUOTA_EXCEEDED',
                'Monthly quota exceeded',
                `Used: ${quotaCheck.used}, Limit: ${quotaCheck.limit}`
            ));
        }

        // ============================================================================
        // VALIDATION: Required Fields
        // ============================================================================
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

        // ============================================================================
        // VALIDATION: Batch Size Limit (R2/S3 API Limit)
        // ============================================================================
        const MAX_DELETE_BATCH = 1000;  // R2/S3 DeleteObjects limit

        if (filenames.length > MAX_DELETE_BATCH) {
            return res.status(400).json(formatR2Error(
                'BATCH_TOO_LARGE',
                `Maximum ${MAX_DELETE_BATCH} files per batch delete request`,
                `You requested ${filenames.length} files. This is an R2/S3 API limit. Split into multiple batches.`
            ));
        }

        // ============================================================================
        // R2 API CALL: Batch Delete (Single API call for all files!)
        // ============================================================================
        const deleteStart = Date.now();

        // Create R2 client
        const client = getR2Client(r2AccountId, r2AccessKey, r2SecretKey);

        // Create DeleteObjects command
        const deleteCommand = new DeleteObjectsCommand({
            Bucket: r2Bucket,
            Delete: {
                Objects: filenames.map(Key => ({ Key })),
                Quiet: false  // Return detailed results (both deleted and errors)
            }
        });

        // Execute batch delete (ONE R2 API call!)
        const result = await client.send(deleteCommand);

        const deleteTime = Date.now() - deleteStart;
        const totalTime = Date.now() - startTime;

        // Extract results
        const deleted = result.Deleted || [];
        const errors = result.Errors || [];
        const deletedCount = deleted.length;
        const errorCount = errors.length;

        console.log(`[${requestId}] ✅ Batch delete complete in ${totalTime}ms (${deletedCount}/${filenames.length} deleted, API: ${deleteTime}ms)`);

        // ============================================================================
        // ANALYTICS: Non-blocking metrics update
        // ============================================================================
        updateR2Metrics(apiKeyId, userId, 'r2', 'success', 0, {
            operation: 'batch-delete',
            filesRequested: filenames.length,
            filesDeleted: deletedCount,
            filesFailed: errorCount,
            responseTime: totalTime
        }).catch(() => { });

        // New Usage Tracking
        trackApiUsage({
            userId,
            endpoint: '/api/v1/upload/r2/batch/delete',
            method: 'DELETE',
            provider: 'r2',
            operation: 'batch-delete',
            statusCode: 200,
            success: true,
            requestCount: filenames.length, // Count as N requests or 1? Plan says "1 request" usually, but batch might be different. Let's count as 1 batch operation but maybe log count in metadata? trackApiUsage schema has request_count. Let's use it.
            apiKeyId,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        // ============================================================================
        // RESPONSE: Detailed results with success/error arrays
        // ============================================================================
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
                    r2ApiCall: `${deleteTime}ms`  // Single API call to R2
                }
            }
        });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`[${requestId}] ❌ Batch delete error (${totalTime}ms):`, error.message);

        // Track failed request
        if (req.apiKeyId) {
            updateR2Metrics(req.apiKeyId, req.userId, 'r2', 'failed', 0, {
                operation: 'batch-delete',
                error: error.message,
                responseTime: totalTime
            }).catch(() => { });

            trackApiUsage({
                userId: req.userId || req.apiKeyId,
                endpoint: '/api/v1/upload/r2/batch/delete',
                method: 'DELETE',
                provider: 'r2',
                operation: 'batch-delete',
                statusCode: 500,
                success: false,
                apiKeyId: req.apiKeyId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }

        // Handle specific R2/S3 errors
        if (error.name === 'NoSuchBucket') {
            return res.status(404).json(formatR2Error(
                'BUCKET_NOT_FOUND',
                'R2 bucket not found',
                `Bucket "${req.body.r2Bucket}" does not exist. Check your bucket name.`
            ));
        }

        if (error.name === 'AccessDenied') {
            return res.status(403).json(formatR2Error(
                'ACCESS_DENIED',
                'Access denied to R2 bucket',
                'Check that your R2 credentials have delete permissions for this bucket'
            ));
        }

        return res.status(500).json(formatR2Error(
            'BATCH_DELETE_FAILED',
            'Failed to process batch delete',
            error.message
        ));
    }
};
