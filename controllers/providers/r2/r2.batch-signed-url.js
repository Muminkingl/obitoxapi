/**
 * R2 Batch Signed URLs (Enhanced)
 * Generate multiple signed URLs with validation + smart expiry
 * 
 * OPTIMIZED: Pure crypto signing, validation integration, smart expiry
 * 
 * @file controllers/providers/r2/r2.batch-signed-url.js
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
import { generateR2Filename } from './r2.helpers.js';
import { checkMemoryRateLimit } from './cache/memory-guard.js';

// Quota check
import { checkUserQuota } from '../shared/analytics.new.js';

// 🚀 REDIS METRICS: Single source of truth
import { updateRequestMetrics } from '../shared/metrics.helper.js';

// ✅ NEW: Import File Validator for server-side validation
import { validateFileMetadata } from '../../../utils/file-validator.js';

// ✅ NEW: Import Smart Expiry calculator
import { calculateSmartExpiry } from '../../../utils/smart-expiry.js';
import logger from '../../../utils/logger.js';

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
            files,
            r2AccessKey,
            r2SecretKey,
            r2AccountId,
            r2Bucket,
            r2PublicUrl,
            expiresIn: requestedExpiresIn = SIGNED_URL_EXPIRY,
            // ✅ NEW: Validation options (optional)
            validation,
            // ✅ NEW: Smart expiry options (optional)
            networkInfo,
            bufferMultiplier,
            minExpirySeconds,
            maxExpirySeconds
        } = req.body;

        const apiKeyId = req.apiKeyId;
        const userId = req.userId || apiKeyId;

        // LAYER 1: Memory Guard (fastest possible)
        const memoryStart = Date.now();
        const memCheck = checkMemoryRateLimit(userId, 'r2-batch');
        const memoryTime = Date.now() - memoryStart;

        if (!memCheck.allowed) {
            return res.status(429).json(formatR2Error(
                'RATE_LIMIT_EXCEEDED',
                'Rate limit exceeded - too many batch requests',
                'Wait a moment before submitting another batch'
            ));
        }

        // QUOTA CHECK (OPT-2: use MW2 data if available, else fallback)
        const quotaCheck = req.quotaChecked || await checkUserQuota(userId);
        if (!quotaCheck.allowed) {
            return res.status(429).json(formatR2Error(
                'QUOTA_EXCEEDED',
                'Monthly quota exceeded',
                'Please upgrade your plan'
            ));
        }

        // VALIDATION: Files Array
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

        // VALIDATION: Batch Size Limit
        const MAX_BATCH_SIZE = 100;

        if (files.length > MAX_BATCH_SIZE) {
            return res.status(400).json(formatR2Error(
                'BATCH_TOO_LARGE',
                `Maximum ${MAX_BATCH_SIZE} files per batch request`,
                `You requested ${files.length} files. Split into multiple batches.`
            ));
        }

        // VALIDATION: Expiry Time
        const expiryInt = parseInt(requestedExpiresIn);

        if (isNaN(expiryInt) || expiryInt < MIN_EXPIRY || expiryInt > MAX_EXPIRY) {
            return res.status(400).json(formatR2Error(
                'INVALID_EXPIRY',
                `expiresIn must be between ${MIN_EXPIRY} and ${MAX_EXPIRY} seconds`,
                `You provided: ${requestedExpiresIn}`
            ));
        }

        // CRYPTO SIGNING: Generate all signed URLs in parallel
        const signingStart = Date.now();
        const client = getR2Client(r2AccountId, r2AccessKey, r2SecretKey);

        const results = await Promise.all(
            files.map(async (file, index) => {
                try {
                    // VALIDATION: Required fields
                    if (!file.filename || !file.contentType) {
                        return {
                            success: false,
                            index,
                            originalFilename: file.filename || `file_${index}`,
                            error: 'MISSING_FILE_DATA',
                            message: 'filename and contentType are required for each file'
                        };
                    }

                    // ✅ NEW: Server-side file validation (metadata + magic bytes)
                    // CRITICAL: Files never touch server - client sends magic bytes!
                    if (validation || file.magicBytes) {
                        const validationResult = validateFileMetadata({
                            filename: file.filename,
                            contentType: file.contentType,
                            fileSize: file.fileSize || 0,
                            magicBytes: file.magicBytes,
                            validation: validation || {}
                        });

                        if (!validationResult.valid) {
                            return {
                                success: false,
                                index,
                                originalFilename: file.filename,
                                error: 'VALIDATION_FAILED',
                                validationErrors: validationResult.errors,
                                checks: validationResult.checks
                            };
                        }
                    }

                    // ✅ NEW: Smart Expiry Calculation
                    // Calculate optimal expiry per file based on file size
                    let fileExpiry = expiryInt;
                    let smartExpiryResult = null;

                    if (file.fileSize && file.fileSize > 0) {
                        smartExpiryResult = calculateSmartExpiry({
                            fileSize: file.fileSize,
                            networkInfo: networkInfo || {},
                            bufferMultiplier: bufferMultiplier || 1.5,
                            minExpirySeconds: minExpirySeconds || 60,
                            maxExpirySeconds: maxExpirySeconds || MAX_EXPIRY
                        });
                        fileExpiry = smartExpiryResult.expirySeconds;
                    }

                    const uniqueFilename = generateR2Filename(file.filename, apiKeyId);

                    const command = new PutObjectCommand({
                        Bucket: r2Bucket,
                        Key: uniqueFilename,
                        ContentType: file.contentType
                    });

                    const uploadUrl = await getSignedUrl(client, command, {
                        expiresIn: fileExpiry
                    });

                    const publicUrl = buildPublicUrl(r2AccountId, r2Bucket, uniqueFilename, r2PublicUrl);

                    return {
                        success: true,
                        index,
                        originalFilename: file.filename,
                        uploadFilename: uniqueFilename,
                        uploadUrl,
                        publicUrl,
                        contentType: file.contentType,
                        fileSize: file.fileSize || null,
                        // ✅ NEW: Smart expiry info per file
                        expiresIn: fileExpiry,
                        expiresAt: new Date(Date.now() + fileExpiry * 1000).toISOString(),
                        // ✅ NEW: Smart expiry details
                        smartExpiry: smartExpiryResult ? {
                            calculatedExpiry: smartExpiryResult.expirySeconds,
                            estimatedUploadTime: smartExpiryResult.estimatedUploadTime,
                            networkType: smartExpiryResult.networkType,
                            bufferTime: smartExpiryResult.bufferTime,
                            reasoning: smartExpiryResult.reasoning
                        } : null
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

        const successCount = results.filter(r => r.success).length;
        const failureCount = results.length - successCount;

        // Calculate total bytes for successful uploads
        const totalBytes = results
            .filter(r => r.success && r.fileSize)
            .reduce((sum, r) => sum + r.fileSize, 0);

        // 🚀 SINGLE METRICS CALL (Redis-backed)
        updateRequestMetrics(apiKeyId, userId, 'r2', successCount > 0, {
            fileSize: totalBytes,
            batchSize: files.length,
            successCount,
            failureCount
        }).catch(() => { });

        logger.info(`[${requestId}] ✅ Batch complete: ${successCount}/${files.length} in ${totalTime}ms`);

        return res.status(200).json({
            success: true,
            provider: 'r2',
            results,
            summary: {
                total: files.length,
                successful: successCount,
                failed: failureCount,
                totalBytes
            },
            performance: {
                requestId,
                totalTime: `${totalTime}ms`,
                breakdown: {
                    memoryGuard: `${memoryTime}ms`,
                    cryptoSigning: `${signingTime}ms`,
                    perFile: `${(signingTime / files.length).toFixed(1)}ms average`
                }
            }
        });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        logger.error(`r2 error:`, { error });

        if (req.apiKeyId) {
            updateRequestMetrics(req.apiKeyId, req.userId || req.apiKeyId, 'r2', false)
                .catch(() => { });
        }

        return res.status(500).json(formatR2Error(
            'BATCH_OPERATION_FAILED',
            'Failed to process batch signed URLs',
            error.message
        ));
    }
};
