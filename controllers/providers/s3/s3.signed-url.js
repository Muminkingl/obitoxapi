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
            expiresIn = SIGNED_URL_EXPIRY
        } = req.body;

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

        // LAYER 2: Quota Check
        const quotaCheck = await checkUserQuota(userId);
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

        // VALIDATION: AWS Region
        if (!isValidRegion(s3Region)) {
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
        const credValidation = validateS3Credentials(s3AccessKey, s3SecretKey, s3Bucket, s3Region);
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

        // 🚀 SINGLE METRICS CALL (Redis-backed)
        updateRequestMetrics(apiKeyId, userId, 's3', true, { fileSize: fileSize || 0 })
            .catch(() => { });

        console.log(`[${requestId}] ✅ SUCCESS in ${totalTime}ms (signing: ${signingTime}ms)`);






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
            data: {
                filename: objectKey,
                originalFilename: filename,
                contentType,
                bucket: s3Bucket,
                method: 'PUT'
            },
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
        console.error(`[${requestId}] 💥 Error after ${totalTime}ms:`, error);

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
