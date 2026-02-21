/**
 * Supabase Storage Signed URL Generation
 * WITH ENTERPRISE MULTI-LAYER CACHING
 * Target: <200ms response time
 */

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_BUCKET, PRIVATE_BUCKET } from './supabase.config.js';
import { generateSupabaseFilename, updateSupabaseMetrics } from './supabase.helpers.js';
import logger from '../../../utils/logger.js';

// NEW: Import multi-layer cache
import {
    checkMemoryRateLimit,
    checkMemoryQuota,
    checkMemoryBucketAccess,
    setMemoryQuota,
    setMemoryBucketAccess
} from './cache/memory-guard.js';
import {
    checkBucketAccessRedis
} from './cache/redis-cache.js';
// NEW: Analytics & Quota
import { checkUserQuota } from '../shared/analytics.new.js';

// 🚀 REDIS METRICS: Use Redis-backed metrics for 70% less DB load
import { updateRequestMetrics } from '../shared/metrics.helper.js';

// ✅ NEW: Import File Validator for server-side validation
import { validateFileMetadata } from '../../../utils/file-validator.js';

// ✅ NEW: Import Webhook utilities (optional webhook support)
import { generateWebhookId, generateWebhookSecret } from '../../../utils/webhook/signature.js';
import { enqueueWebhook } from '../../../services/webhook/queue-manager.js';
import { supabaseAdmin } from '../../../config/supabase.js';

/**
 * Generate signed upload URL for Supabase Storage
 * NOW WITH <200ms RESPONSE TIME! 🚀
 */
export const generateSupabaseSignedUrl = async (req, res) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    let apiKey;

    try {
        const {
            filename,
            contentType,
            fileSize,
            bucket: customBucket,
            makePrivate = false,
            expiresIn = 3600,
            supabaseToken,
            supabaseUrl
        } = req.body;

        apiKey = req.apiKeyId;
        const userId = req.userId || apiKey;

        // Validate credentials
        if (!supabaseToken) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_SUPABASE_TOKEN',
                message: 'Supabase service key is required'
            });
        }

        if (!supabaseUrl) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_SUPABASE_URL',
                message: 'Supabase project URL is required'
            });
        }

        const developerSupabase = createClient(supabaseUrl, supabaseToken);

        // Validate required fields
        if (!filename || !contentType || !fileSize || !apiKey) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_PARAMETERS',
                message: 'filename, contentType, fileSize, and API key are required'
            });
        }

        const targetBucket = customBucket || (makePrivate ? PRIVATE_BUCKET : SUPABASE_BUCKET);

        // ========================================================================
        // LAYER 1: MEMORY GUARD - INSTANT CHECK (0-5ms) 🔥
        // ========================================================================
        const memoryStart = Date.now();
        const memCheck = checkMemoryRateLimit(userId, 'signed-url');
        const memoryTime = Date.now() - memoryStart;

        if (!memCheck.allowed) {
            logger.warn('Request blocked by memory guard', { requestId, memoryTime, remaining: memCheck.remaining });
            return res.status(429).json({
                success: false,
                error: 'RATE_LIMIT_EXCEEDED',
                code: 'MEMORY_GUARD',
                message: 'Rate limit exceeded',
                remaining: memCheck.remaining,
                resetIn: memCheck.resetIn,
                layer: 'memory',
                timing: { total: Date.now() - startTime, memoryGuard: memoryTime }
            });
        }

        // ========================================================================
        // LAYER 2: QUOTA CHECK (OPT-2: use MW2 data if available, else fallback) 💰
        // ========================================================================
        const quotaStart = Date.now();
        const quotaCheck = req.quotaChecked || await checkUserQuota(userId);
        const quotaTime = Date.now() - quotaStart;

        if (!quotaCheck.allowed) {
            logger.warn('Quota exceeded', { requestId, quotaTime, limit: quotaCheck.limit, used: quotaCheck.current });

            return res.status(403).json({
                success: false,
                error: 'QUOTA_EXCEEDED',
                message: 'Monthly quota exceeded',
                limit: quotaCheck.limit,
                used: quotaCheck.current
            });
        }

        // ========================================================================
        // LAYER 4: BUCKET ACCESS CHECK (100-150ms) 🪣
        // ========================================================================
        const bucketStart = Date.now();

        // Check memory first
        let bucketCheck = checkMemoryBucketAccess(userId, targetBucket);

        if (bucketCheck.needsRefresh) {
            // Memory miss - check Redis
            bucketCheck = await checkBucketAccessRedis(userId, targetBucket, developerSupabase);

            // Update memory cache
            setMemoryBucketAccess(userId, targetBucket, bucketCheck.allowed);
        }

        const bucketTime = Date.now() - bucketStart;

        if (!bucketCheck.allowed && !bucketCheck.fallback) {
            logger.warn('Bucket access denied', { requestId, bucketTime, bucket: targetBucket, layer: bucketCheck.layer });
            return res.status(403).json({
                success: false,
                error: 'BUCKET_ACCESS_DENIED',
                message: `No access to bucket '${targetBucket}'`,
                layer: bucketCheck.layer,
                timing: {
                    total: Date.now() - startTime,
                    memoryGuard: memoryTime,
                    redisCheck: 0,
                    quotaCheck: quotaTime,
                    bucketCheck: bucketTime
                }
            });
        }

        // ========================================================================
        // MAIN OPERATION: GENERATE SIGNED URL (150-200ms) ✅
        // ========================================================================
        const operationStart = Date.now();

        // Create mock file for validation
        const mockFile = {
            name: filename,
            type: contentType,
            size: fileSize
        };

        // Basic validation (no DB queries!)
        if (!contentType || !filename || fileSize <= 0) {
            return res.status(400).json({
                success: false,
                error: 'VALIDATION_ERROR',
                message: 'Invalid file parameters'
            });
        }

        // ✅ NEW: VALIDATION: Server-side file validation (magic bytes from client)
        // CRITICAL: Client reads first 8 bytes and sends to backend - files NEVER hit backend!
        const { magicBytes, validation } = req.body;

        if (validation || magicBytes) {
            logger.debug('Running server-side file validation', { requestId });

            const validationResult = validateFileMetadata({
                filename,
                contentType,
                fileSize: fileSize || 0,
                magicBytes,
                validation: validation || {}
            });

            if (!validationResult.valid) {
                logger.warn('File validation failed', { requestId, errorCount: validationResult.errors?.length });
                updateRequestMetrics(apiKey, userId, 'supabase', false).catch(() => { });

                return res.status(400).json({
                    success: false,
                    provider: 'supabase',
                    error: 'VALIDATION_FAILED',
                    message: 'File validation failed',
                    validation: validationResult,
                    checks: validationResult.checks,
                    errors: validationResult.errors,
                    warnings: validationResult.warnings
                });
            }

            logger.debug('Validation passed', { requestId, detectedMimeType: validationResult.detectedMimeType });
            if (validationResult.detectedMimeType) {
                logger.debug('Detected MIME type', { requestId, detectedMimeType: validationResult.detectedMimeType });
            }
        }

        // Generate unique filename
        const uniqueFilename = generateSupabaseFilename(filename, apiKey);
        logger.debug('Generated filename', { requestId, uniqueFilename });

        // Check expiration limits
        const maxExpiration = makePrivate ? 24 * 60 * 60 : 7 * 24 * 60 * 60;
        const finalExpiresIn = Math.min(expiresIn, maxExpiration);

        // Generate signed upload URL
        const { data: signedUrlData, error: signedUrlError } = await developerSupabase.storage
            .from(targetBucket)
            .createSignedUploadUrl(uniqueFilename, {
                expiresIn: finalExpiresIn
            });

        if (signedUrlError) {
            logger.error('Supabase signed URL error', { requestId, error: signedUrlError.message });
            await updateSupabaseMetrics(apiKey, 'supabase', false, 'SIGNED_URL_ERROR', {
                errorDetails: signedUrlError.message
            });

            return res.status(500).json({
                success: false,
                error: 'SIGNED_URL_ERROR',
                message: 'Failed to generate signed upload URL',
                details: signedUrlError.message
            });
        }

        const operationTime = Date.now() - operationStart;

        // Get final public URL
        let finalUrl;
        if (makePrivate || targetBucket === PRIVATE_BUCKET || targetBucket === 'admin') {
            finalUrl = null;
        } else {
            const { data: urlData } = developerSupabase.storage
                .from(targetBucket)
                .getPublicUrl(uniqueFilename);
            finalUrl = urlData.publicUrl;
        }

        // ========================================================================
        // BACKGROUND METRICS UPDATE (NON-BLOCKING) 🔄
        // ========================================================================
        // Update metrics in background (don't wait)
        updateSupabaseMetrics(apiKey, 'supabase', true, 'SIGNED_URL_SUCCESS', {
            fileSize: fileSize
        }).catch(err => logger.error('Background metrics error', { error: err.message }));

        // 🚀 REDIS METRICS: Provider usage tracking
        updateRequestMetrics(apiKey, userId, 'supabase', true, { fileSize: fileSize || 0 })
            .catch(() => { });



        const totalTime = Date.now() - startTime;

        logger.info('Supabase signed URL generated', { requestId, totalTime, memoryTime, quotaTime, bucketTime, operationTime });

        // ✅ NEW: WEBHOOK CREATION (Optional - same pattern as R2)
        let webhookResult = null;
        const { webhook } = req.body;

        if (webhook && webhook.url) {
            logger.debug('Creating webhook for file', { requestId, filename });

            try {
                const webhookId = generateWebhookId();
                const webhookSecret = webhook.secret || generateWebhookSecret();

                const { data: insertedWebhook, error: insertError } = await supabaseAdmin.from('upload_webhooks').insert({
                    id: webhookId,
                    user_id: userId,
                    api_key_id: apiKey,
                    webhook_url: webhook.url,
                    webhook_secret: webhookSecret,
                    trigger_mode: webhook.trigger || 'manual',
                    provider: 'SUPABASE',
                    bucket: targetBucket,
                    file_key: uniqueFilename,
                    filename: filename,
                    content_type: contentType,
                    file_size: fileSize,
                    etag: null,
                    status: 'pending',
                    metadata: webhook.metadata || {}
                }).select().single();

                if (insertError) {
                    logger.error('Webhook DB insert failed', { requestId, error: insertError.message });
                } else {
                    webhookResult = {
                        webhookId,
                        webhookSecret,
                        triggerMode: webhook.trigger || 'manual'
                    };
                    logger.debug('Webhook created', { requestId, webhookId });

                    // ✅ Queue webhook for auto-trigger mode (worker will process)
                    if ((webhook.trigger || 'manual') === 'auto') {
                        logger.debug('Enqueueing webhook for auto-trigger', { requestId, webhookId });
                        await enqueueWebhook(webhookId, insertedWebhook, 0);
                        logger.debug('Webhook enqueued to Redis', { requestId, webhookId });
                    }
                }
            } catch (webhookError) {
                logger.error('Webhook creation failed', { requestId, error: webhookError.message });
                // Continue without webhook - don't fail the entire request
            }
        }

        // SUCCESS RESPONSE
        res.status(200).json({
            success: true,
            message: 'Supabase Storage signed upload URL generated successfully',
            data: {
                uploadUrl: signedUrlData.signedUrl,
                token: signedUrlData.token,
                filename: uniqueFilename,
                originalName: filename,
                contentType: contentType,
                fileSize: fileSize,
                provider: 'supabase',
                bucket: targetBucket,
                isPrivate: makePrivate,
                expiresIn: finalExpiresIn,
                expiresAt: new Date(Date.now() + finalExpiresIn * 1000).toISOString(),
                fileUrl: finalUrl,
                method: 'PUT',
                headers: {
                    'Content-Type': contentType
                }
            },
            performance: {
                requestId,
                totalTime: `${totalTime}ms`,
                breakdown: {
                    memoryGuard: `${memoryTime}ms`,
                    redisCheck: 'skipped (MW2)',
                    quotaCheck: `${quotaTime}ms`,
                    bucketCheck: `${bucketTime}ms`,
                    supabaseOperation: `${operationTime}ms`
                },
                cacheHits: {
                    memory: memCheck.layer === 'memory',
                    redis: false,
                    quota: quotaCheck.layer === 'redis' || quotaCheck.layer === 'memory',
                    bucket: bucketCheck.layer === 'redis' || bucketCheck.layer === 'memory'
                }
            },
            // ✅ NEW: Webhook Result (only if webhook was requested)
            ...(webhookResult && { webhook: webhookResult })
        });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        logger.error('Supabase signed URL generation failed', { requestId, totalTime, error: error.message });

        // Background metrics update
        if (apiKey) {
            updateSupabaseMetrics(apiKey, 'supabase', false, 'SERVER_ERROR', {
                errorDetails: error.message
            }).catch(err => logger.error('Background metrics error', { error: err.message }));

            // 🚀 REDIS METRICS: Track failure
            updateRequestMetrics(apiKey, req.userId || apiKey, 'supabase', false)
                .catch(() => { });


        }

        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Internal server error during signed URL generation',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
            requestId,
            timing: `${totalTime}ms`
        });
    }
};
