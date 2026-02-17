/**
 * Generate Presigned URL for Cloudflare R2 Upload
 * CRITICAL PERFORMANCE: Pure cryptographic signing (5-10ms, ZERO external API calls)
 * 
 * OPTIMIZED: Uses only updateRequestMetrics (Redis-backed)
 */

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
    validateR2Credentials,
    validateExpiry,
    validateFileSize,
    getR2Client,
    buildPublicUrl,
    formatR2Error,
    SIGNED_URL_EXPIRY
} from './r2.config.js';
import { generateR2Filename } from './r2.helpers.js';
import { checkUserQuota } from '../shared/analytics.new.js';
import { incrementQuota, checkUsageWarnings } from '../../../utils/quota-manager.js';

// 🚀 REDIS METRICS: Single source of truth
import { updateRequestMetrics } from '../shared/metrics.helper.js';

// Import memory guard only (Redis not needed for pure crypto!)
import { checkMemoryRateLimit } from './cache/memory-guard.js';

// ✅ NEW: Import File Validator for server-side validation
import { validateFileMetadata } from '../../../utils/file-validator.js';

// ✅ NEW: Import Smart Expiry calculator
import { calculateSmartExpiry } from '../../../utils/smart-expiry.js';

// ✅ NEW: Import Webhook utilities
import { generateWebhookId, generateWebhookSecret } from '../../../utils/webhook/signature.js';
import { supabaseAdmin } from '../../../config/supabase.js';

/**
 * Generate presigned URL for R2 upload
 * Target Performance: 5-15ms P95
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export const generateR2SignedUrl = async (req, res) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    let apiKeyId;

    try {
        const {
            filename,
            contentType,
            fileSize,
            r2AccessKey,
            r2SecretKey,
            r2AccountId,
            r2Bucket,
            r2PublicUrl,
            expiresIn: requestedExpiresIn = SIGNED_URL_EXPIRY
        } = req.body;

        // Use let so smart expiry can override
        let expiresIn = requestedExpiresIn;

        apiKeyId = req.apiKeyId;
        const userId = req.userId || apiKeyId;

        if (!apiKeyId) {
            return res.status(401).json(formatR2Error(
                'UNAUTHORIZED',
                'API key is required'
            ));
        }

        // LAYER 1: Memory Guard (Target: 0-2ms)
        const memoryStart = Date.now();
        const memCheck = checkMemoryRateLimit(userId, 'upload');
        const memoryTime = Date.now() - memoryStart;

        if (!memCheck.allowed) {
            return res.status(429).json(formatR2Error(
                'RATE_LIMIT_EXCEEDED',
                'Rate limit exceeded - too many requests',
                'Wait a moment and try again'
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

        // VALIDATION: Required Fields
        if (!filename || !contentType) {
            updateRequestMetrics(apiKeyId, userId, 'r2', false).catch(() => { });

            return res.status(400).json(formatR2Error(
                'MISSING_PARAMETERS',
                'filename and contentType are required',
                'Provide filename and contentType in request body'
            ));
        }

        if (!r2AccessKey || !r2SecretKey || !r2AccountId || !r2Bucket) {
            updateRequestMetrics(apiKeyId, userId, 'r2', false).catch(() => { });

            return res.status(400).json(formatR2Error(
                'MISSING_R2_CREDENTIALS',
                'R2 credentials are required: r2AccessKey, r2SecretKey, r2AccountId, r2Bucket',
                'Get your R2 credentials from Cloudflare Dashboard → R2 → Manage R2 API Tokens'
            ));
        }

        // VALIDATION: Credential Format
        const credValidation = validateR2Credentials(r2AccessKey, r2SecretKey, r2AccountId, r2Bucket);
        if (!credValidation.valid) {
            updateRequestMetrics(apiKeyId, userId, 'r2', false).catch(() => { });

            return res.status(400).json({
                success: false,
                provider: 'r2',
                ...credValidation
            });
        }

        // VALIDATION: File Size
        if (fileSize) {
            const sizeValidation = validateFileSize(fileSize);
            if (!sizeValidation.valid) {
                updateRequestMetrics(apiKeyId, userId, 'r2', false).catch(() => { });

                return res.status(400).json({
                    success: false,
                    provider: 'r2',
                    ...sizeValidation
                });
            }
        }

        // VALIDATION: Expiry Time
        const expiryValidation = validateExpiry(expiresIn);
        if (!expiryValidation.valid) {
            updateRequestMetrics(apiKeyId, userId, 'r2', false).catch(() => { });

            return res.status(400).json({
                success: false,
                provider: 'r2',
                ...expiryValidation
            });
        }

        // ✅ NEW: VALIDATION: Server-side file validation (magic bytes from client)
        // CRITICAL: Client reads first 8 bytes and sends to backend - files NEVER hit backend!
        const { magicBytes, validation } = req.body;

        if (validation || magicBytes) {
            console.log(`[${requestId}] 🔍 Running server-side file validation...`);

            const validationResult = validateFileMetadata({
                filename,
                contentType,
                fileSize: fileSize || 0,
                magicBytes,
                validation: validation || {}
            });

            if (!validationResult.valid) {
                console.log(`[${requestId}] ❌ Validation failed: ${validationResult.errors?.length} errors`);
                updateRequestMetrics(apiKeyId, userId, 'r2', false).catch(() => { });

                return res.status(400).json({
                    success: false,
                    provider: 'r2',
                    error: 'VALIDATION_FAILED',
                    message: 'File validation failed',
                    validation: validationResult,
                    checks: validationResult.checks,
                    errors: validationResult.errors,
                    warnings: validationResult.warnings
                });
            }

            console.log(`[${requestId}] ✅ Validation passed`);
            if (validationResult.detectedMimeType) {
                console.log(`[${requestId}]    detected type: ${validationResult.detectedMimeType}`);
            }
        }

        // ✅ NEW: SMART EXPIRY CALCULATION
        // Calculate optimal expiry based on file size + network speed
        const { networkInfo, bufferMultiplier, minExpirySeconds, maxExpirySeconds } = req.body;
        let smartExpiryResult = null;

        if (fileSize && fileSize > 0 && (networkInfo || bufferMultiplier || minExpirySeconds || maxExpirySeconds)) {
            console.log(`[${requestId}] 🧠 Calculating smart expiry...`);

            smartExpiryResult = calculateSmartExpiry({
                fileSize: fileSize || 0,
                networkInfo: networkInfo || {},
                bufferMultiplier: bufferMultiplier || 1.5,
                minExpirySeconds: minExpirySeconds || 60,
                maxExpirySeconds: maxExpirySeconds || 7 * 24 * 60 * 60
            });

            // Override expiresIn with smart calculated value
            expiresIn = smartExpiryResult.expirySeconds;

            console.log(`[${requestId}] 🧠 Smart expiry calculated:`, {
                fileSize: smartExpiryResult.reasoning.fileSize,
                networkType: smartExpiryResult.networkType,
                estimatedUpload: smartExpiryResult.reasoning.estimatedUploadTime,
                buffer: smartExpiryResult.reasoning.bufferTime,
                finalExpiry: smartExpiryResult.reasoning.finalExpiry
            });
        }

        // OPERATION: Generate Unique Object Key
        const objectKey = generateR2Filename(filename, apiKeyId);

        // CRITICAL: Pure Crypto Signing (Target: 5-10ms, ZERO API calls!)
        const signingStart = Date.now();

        // Get S3Client (pure crypto, NO network call)
        const s3Client = getR2Client(r2AccountId, r2AccessKey, r2SecretKey);

        // Create PutObject command
        const command = new PutObjectCommand({
            Bucket: r2Bucket,
            Key: objectKey,
            ContentType: contentType
        });

        // Generate presigned URL (pure cryptography, NO API call!)
        const uploadUrl = await getSignedUrl(s3Client, command, {
            expiresIn: expiresIn
        });

        const signingTime = Date.now() - signingStart;

        // BUILD: Public URL
        const publicUrl = buildPublicUrl(r2AccountId, r2Bucket, objectKey, r2PublicUrl);

        const totalTime = Date.now() - startTime;

        // 🚀 SINGLE METRICS CALL (Redis-backed, non-blocking) - includes file type tracking
        updateRequestMetrics(apiKeyId, userId, 'r2', true, { 
            fileSize: fileSize || 0,
            contentType: contentType 
        })
            .catch(() => { });

        // ✅ INCREMENT QUOTA (fire-and-forget, non-blocking)
        incrementQuota(userId, 1)
            .then(newCount => {
                console.log(`[${requestId}] 📊 Quota incremented: ${newCount}`);
            })
            .catch(err => {
                console.error(`[${requestId}] ⚠️ Quota increment failed:`, err.message);
            });

        console.log(`[${requestId}] ✅ SUCCESS in ${totalTime}ms (signing: ${signingTime}ms)`);

        // ✅ NEW: WEBHOOK CREATION
        let webhookResult = null;
        const { webhook } = req.body;

        if (webhook && webhook.url) {
            console.log(`[${requestId}] 🔗 Creating webhook for ${filename}...`);

            try {
                const webhookId = generateWebhookId();
                const webhookSecret = webhook.secret || generateWebhookSecret();

                const { data: insertedWebhook, error: insertError } = await supabaseAdmin.from('upload_webhooks').insert({
                    id: webhookId,
                    user_id: userId,
                    api_key_id: apiKeyId,
                    webhook_url: webhook.url,
                    webhook_secret: webhookSecret,
                    trigger_mode: webhook.trigger || 'manual',
                    provider: 'R2',
                    bucket: r2Bucket,
                    file_key: objectKey,
                    filename: filename,
                    content_type: contentType,
                    file_size: fileSize,
                    etag: null,
                    status: 'pending',
                    metadata: webhook.metadata || {}
                }).select().single();

                if (insertError) {
                    console.error(`[${requestId}] ⚠️ Webhook DB insert failed:`, insertError.message);
                    console.error(`[${requestId}] ⚠️ Webhook DB error details:`, insertError);
                } else {
                    webhookResult = {
                        webhookId,
                        webhookSecret,
                        triggerMode: webhook.trigger || 'manual'
                    };
                    console.log(`[${requestId}] ✅ Webhook created: ${webhookId}`);
                }
            } catch (webhookError) {
                console.error(`[${requestId}] ⚠️ Webhook creation failed:`, webhookError.message);
                // Continue without webhook - don't fail the entire request
            }
        }

        // RESPONSE: Match Vercel Format
        return res.status(200).json({
            success: true,
            uploadUrl,
            publicUrl,
            uploadId: requestId,
            provider: 'r2',
            expiresIn,
            expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
            data: {
                filename: objectKey,
                originalFilename: filename,
                contentType,
                bucket: r2Bucket,
                accountId: r2AccountId,
                method: 'PUT'
            },
            // ✅ NEW: Webhook Result
            ...(webhookResult && { webhook: webhookResult }),
            // ✅ NEW: Smart Expiry Info
            smartExpiry: smartExpiryResult ? {
                calculatedExpiry: smartExpiryResult.expirySeconds,
                estimatedUploadTime: smartExpiryResult.estimatedUploadTime,
                networkType: smartExpiryResult.networkType,
                bufferTime: smartExpiryResult.bufferTime,
                reasoning: smartExpiryResult.reasoning
            } : null,
            performance: {
                requestId,
                totalTime: `${totalTime}ms`,
                breakdown: {
                    memoryGuard: `${memoryTime}ms`,
                    cryptoSigning: `${signingTime}ms`
                }
            }
        });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`[${requestId}] 💥 Error after ${totalTime}ms:`, error);

        if (apiKeyId) {
            updateRequestMetrics(apiKeyId, req.userId || apiKeyId, 'r2', false)
                .catch(() => { });
        }

        // Check if error is R2-specific
        if (error.name === 'CredentialsProviderError') {
            return res.status(401).json(formatR2Error(
                'INVALID_R2_CREDENTIALS',
                'R2 credentials format is invalid',
                'Check your Access Key ID and Secret Access Key'
            ));
        }

        return res.status(500).json(formatR2Error(
            'SERVER_ERROR',
            'Internal server error during signed URL generation',
            process.env.NODE_ENV === 'development' ? error.message : null
        ));
    }
};
