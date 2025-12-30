/**
 * R2 Batch Signed URLs
 * Generate multiple signed URLs in one request using parallel processing
 * 
 * Target Performance: 4-5ms per file
 * - 10 files: 50-80ms
 * - 50 files: 200-300ms
 * - 100 files: 400-500ms
 * 
 * Architecture:
 * - Single S3Client creation (reused for all files)
 * - Par allel Promise.all() for maximum speed
 * - Individual error handling per file
 * - Memory Guard rate limiting
 * 
 * Following Rules:
 * - Rule #1: Pure crypto only (NO external API calls)
 * - Rule #5: Same pattern as single signed-url
 * - Rule #8: Clear error messages per file
 */

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
    getR2Client,
    formatR2Error,
    buildPublicUrl,
    SIGNED_URL_EXPIRY,
    MAX_EXPIRY,
    MIN_EXPIRY
} from './r2.config.js';
import { updateR2Metrics, generateR2Filename } from './r2.helpers.js';
import { checkMemoryRateLimit } from './cache/memory-guard.js';

/**
 * Generate multiple R2 signed URLs in one request
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export const generateR2BatchSignedUrls = async (req, res) => {
    const requestId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const startTime = Date.now();

    try {
        const {
            files,                      // Array: [{ filename, contentType, fileSize }, ...]
            r2AccessKey,
            r2SecretKey,
            r2AccountId,
            r2Bucket,
            r2PublicUrl,                // Optional custom domain
            expiresIn = SIGNED_URL_EXPIRY  // Default: 1 hour
        } = req.body;

        const apiKeyId = req.apiKeyId;
        const userId = req.userId || apiKeyId;

        console.log(`[${requestId}] 📦 Batch signed URL request for ${files?.length || 0} files`);

        // ============================================================================
        // LAYER 1: Memory Guard (Target: 0-2ms)
        // Rate limit batch requests (they're more resource-intensive)
        // ============================================================================
        const memoryStart = Date.now();
        const memCheck = checkMemoryRateLimit(userId, 'r2-batch');
        const memoryTime = Date.now() - memoryStart;

        if (!memCheck.allowed) {
            console.log(`[${requestId}] ❌ Blocked by memory guard in ${memoryTime}ms`);
            return res.status(429).json(formatR2Error(
                'RATE_LIMIT_EXCEEDED',
                'Rate limit exceeded - too many batch requests',
                'Wait a moment before submitting another batch'
            ));
        }

        // ============================================================================
        // VALIDATION: Required Fields
        // ============================================================================
        if (!Array.isArray(files) || files.length === 0) {
            return res.status(400).json(formatR2Error(
                'INVALID_FILES_ARRAY',
                'files must be a non-empty array',
                'Provide an array of files: [{ filename, contentType, fileSize }, ...]'
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
        // VALIDATION: Batch Size Limit
        // ============================================================================
        const MAX_BATCH_SIZE = 100;

        if (files.length > MAX_BATCH_SIZE) {
            return res.status(400).json(formatR2Error(
                'BATCH_TOO_LARGE',
                `Maximum ${MAX_BATCH_SIZE} files per batch request`,
                `You requested ${files.length} files. Split into multiple batches.`
            ));
        }

        // ============================================================================
        // VALIDATION: Expiry Time
        // ============================================================================
        const expiryInt = parseInt(expiresIn);

        if (isNaN(expiryInt) || expiryInt < MIN_EXPIRY || expiryInt > MAX_EXPIRY) {
            return res.status(400).json(formatR2Error(
                'INVALID_EXPIRY',
                `expiresIn must be between ${MIN_EXPIRY} and ${MAX_EXPIRY} seconds`,
                `You provided: ${expiresIn}`
            ));
        }

        // ============================================================================
        // CRYPTO SIGNING: Generate all signed URLs in parallel
        // Creating S3Client ONCE and reusing for all files (efficient!)
        // ============================================================================
        const signingStart = Date.now();

        // Create R2 client once (reused for all files)
        const client = getR2Client(r2AccountId, r2AccessKey, r2SecretKey);

        // Process all files in parallel using Promise.all()
        const results = await Promise.all(
            files.map(async (file, index) => {
                try {
                    // Validate individual file
                    if (!file.filename || !file.contentType) {
                        return {
                            success: false,
                            index,
                            originalFilename: file.filename || `file_${index}`,
                            error: 'MISSING_FILE_DATA',
                            message: 'filename and contentType are required for each file'
                        };
                    }

                    // Generate unique filename
                    const uniqueFilename = generateR2Filename(file.filename, apiKeyId);

                    // Create PutObject command
                    const command = new PutObjectCommand({
                        Bucket: r2Bucket,
                        Key: uniqueFilename,
                        ContentType: file.contentType
                    });

                    // Generate presigned URL (pure crypto!)
                    const uploadUrl = await getSignedUrl(client, command, {
                        expiresIn: expiryInt
                    });

                    // Build public URL
                    const publicUrl = buildPublicUrl(r2AccountId, r2Bucket, uniqueFilename, r2PublicUrl);

                    return {
                        success: true,
                        index,
                        originalFilename: file.filename,
                        uploadFilename: uniqueFilename,
                        uploadUrl,
                        publicUrl,
                        contentType: file.contentType,
                        fileSize: file.fileSize || null
                    };

                } catch (fileError) {
                    return {
                        success: false,
                        index,
                        originalFilename: file.filename || `file_${index}`,
                        error: 'SIGNING_FAILED',
                        message: fileError.message
                    };
                }
            })
        );

        const signingTime = Date.now() - signingStart;
        const totalTime = Date.now() - startTime;

        // Calculate success stats
        const successCount = results.filter(r => r.success).length;
        const failureCount = results.length - successCount;

        console.log(`[${requestId}] ✅ Batch complete in ${totalTime}ms (${successCount}/${files.length} successful, ${signingTime}ms signing)`);

        // ============================================================================
        // ANALYTICS: Non-blocking metrics update
        // ============================================================================
        updateR2Metrics(apiKeyId, userId, 'r2', 'success', 0, {
            operation: 'batch-signed-urls',
            filesRequested: files.length,
            filesSuccessful: successCount,
            filesFailed: failureCount,
            responseTime: totalTime
        }).catch(() => { });

        // ============================================================================
        // RESPONSE: Same format as other R2 operations
        // ============================================================================
        return res.status(200).json({
            success: true,
            provider: 'r2',
            results,
            summary: {
                total: files.length,
                successful: successCount,
                failed: failureCount
            },
            expiresIn: expiryInt,
            expiresAt: new Date(Date.now() + expiryInt * 1000).toISOString(),
            performance: {
                requestId,
                totalTime: `${totalTime}ms`,
                breakdown: {
                    memoryGuard: `${memoryTime}ms`,
                    cryptoSigning: `${signingTime}ms`,  // Pure crypto - NO API calls!
                    perFile: `${(signingTime / files.length).toFixed(1)}ms average`
                }
            }
        });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`[${requestId}] ❌ Batch error (${totalTime}ms):`, error.message);

        // Track failed request
        if (req.apiKeyId) {
            updateR2Metrics(req.apiKeyId, req.userId, 'r2', 'failed', 0, {
                operation: 'batch-signed-urls',
                error: error.message,
                responseTime: totalTime
            }).catch(() => { });
        }

        return res.status(500).json(formatR2Error(
            'BATCH_OPERATION_FAILED',
            'Failed to process batch signed URLs',
            error.message
        ));
    }
};
