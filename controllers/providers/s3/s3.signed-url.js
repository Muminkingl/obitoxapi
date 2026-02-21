/**
 * Generate Presigned URL for AWS S3 Upload
 * Pure cryptographic signing (7-15ms, ZERO external API calls)
 * 
 * OPTIMIZED: Uses only updateRequestMetrics (Redis-backed)
 */

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
    validateS3Credentials,
    validateExpiry,
    validateFileSize,
    validateStorageClass,
    validateEncryptionType,
    validateKmsKeyArn,
    getS3Client,
    generateObjectKey,
    formatS3Error,
    SIGNED_URL_EXPIRY,
    ENCRYPTION_TYPES
} from './s3.config.js';
import { buildS3PublicUrl, isValidRegion, getInvalidRegionError } from '../../../utils/aws/s3-regions.js';
import { isValidStorageClass as validateStorageClassName, getInvalidStorageClassError } from '../../../utils/aws/s3-storage-classes.js';
import { getCloudFrontUrl, isValidCloudFrontDomain, getCloudFrontValidationError } from '../../../utils/aws/s3-cloudfront.js';
import { checkUserQuota } from '../shared/analytics.new.js';
import { incrementQuota } from '../../../utils/quota-manager.js';

// 🚀 REDIS METRICS: Single source of truth
import { updateRequestMetrics } from '../shared/metrics.helper.js';

// Import memory guard
import { checkMemoryRateLimit } from '../r2/cache/memory-guard.js';

// ✅ NEW: Import File Validator for server-side validation
import { validateFileMetadata } from '../../../utils/file-validator.js';

// ✅ NEW: Import Smart Expiry calculator
import { calculateSmartExpiry } from '../../../utils/smart-expiry.js';

// ✅ NEW: Import Webhook utilities
import { generateWebhookId, generateWebhookSecret } from '../../../utils/webhook/signature.js';
import { supabaseAdmin } from '../../../config/supabase.js';
import { enqueueWebhook } from '../../../services/webhook/queue-manager.js';

// ✅ SECURITY: Encrypt credentials before storing in DB
import { encryptCredential } from '../../../utils/credential-encryption.js';

// ✅ PRODUCTION: Structured logger
import logger from '../../../utils/logger.js';

/**
 * Generate presigned URL for S3 upload
 * Target Performance: 7-15ms P95
 */
export const generateS3SignedUrl = async (req, res) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    let apiKeyId;

    try {
        const {
            filename,
            contentType,
            fileSize,
            s3AccessKey,
            s3SecretKey,
            s3Bucket,
            s3Region = 'us-east-1',
            s3StorageClass = 'STANDARD',
            s3CloudFrontDomain,
            s3EncryptionType = 'SSE-S3',
            s3KmsKeyId,
            s3EnableVersioning = false,
            s3Endpoint,  // Custom endpoint for MinIO/LocalStack
            expiresIn: requestedExpiresIn = SIGNED_URL_EXPIRY
        } = req.body;

        // Use let so smart expiry can override
        let expiresIn = requestedExpiresIn;

        apiKeyId = req.apiKeyId;
        const userId = req.userId || apiKeyId;

        if (!apiKeyId) {
            return res.status(401).json(formatS3Error(
                'UNAUTHORIZED',
                'API key is required'
            ));
        }

        // LAYER 1: Memory Guard
        const memoryStart = Date.now();
        const memCheck = checkMemoryRateLimit(userId, 'upload');
        const memoryTime = Date.now() - memoryStart;

        if (!memCheck.allowed) {
            return res.status(429).json(formatS3Error(
                'RATE_LIMIT_EXCEEDED',
                'Rate limit exceeded - too many requests',
                'Wait a moment and try again'
            ));
        }

        // LAYER 2: Quota Check (OPT-2: use MW2 data if available, else fallback)
        const quotaCheck = req.quotaChecked || await checkUserQuota(userId);
        if (!quotaCheck.allowed) {
            return res.status(429).json(formatS3Error(
                'QUOTA_EXCEEDED',
                'Monthly quota exceeded',
                'Please upgrade your plan'
            ));
        }

        // VALIDATION: Required Fields
        if (!filename || !contentType) {
            updateRequestMetrics(apiKeyId, userId, 's3', false).catch(() => { });
            return res.status(400).json(formatS3Error(
                'MISSING_PARAMETERS',
                'filename and contentType are required',
                'Provide filename and contentType in request body'
            ));
        }

        if (!s3AccessKey || !s3SecretKey || !s3Bucket) {
            return res.status(400).json(formatS3Error(
                'MISSING_S3_CREDENTIALS',
                'S3 credentials are required: s3AccessKey, s3SecretKey, s3Bucket',
                'Get your AWS credentials from: AWS Console → IAM → Users → Security Credentials'
            ));
        }

        // VALIDATION: AWS Region (skip for S3-compatible services with custom endpoint)
        if (!s3Endpoint && !isValidRegion(s3Region)) {
            const regionError = getInvalidRegionError(s3Region);
            return res.status(400).json({
                success: false,
                provider: 's3',
                ...regionError
            });
        }

        // VALIDATION: Storage Class
        if (!validateStorageClassName(s3StorageClass)) {
            const classError = getInvalidStorageClassError(s3StorageClass);
            return res.status(400).json({
                success: false,
                provider: 's3',
                ...classError
            });
        }

        // VALIDATION: Encryption Type
        const encryptionValidation = validateEncryptionType(s3EncryptionType);
        if (!encryptionValidation.valid) {
            return res.status(400).json({
                success: false,
                provider: 's3',
                ...encryptionValidation
            });
        }

        // VALIDATION: KMS Key ARN
        if (s3EncryptionType === 'SSE-KMS') {
            const kmsValidation = validateKmsKeyArn(s3KmsKeyId);
            if (!kmsValidation.valid) {
                return res.status(400).json({
                    success: false,
                    provider: 's3',
                    ...kmsValidation
                });
            }
        }

        // VALIDATION: CloudFront Domain
        if (s3CloudFrontDomain && !isValidCloudFrontDomain(s3CloudFrontDomain)) {
            const cfError = getCloudFrontValidationError(s3CloudFrontDomain);
            return res.status(400).json({
                success: false,
                provider: 's3',
                ...cfError
            });
        }

        // VALIDATION: Credential Format
        const credValidation = validateS3Credentials(s3AccessKey, s3SecretKey, s3Bucket, s3Region, s3Endpoint);
        if (!credValidation.valid) {
            return res.status(400).json({
                success: false,
                provider: 's3',
                ...credValidation
            });
        }

        // VALIDATION: File Size
        if (fileSize) {
            const sizeValidation = validateFileSize(fileSize);
            if (!sizeValidation.valid) {
                return res.status(400).json({
                    success: false,
                    provider: 's3',
                    ...sizeValidation
                });
            }
        }

        // VALIDATION: Expiry Time
        const expiryValidation = validateExpiry(expiresIn);
        if (!expiryValidation.valid) {
            return res.status(400).json({
                success: false,
                provider: 's3',
                ...expiryValidation
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
                updateRequestMetrics(apiKeyId, userId, 's3', false).catch(() => { });

                return res.status(400).json({
                    success: false,
                    provider: 's3',
                    error: 'VALIDATION_FAILED',
                    message: 'File validation failed',
                    validation: validationResult,
                    checks: validationResult.checks,
                    errors: validationResult.errors,
                    warnings: validationResult.warnings
                });
            }

            logger.debug('Validation passed', { requestId, detectedType: validationResult.detectedMimeType });
        }

        // ✅ NEW: SMART EXPIRY CALCULATION
        // Calculate optimal expiry based on file size + network speed
        const { networkInfo, bufferMultiplier, minExpirySeconds, maxExpirySeconds } = req.body;
        let smartExpiryResult = null;

        if (fileSize && fileSize > 0 && (networkInfo || bufferMultiplier || minExpirySeconds || maxExpirySeconds)) {
            logger.debug('Calculating smart expiry', { requestId });

            smartExpiryResult = calculateSmartExpiry({
                fileSize: fileSize || 0,
                networkInfo: networkInfo || {},
                bufferMultiplier: bufferMultiplier || 1.5,
                minExpirySeconds: minExpirySeconds || 60,
                maxExpirySeconds: maxExpirySeconds || 7 * 24 * 60 * 60
            });

            // Override expiresIn with smart calculated value
            expiresIn = smartExpiryResult.expirySeconds;

            logger.debug('Smart expiry calculated', { 
                requestId,
                fileSize: smartExpiryResult.reasoning.fileSize,
                networkType: smartExpiryResult.networkType,
                estimatedUpload: smartExpiryResult.reasoning.estimatedUploadTime,
                finalExpiry: smartExpiryResult.reasoning.finalExpiry
            });
        }

        // Generate Object Key
        const objectKey = generateObjectKey(filename);

        // CRYPTO SIGNING (Target: 7-12ms)
        const signingStart = Date.now();

        const s3Client = getS3Client(s3Region, s3AccessKey, s3SecretKey, s3Endpoint);

        // Only add encryption params for real AWS S3 (not custom endpoints like MinIO)
        let encryptionParams = {};
        if (!s3Endpoint) {
            encryptionParams = {
                ServerSideEncryption: ENCRYPTION_TYPES[s3EncryptionType]
            };
            if (s3EncryptionType === 'SSE-KMS' && s3KmsKeyId) {
                encryptionParams.SSEKMSKeyId = s3KmsKeyId;
            }
        }

        const command = new PutObjectCommand({
            Bucket: s3Bucket,
            Key: objectKey,
            ContentType: contentType,
            StorageClass: !s3Endpoint ? s3StorageClass : undefined,  // Skip for custom endpoints
            ...encryptionParams
        });

        const uploadUrl = await getSignedUrl(s3Client, command, {
            expiresIn: expiresIn
        });

        const signingTime = Date.now() - signingStart;

        // BUILD URLs
        const publicUrl = buildS3PublicUrl(s3Bucket, s3Region, objectKey);
        const cdnUrl = getCloudFrontUrl(objectKey, s3CloudFrontDomain);

        const totalTime = Date.now() - startTime;

        // 🚀 SINGLE METRICS CALL (Redis-backed) - includes file type tracking
        updateRequestMetrics(apiKeyId, userId, 's3', true, { 
            fileSize: fileSize || 0,
            contentType: contentType 
        })
            .catch(() => { });

        logger.info('S3 signed URL generated', { requestId, totalTime, signingTime });

        // ✅ NEW: WEBHOOK CREATION
        let webhookResult = null;
        const { webhook } = req.body;

        if (webhook && webhook.url) {
            logger.debug('Creating webhook', { requestId, filename });

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
                    provider: 'S3',
                    bucket: s3Bucket,
                    file_key: objectKey,
                    filename: filename,
                    content_type: contentType,
                    file_size: fileSize,
                    etag: null,
                    status: 'pending',
                    metadata: webhook.metadata || {},
                    // S3 specific credentials for verification (encrypted at rest)
                    region: s3Region,
                    access_key_id: encryptCredential(s3AccessKey),
                    secret_access_key: encryptCredential(s3SecretKey),
                    endpoint: s3Endpoint  // Custom endpoint for MinIO/LocalStack
                }).select().single();

                if (insertError) {
                    logger.warn('Webhook DB insert failed', { requestId, error: insertError.message });
                } else {
                    webhookResult = {
                        webhookId,
                        webhookSecret,
                        triggerMode: webhook.trigger || 'manual'
                    };
                    logger.debug('Webhook created', { requestId, webhookId });

                    // ✅ Queue webhook for auto-trigger mode (worker will process)
                    if ((webhook.trigger || 'manual') === 'auto') {
                        await enqueueWebhook(webhookId, insertedWebhook, 0);
                        logger.debug('Webhook enqueued to Redis', { requestId, webhookId });
                    }
                }
            } catch (webhookError) {
                logger.warn('Webhook creation failed', { requestId, error: webhookError.message });
                // Continue without webhook - don't fail the entire request
            }
        }
        // RESPONSE
        const response = {
            success: true,
            uploadUrl,
            publicUrl,
            cdnUrl,
            uploadId: requestId,
            provider: 's3',
            region: s3Region,
            storageClass: s3StorageClass,
            encryption: {
                type: s3EncryptionType,
                algorithm: ENCRYPTION_TYPES[s3EncryptionType],
                ...(s3EncryptionType === 'SSE-KMS' && s3KmsKeyId && { kmsKeyId: s3KmsKeyId })
            },
            versioning: s3EnableVersioning ? {
                enabled: true,
                note: 'Versioning must be enabled on your S3 bucket.'
            } : undefined,
            expiresIn,
            expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
            data: {
                filename: objectKey,
                originalFilename: filename,
                contentType,
                bucket: s3Bucket,
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
        };

        res.status(200).json(response);

        // Increment quota (fire-and-forget)
        incrementQuota(userId, 1).catch(() => { });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        logger.error('S3 signed URL generation failed', { requestId, totalTime, error: error.message });

        if (apiKeyId) {
            updateRequestMetrics(apiKeyId, req.userId || apiKeyId, 's3', false)
                .catch(() => { });
        }

        if (error.name === 'CredentialsProviderError') {
            return res.status(401).json(formatS3Error(
                'INVALID_S3_CREDENTIALS',
                'S3 credentials format is invalid',
                'Check your AWS Access Key ID and Secret Access Key'
            ));
        }

        return res.status(500).json(formatS3Error(
            'SERVER_ERROR',
            'Internal server error during signed URL generation',
            process.env.NODE_ENV === 'development' ? error.message : null
        ));
    }
};
