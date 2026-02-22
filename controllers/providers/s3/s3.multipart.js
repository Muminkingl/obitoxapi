/**
 * AWS S3 Multipart Upload Controllers
 * For files >100MB (AWS recommendation)
 * 
 * OPTIMIZED: Uses only updateRequestMetrics (Redis-backed)
 */

import {
    CreateMultipartUploadCommand,
    CompleteMultipartUploadCommand,
    AbortMultipartUploadCommand,
    UploadPartCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
    validateS3Credentials,
    validateEncryptionType,
    validateKmsKeyArn,
    getS3Client,
    generateObjectKey,
    formatS3Error,
    SIGNED_URL_EXPIRY,
    MAX_FILE_SIZE,
    ENCRYPTION_TYPES
} from './s3.config.js';
import { buildS3PublicUrl, isValidRegion } from '../../../utils/aws/s3-regions.js';
import { isValidStorageClass as validateStorageClassName } from '../../../utils/aws/s3-storage-classes.js';
import { getCloudFrontUrl, isValidCloudFrontDomain } from '../../../utils/aws/s3-cloudfront.js';
import { checkUserQuota } from '../shared/analytics.new.js';
import { incrementQuota } from '../../../utils/quota-manager.js';

import { updateRequestMetrics } from '../shared/metrics.helper.js';

// Import memory guard
import { checkMemoryRateLimit } from '../r2/cache/memory-guard.js';
import logger from '../../../utils/logger.js';

// Multipart upload constants
const MIN_MULTIPART_SIZE = 100 * 1024 * 1024; // 100MB
const PART_SIZE = 10 * 1024 * 1024; // 10MB per part
const MIN_PART_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_PART_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
const MAX_PARTS = 10000;

/**
 * Initiate Multipart Upload
 */
export const initiateS3MultipartUpload = async (req, res) => {
    const requestId = `mp_init_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
            s3Endpoint,  // Custom endpoint for MinIO/LocalStack
            s3StorageClass = 'STANDARD',
            s3CloudFrontDomain,
            s3EncryptionType = 'SSE-S3',
            s3KmsKeyId,
            s3EnableVersioning = false,
            partSize = PART_SIZE,
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

        // VALIDATION
        if (!filename || !contentType || !fileSize) {
            return res.status(400).json(formatS3Error(
                'MISSING_PARAMETERS',
                'filename, contentType, and fileSize are required for multipart upload'
            ));
        }

        if (!s3AccessKey || !s3SecretKey || !s3Bucket) {
            return res.status(400).json(formatS3Error(
                'MISSING_S3_CREDENTIALS',
                'S3 credentials are required: s3AccessKey, s3SecretKey, s3Bucket'
            ));
        }

        if (fileSize < MIN_MULTIPART_SIZE) {
            return res.status(400).json(formatS3Error(
                'FILE_TOO_SMALL_FOR_MULTIPART',
                `File size (${fileSize} bytes) is too small for multipart. Use regular signed URL for files <100MB.`,
                'For files <100MB, use POST /api/v1/upload/s3/signed-url instead'
            ));
        }

        if (fileSize > MAX_FILE_SIZE) {
            return res.status(400).json(formatS3Error(
                'FILE_TOO_LARGE',
                `File size (${fileSize} bytes) exceeds maximum (5GB)`
            ));
        }

        if (partSize < MIN_PART_SIZE || partSize > MAX_PART_SIZE) {
            return res.status(400).json(formatS3Error(
                'INVALID_PART_SIZE',
                `Part size must be between ${MIN_PART_SIZE} (5MB) and ${MAX_PART_SIZE} (5GB)`
            ));
        }

        const partCount = Math.ceil(fileSize / partSize);
        if (partCount > MAX_PARTS) {
            return res.status(400).json(formatS3Error(
                'TOO_MANY_PARTS',
                `File requires ${partCount} parts, but AWS maximum is ${MAX_PARTS}. Increase part size.`
            ));
        }

        const credValidation = validateS3Credentials(s3AccessKey, s3SecretKey, s3Bucket, s3Region, s3Endpoint);
        if (!credValidation.valid) {
            return res.status(400).json({
                success: false,
                provider: 's3',
                ...credValidation
            });
        }

        if (!s3Endpoint && !isValidRegion(s3Region)) {
            return res.status(400).json(formatS3Error(
                'INVALID_S3_REGION',
                `Invalid AWS region: ${s3Region}`
            ));
        }

        if (!validateStorageClassName(s3StorageClass)) {
            return res.status(400).json(formatS3Error(
                'INVALID_STORAGE_CLASS',
                `Invalid storage class: ${s3StorageClass}`
            ));
        }

        if (s3CloudFrontDomain && !isValidCloudFrontDomain(s3CloudFrontDomain)) {
            return res.status(400).json(formatS3Error(
                'INVALID_CLOUDFRONT_DOMAIN',
                `Invalid CloudFront domain: ${s3CloudFrontDomain}`
            ));
        }

        const encryptionValidation = validateEncryptionType(s3EncryptionType);
        if (!encryptionValidation.valid) {
            return res.status(400).json({
                success: false,
                provider: 's3',
                ...encryptionValidation
            });
        }

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

        // LAYER 1: Memory Guard (fastest possible)
        const memCheck = checkMemoryRateLimit(userId, 's3-multipart');
        if (!memCheck.allowed) {
            return res.status(429).json(formatS3Error(
                'RATE_LIMIT_EXCEEDED',
                'Rate limit exceeded - too many multipart requests',
                'Wait a moment before trying again'
            ));
        }

        // QUOTA CHECK (OPT-2: use MW2 data if available, else fallback)
        const quotaCheck = req.quotaChecked || await checkUserQuota(userId);
        if (!quotaCheck.allowed) {
            return res.status(429).json(formatS3Error(
                'QUOTA_EXCEEDED',
                'Monthly quota exceeded'
            ));
        }

        const objectKey = generateObjectKey(filename);

        // AWS API CALL
        const apiCallStart = Date.now();
        const s3Client = getS3Client(s3Region, s3AccessKey, s3SecretKey, s3Endpoint);

        const encryptionParams = {
            ServerSideEncryption: ENCRYPTION_TYPES[s3EncryptionType]
        };

        if (s3EncryptionType === 'SSE-KMS' && s3KmsKeyId) {
            encryptionParams.SSEKMSKeyId = s3KmsKeyId;
        }

        const createCommand = new CreateMultipartUploadCommand({
            Bucket: s3Bucket,
            Key: objectKey,
            ContentType: contentType,
            StorageClass: s3StorageClass,
            ...encryptionParams
        });

        const createResponse = await s3Client.send(createCommand);
        const uploadId = createResponse.UploadId;

        const apiCallTime = Date.now() - apiCallStart;

        // Generate Part URLs
        const signingStart = Date.now();
        const partUrls = [];

        for (let i = 1; i <= partCount; i++) {
            const partCommand = new UploadPartCommand({
                Bucket: s3Bucket,
                Key: objectKey,
                UploadId: uploadId,
                PartNumber: i
            });

            const partUrl = await getSignedUrl(s3Client, partCommand, { expiresIn });
            partUrls.push({ partNumber: i, uploadUrl: partUrl });
        }

        const signingTime = Date.now() - signingStart;

        const publicUrl = buildS3PublicUrl(s3Bucket, s3Region, objectKey);
        const cdnUrl = getCloudFrontUrl(objectKey, s3CloudFrontDomain);

        const totalTime = Date.now() - startTime;

        // 🚀 SINGLE METRICS CALL (Redis-backed)
        updateRequestMetrics(apiKeyId, userId, 's3', true)
            .catch(() => { });

        logger.info(`[${requestId}] ✅ Multipart initiated in ${totalTime}ms`);

        const response = {
            success: true,
            uploadId,
            objectKey,
            partSize,
            partCount,
            partUrls,
            publicUrl,
            cdnUrl,
            provider: 's3',
            region: s3Region,
            storageClass: s3StorageClass,
            encryption: {
                type: s3EncryptionType,
                algorithm: ENCRYPTION_TYPES[s3EncryptionType],
                ...(s3EncryptionType === 'SSE-KMS' && s3KmsKeyId && { kmsKeyId: s3KmsKeyId })
            },
            versioning: s3EnableVersioning ? { enabled: true } : undefined,
            instructions: {
                step1: 'Upload each part to its corresponding uploadUrl using PUT request',
                step2: 'After all parts uploaded, call POST /api/v1/upload/s3/multipart/complete with uploadId and parts',
                step3: 'Parts must include: { partNumber, etag } where etag is from upload response'
            },
            performance: {
                requestId,
                totalTime: `${totalTime}ms`,
                breakdown: {
                    awsApiCall: `${apiCallTime}ms`,
                    partUrlSigning: `${signingTime}ms`
                }
            }
        };

        res.status(200).json(response);
        incrementQuota(userId, 1).catch(() => { });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        logger.error(`s3 error:`, { error });

        if (apiKeyId) {
            updateRequestMetrics(apiKeyId, req.userId || apiKeyId, 's3', false)
                .catch(() => { });
        }

        return res.status(500).json(formatS3Error(
            'MULTIPART_INITIATE_ERROR',
            'Failed to initiate multipart upload',
            process.env.NODE_ENV === 'development' ? error.message : null
        ));
    }
};

/**
 * Complete Multipart Upload
 */
export const completeS3MultipartUpload = async (req, res) => {
    const requestId = `mp_complete_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    let apiKeyId;

    try {
        const {
            uploadId,
            objectKey,
            parts,
            s3AccessKey,
            s3SecretKey,
            s3Bucket,
            s3Region = 'us-east-1',
            s3Endpoint  // Custom endpoint for MinIO/LocalStack
        } = req.body;

        apiKeyId = req.apiKeyId;
        const userId = req.userId || apiKeyId;

        if (!apiKeyId) {
            return res.status(401).json(formatS3Error(
                'UNAUTHORIZED',
                'API key is required'
            ));
        }

        // VALIDATION
        if (!uploadId || !objectKey || !parts || !Array.isArray(parts)) {
            return res.status(400).json(formatS3Error(
                'MISSING_PARAMETERS',
                'uploadId, objectKey, and parts array are required'
            ));
        }

        if (!s3AccessKey || !s3SecretKey || !s3Bucket) {
            return res.status(400).json(formatS3Error(
                'MISSING_S3_CREDENTIALS',
                'S3 credentials are required'
            ));
        }

        // LAYER 1: Memory Guard (fastest possible)
        const memCheck = checkMemoryRateLimit(userId, 's3-multipart');
        if (!memCheck.allowed) {
            return res.status(429).json(formatS3Error(
                'RATE_LIMIT_EXCEEDED',
                'Rate limit exceeded - too many multipart requests',
                'Wait a moment before trying again'
            ));
        }

        for (const part of parts) {
            if (!part.partNumber || !part.etag) {
                return res.status(400).json(formatS3Error(
                    'INVALID_PARTS_FORMAT',
                    'Each part must have: { partNumber, etag }'
                ));
            }
        }

        // AWS API CALL
        const apiCallStart = Date.now();
        const s3Client = getS3Client(s3Region, s3AccessKey, s3SecretKey, s3Endpoint);

        const completeCommand = new CompleteMultipartUploadCommand({
            Bucket: s3Bucket,
            Key: objectKey,
            UploadId: uploadId,
            MultipartUpload: {
                Parts: parts.map(p => ({
                    PartNumber: p.partNumber,
                    ETag: p.etag
                }))
            }
        });

        const completeResponse = await s3Client.send(completeCommand);

        const apiCallTime = Date.now() - apiCallStart;
        const totalTime = Date.now() - startTime;

        // 🚀 SINGLE METRICS CALL (Redis-backed)
        updateRequestMetrics(apiKeyId, userId, 's3', true)
            .catch(() => { });

        logger.info(`[${requestId}] ✅ Multipart completed in ${totalTime}ms`);

        res.status(200).json({
            success: true,
            location: completeResponse.Location,
            bucket: completeResponse.Bucket,
            key: completeResponse.Key,
            etag: completeResponse.ETag,
            publicUrl: completeResponse.Location,
            provider: 's3',
            performance: {
                requestId,
                totalTime: `${totalTime}ms`,
                apiCallTime: `${apiCallTime}ms`
            }
        });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        logger.error(`s3 error:`, { error });

        if (apiKeyId) {
            updateRequestMetrics(apiKeyId, req.userId || apiKeyId, 's3', false)
                .catch(() => { });
        }

        return res.status(500).json(formatS3Error(
            'MULTIPART_COMPLETE_ERROR',
            'Failed to complete multipart upload',
            process.env.NODE_ENV === 'development' ? error.message : null
        ));
    }
};

/**
 * Abort Multipart Upload
 */
export const abortS3MultipartUpload = async (req, res) => {
    const requestId = `mp_abort_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    let apiKeyId;

    try {
        const {
            uploadId,
            objectKey,
            s3AccessKey,
            s3SecretKey,
            s3Bucket,
            s3Region = 'us-east-1',
            s3Endpoint  // Custom endpoint for MinIO/LocalStack
        } = req.body;

        apiKeyId = req.apiKeyId;
        const userId = req.userId || apiKeyId;

        if (!apiKeyId) {
            return res.status(401).json(formatS3Error(
                'UNAUTHORIZED',
                'API key is required'
            ));
        }

        // VALIDATION
        if (!uploadId || !objectKey) {
            return res.status(400).json(formatS3Error(
                'MISSING_PARAMETERS',
                'uploadId and objectKey are required'
            ));
        }

        if (!s3AccessKey || !s3SecretKey || !s3Bucket) {
            return res.status(400).json(formatS3Error(
                'MISSING_S3_CREDENTIALS',
                'S3 credentials are required'
            ));
        }

        // LAYER 1: Memory Guard (fastest possible)
        const memCheck = checkMemoryRateLimit(userId, 's3-multipart');
        if (!memCheck.allowed) {
            return res.status(429).json(formatS3Error(
                'RATE_LIMIT_EXCEEDED',
                'Rate limit exceeded - too many multipart requests',
                'Wait a moment before trying again'
            ));
        }

        // AWS API CALL
        const apiCallStart = Date.now();
        const s3Client = getS3Client(s3Region, s3AccessKey, s3SecretKey, s3Endpoint);

        const abortCommand = new AbortMultipartUploadCommand({
            Bucket: s3Bucket,
            Key: objectKey,
            UploadId: uploadId
        });

        await s3Client.send(abortCommand);

        const apiCallTime = Date.now() - apiCallStart;
        const totalTime = Date.now() - startTime;

        // 🚀 SINGLE METRICS CALL (Redis-backed)
        updateRequestMetrics(apiKeyId, userId, 's3', true)
            .catch(() => { });

        logger.info(`[${requestId}] ✅ Multipart aborted in ${totalTime}ms`);

        res.status(200).json({
            success: true,
            message: 'Multipart upload aborted successfully',
            uploadId,
            objectKey,
            provider: 's3',
            performance: {
                requestId,
                totalTime: `${totalTime}ms`,
                apiCallTime: `${apiCallTime}ms`
            }
        });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        logger.error(`s3 error:`, { error });

        if (apiKeyId) {
            updateRequestMetrics(apiKeyId, req.userId || apiKeyId, 's3', false)
                .catch(() => { });
        }

        return res.status(500).json(formatS3Error(
            'MULTIPART_ABORT_ERROR',
            'Failed to abort multipart upload',
            process.env.NODE_ENV === 'development' ? error.message : null
        ));
    }
};
