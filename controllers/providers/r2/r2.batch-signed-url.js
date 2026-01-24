/**
 * R2 Batch Signed URLs
 * Generate multiple signed URLs in one request using parallel processing
 * 
 * OPTIMIZED: Uses only updateRequestMetrics (Redis-backed)
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
            expiresIn = SIGNED_URL_EXPIRY
        } = req.body;

        const apiKeyId = req.apiKeyId;
        const userId = req.userId || apiKeyId;

        // LAYER 1: Memory Guard
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

        // QUOTA CHECK
        const quotaCheck = await checkUserQuota(userId);
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
        const expiryInt = parseInt(expiresIn);

        if (isNaN(expiryInt) || expiryInt < MIN_EXPIRY || expiryInt > MAX_EXPIRY) {
            return res.status(400).json(formatR2Error(
                'INVALID_EXPIRY',
                `expiresIn must be between ${MIN_EXPIRY} and ${MAX_EXPIRY} seconds`,
                `You provided: ${expiresIn}`
            ));
        }

        // CRYPTO SIGNING: Generate all signed URLs in parallel
        const signingStart = Date.now();
        const client = getR2Client(r2AccountId, r2AccessKey, r2SecretKey);

        const results = await Promise.all(
            files.map(async (file, index) => {
                try {
                    if (!file.filename || !file.contentType) {
                        return {
                            success: false,
                            index,
                            originalFilename: file.filename || `file_${index}`,
                            error: 'MISSING_FILE_DATA',
                            message: 'filename and contentType are required for each file'
                        };
                    }

                    const uniqueFilename = generateR2Filename(file.filename, apiKeyId);

                    const command = new PutObjectCommand({
                        Bucket: r2Bucket,
                        Key: uniqueFilename,
                        ContentType: file.contentType
                    });

                    const uploadUrl = await getSignedUrl(client, command, {
                        expiresIn: expiryInt
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

        const successCount = results.filter(r => r.success).length;
        const failureCount = results.length - successCount;

        // 🚀 SINGLE METRICS CALL (Redis-backed)
        updateRequestMetrics(apiKeyId, userId, 'r2', true)
            .catch(() => { });

        console.log(`[${requestId}] ✅ Batch complete: ${successCount}/${files.length} in ${totalTime}ms`);

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
                    cryptoSigning: `${signingTime}ms`,
                    perFile: `${(signingTime / files.length).toFixed(1)}ms average`
                }
            }
        });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`[${requestId}] ❌ Batch error (${totalTime}ms):`, error.message);

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
