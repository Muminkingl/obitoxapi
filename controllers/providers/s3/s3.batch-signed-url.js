/**
 * S3 Batch Signed URLs (Enhanced)
 * Generate multiple signed URLs with validation + smart expiry
 *
 * OPTIMIZED: Pure crypto signing, validation integration, smart expiry
 *
 * @file controllers/providers/s3/s3.batch-signed-url.js
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
    ENCRYPTION_TYPES,
    MAX_EXPIRY,
    MIN_EXPIRY
} from './s3.config.js';
import { buildS3PublicUrl, isValidRegion } from '../../../utils/aws/s3-regions.js';
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

/**
 * Generate multiple S3 signed URLs in one request
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export const generateS3BatchSignedUrls = async (req, res) => {
    const requestId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const startTime = Date.now();

    try {
        const {
            files,
            s3AccessKey,
            s3SecretKey,
            s3Bucket,
            s3Region = 'us-east-1',
            s3StorageClass = 'STANDARD',
            s3CloudFrontDomain,
            s3EncryptionType = 'SSE-S3',
            s3KmsKeyId,
            s3Endpoint,
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
        const memCheck = checkMemoryRateLimit(userId, 's3-batch');
        const memoryTime = Date.now() - memoryStart;

        if (!memCheck.allowed) {
            return res.status(429).json(formatS3Error(
                'RATE_LIMIT_EXCEEDED',
                'Rate limit exceeded - too many batch requests',
                'Wait a moment before submitting another batch'
            ));
        }

        // QUOTA CHECK (OPT-2: use MW2 data if available, else fallback)
        const quotaCheck = req.quotaChecked || await checkUserQuota(userId);
        if (!quotaCheck.allowed) {
            return res.status(429).json(formatS3Error(
                'QUOTA_EXCEEDED',
                'Monthly quota exceeded',
                'Please upgrade your plan'
            ));
        }

        // VALIDATION: Files Array
        if (!Array.isArray(files) || files.length === 0) {
            return res.status(400).json(formatS3Error(
                'INVALID_FILES_ARRAY',
                'files must be a non-empty array',
                'Provide an array of files: [{ filename, contentType, fileSize }, ...]'
            ));
        }

        if (!s3AccessKey || !s3SecretKey || !s3Bucket) {
            return res.status(400).json(formatS3Error(
                'MISSING_S3_CREDENTIALS',
                'S3 credentials are required: s3AccessKey, s3SecretKey, s3Bucket',
                'Include all S3 credentials in request body'
            ));
        }

        // VALIDATION: Batch Size Limit
        const MAX_BATCH_SIZE = 100;

        if (files.length > MAX_BATCH_SIZE) {
            return res.status(400).json(formatS3Error(
                'BATCH_TOO_LARGE',
                `Maximum ${MAX_BATCH_SIZE} files per batch request`,
                `You requested ${files.length} files. Split into multiple batches.`
            ));
        }

        // VALIDATION: AWS Region (skip for S3-compatible services with custom endpoint)
        if (!s3Endpoint && !isValidRegion(s3Region)) {
            return res.status(400).json({
                success: false,
                provider: 's3',
                error: 'INVALID_REGION',
                message: `Invalid S3 region: ${s3Region}`
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
        if (s3EncryptionType === 'SSE-KMS' && !s3KmsKeyId) {
            return res.status(400).json({
                success: false,
                provider: 's3',
                error: 'MISSING_KMS_KEY',
                message: 'SSE-KMS encryption requires s3KmsKeyId'
            });
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

        // VALIDATION: Expiry Time
        const expiryInt = parseInt(requestedExpiresIn);
        if (isNaN(expiryInt) || expiryInt < MIN_EXPIRY || expiryInt > MAX_EXPIRY) {
            return res.status(400).json(formatS3Error(
                'INVALID_EXPIRY',
                `expiresIn must be between ${MIN_EXPIRY} and ${MAX_EXPIRY} seconds`,
                `You provided: ${requestedExpiresIn}`
            ));
        }

        // CRYPTO SIGNING: Generate all signed URLs in parallel
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

                    // VALIDATION: File Size
                    if (file.fileSize) {
                        const sizeValidation = validateFileSize(file.fileSize);
                        if (!sizeValidation.valid) {
                            return {
                                success: false,
                                index,
                                originalFilename: file.filename,
                                error: 'FILE_SIZE_EXCEEDED',
                                message: sizeValidation.error,
                                maxSize: sizeValidation.maxSize
                            };
                        }
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

                    const objectKey = generateObjectKey(file.filename);

                    const command = new PutObjectCommand({
                        Bucket: s3Bucket,
                        Key: objectKey,
                        ContentType: file.contentType,
                        StorageClass: !s3Endpoint ? s3StorageClass : undefined,
                        ...encryptionParams
                    });

                    const uploadUrl = await getSignedUrl(s3Client, command, {
                        expiresIn: fileExpiry
                    });

                    const publicUrl = buildS3PublicUrl(s3Bucket, s3Region, objectKey);
                    const cdnUrl = getCloudFrontUrl(objectKey, s3CloudFrontDomain);

                    return {
                        success: true,
                        index,
                        originalFilename: file.filename,
                        uploadFilename: objectKey,
                        uploadUrl,
                        publicUrl,
                        cdnUrl,
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
                        } : null,
                        storageClass: s3StorageClass,
                        encryption: {
                            type: s3EncryptionType,
                            algorithm: ENCRYPTION_TYPES[s3EncryptionType]
                        }
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
        updateRequestMetrics(apiKeyId, userId, 's3', successCount > 0, {
            batchSize: files.length,
            successCount,
            failureCount
        }).catch(() => { });

        // Increment quota
        incrementQuota(userId, successCount).catch(() => { });

        console.log(`[${requestId}] ✅ Batch complete: ${successCount}/${files.length} in ${totalTime}ms`);

        return res.status(200).json({
            success: true,
            provider: 's3',
            region: s3Region,
            results,
            summary: {
                total: files.length,
                successful: successCount,
                failed: failureCount
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
        console.error(`[${requestId}] ❌ Batch error (${totalTime}ms):`, error.message);

        if (req.apiKeyId) {
            updateRequestMetrics(req.apiKeyId, req.userId || req.apiKeyId, 's3', false)
                .catch(() => { });
        }

        return res.status(500).json(formatS3Error(
            'BATCH_OPERATION_FAILED',
            'Failed to process batch signed URLs',
            error.message
        ));
    }
};
