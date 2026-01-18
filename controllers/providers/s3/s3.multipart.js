/**
 * AWS S3 Multipart Upload Controllers
 * 
 * For files >100MB (AWS recommendation)
 * 
 * CRITICAL POINTS:
 * - This DOES make AWS API calls (CreateMultipartUpload, CompleteMultipartUpload)
 * - Only used for large files (>100MB)
 * - Smaller files (<100MB) use regular signed URL (pure crypto, NO API calls)
 * 
 * Benefits:
 * - Faster uploads (parallel parts)
 * - Resumable (network failures)
 * - Required for files >5GB
 * 
 * Architecture:
 * 1. Client calls /multipart/initiate → Get uploadId + part URLs
 * 2. Client uploads parts in parallel → Directly to S3
 * 3. Client calls /multipart/complete → Finalize upload
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
    validateFileSize,
    validateStorageClass,
    validateEncryptionType,
    validateKmsKeyArn,
    getS3Client,
    generateObjectKey,
    formatS3Response,
    formatS3Error,
    SIGNED_URL_EXPIRY,
    DEFAULT_ENCRYPTION,
    MAX_FILE_SIZE,
    ENCRYPTION_TYPES
} from './s3.config.js';
import { buildS3PublicUrl, isValidRegion } from '../../../utils/aws/s3-regions.js';
import { isValidStorageClass as validateStorageClassName } from '../../../utils/aws/s3-storage-classes.js';
import { getCloudFrontUrl, isValidCloudFrontDomain } from '../../../utils/aws/s3-cloudfront.js';
import { checkUserQuota, trackApiUsage } from '../shared/analytics.new.js';
import { incrementQuota, checkUsageWarnings } from '../../../utils/quota-manager.js';

// Multipart upload constants
const MIN_MULTIPART_SIZE = 100 * 1024 * 1024; // 100MB (recommended threshold)
const PART_SIZE = 10 * 1024 * 1024; // 10MB per part (default)
const MIN_PART_SIZE = 5 * 1024 * 1024; // 5MB (AWS minimum)
const MAX_PART_SIZE = 5 * 1024 * 1024 * 1024; // 5GB (AWS maximum)
const MAX_PARTS = 10000; // AWS maximum parts

console.log('🔄 [S3 MULTIPART] Module loaded!');

/**
 * Initiate Multipart Upload
 * POST /api/v1/upload/s3/multipart/initiate
 * 
 * Creates a multipart upload and returns presigned URLs for each part
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
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
            s3StorageClass = 'STANDARD',
            s3CloudFrontDomain,
            s3EncryptionType = 'SSE-S3',      // OPTIONAL: Encryption type (Phase 3B)
            s3KmsKeyId,                        // OPTIONAL: KMS key ARN (required if SSE-KMS)
            s3EnableVersioning = false,       // OPTIONAL: Enable versioning info (Phase 3C)
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

        // ============================================================================
        // VALIDATION: Required Fields
        // ============================================================================
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

        // ============================================================================
        // VALIDATION: File Size (must be >100MB for multipart)
        // ============================================================================
        if (fileSize < MIN_MULTIPART_SIZE) {
            return res.status(400).json(formatS3Error(
                'FILE_TOO_SMALL_FOR_MULTIPART',
                `File size (${fileSize} bytes) is too small for multipart upload. Use regular signed URL for files <100MB.`,
                'For files <100MB, use POST /api/v1/upload/s3/signed-url instead'
            ));
        }

        if (fileSize > MAX_FILE_SIZE) {
            return res.status(400).json(formatS3Error(
                'FILE_TOO_LARGE',
                `File size (${fileSize} bytes) exceeds maximum (5GB)`
            ));
        }

        // ============================================================================
        // VALIDATION: Part Size
        // ============================================================================
        if (partSize < MIN_PART_SIZE || partSize > MAX_PART_SIZE) {
            return res.status(400).json(formatS3Error(
                'INVALID_PART_SIZE',
                `Part size must be between ${MIN_PART_SIZE} (5MB) and ${MAX_PART_SIZE} (5GB)`
            ));
        }

        // Calculate number of parts needed
        const partCount = Math.ceil(fileSize / partSize);
        if (partCount > MAX_PARTS) {
            return res.status(400).json(formatS3Error(
                'TOO_MANY_PARTS',
                `File requires ${partCount} parts, but AWS maximum is ${MAX_PARTS}. Increase part size.`
            ));
        }

        // ============================================================================
        // VALIDATION: Credentials, Region, Storage Class
        // ============================================================================
        const credValidation = validateS3Credentials(s3AccessKey, s3SecretKey, s3Bucket, s3Region);
        if (!credValidation.valid) {
            return res.status(400).json({
                success: false,
                provider: 's3',
                ...credValidation
            });
        }

        if (!isValidRegion(s3Region)) {
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

        // ============================================================================
        // VALIDATION: Encryption Type & KMS Key (Phase 3B)
        // ============================================================================
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

        // ============================================================================
        // QUOTA CHECK
        // ============================================================================
        const quotaCheck = await checkUserQuota(userId);
        if (!quotaCheck.allowed) {
            return res.status(429).json(formatS3Error(
                'QUOTA_EXCEEDED',
                'Monthly quota exceeded'
            ));
        }

        // ============================================================================
        // OPERATION: Generate Object Key
        // ============================================================================
        const objectKey = generateObjectKey(filename);

        // ============================================================================
        // AWS API CALL: Create Multipart Upload
        // This is the ONE network call for initiating
        // ============================================================================
        const apiCallStart = Date.now();

        const s3Client = getS3Client(s3Region, s3AccessKey, s3SecretKey);

        // Phase 3B: Support SSE-KMS encryption
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

        // ============================================================================
        // OPERATION: Generate Presigned URLs for Each Part (Pure Crypto)
        // ============================================================================
        const signingStart = Date.now();

        const partUrls = [];
        for (let i = 1; i <= partCount; i++) {
            const partCommand = new UploadPartCommand({
                Bucket: s3Bucket,
                Key: objectKey,
                UploadId: uploadId,
                PartNumber: i
            });

            const partUrl = await getSignedUrl(s3Client, partCommand, {
                expiresIn
            });

            partUrls.push({
                partNumber: i,
                uploadUrl: partUrl
            });
        }

        const signingTime = Date.now() - signingStart;

        // ============================================================================
        // BUILD: Public URL
        // ============================================================================
        const publicUrl = buildS3PublicUrl(s3Bucket, s3Region, objectKey);
        const cdnUrl = getCloudFrontUrl(objectKey, s3CloudFrontDomain);

        const totalTime = Date.now() - startTime;

        // ============================================================================
        // ANALYTICS
        // ============================================================================
        trackApiUsage({
            userId,
            endpoint: '/api/v1/upload/s3/multipart/initiate',
            method: 'POST',
            provider: 's3',
            operation: 'multipart-initiate',
            statusCode: 200,
            success: true,
            requestCount: 1,
            apiKeyId,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        console.log(`[${requestId}] ✅ Multipart initiated in ${totalTime}ms (API: ${apiCallTime}ms, signing: ${signingTime}ms)`);

        // ============================================================================
        // RESPONSE
        // ============================================================================
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
            encryption: {                 // Phase 3B
                type: s3EncryptionType,
                algorithm: ENCRYPTION_TYPES[s3EncryptionType],
                ...(s3EncryptionType === 'SSE-KMS' && s3KmsKeyId && { kmsKeyId: s3KmsKeyId })
            },
            versioning: s3EnableVersioning ? {  // Phase 3C
                enabled: true,
                note: 'Versioning must be enabled on your S3 bucket. AWS will auto-assign versionId on completion.',
                how: 'AWS Console → S3 → Your Bucket → Properties → Bucket Versioning → Enable',
                docs: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html'
            } : undefined,
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

        // Increment quota (fire-and-forget)
        incrementQuota(userId, 1).catch(() => { });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`[${requestId}] 💥 Multipart initiate error after ${totalTime}ms:`, error);

        if (apiKeyId) {
            trackApiUsage({
                userId: req.userId || apiKeyId,
                endpoint: '/api/v1/upload/s3/multipart/initiate',
                method: 'POST',
                provider: 's3',
                operation: 'multipart-initiate',
                statusCode: 500,
                success: false,
                apiKeyId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
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
 * POST /api/v1/upload/s3/multipart/complete
 * 
 * Finalizes the multipart upload after all parts uploaded
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export const completeS3MultipartUpload = async (req, res) => {
    const requestId = `mp_complete_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    let apiKeyId;

    try {
        const {
            uploadId,
            objectKey,
            parts, // Array of { partNumber, etag }
            s3AccessKey,
            s3SecretKey,
            s3Bucket,
            s3Region = 'us-east-1'
        } = req.body;

        apiKeyId = req.apiKeyId;
        const userId = req.userId || apiKeyId;

        if (!apiKeyId) {
            return res.status(401).json(formatS3Error(
                'UNAUTHORIZED',
                'API key is required'
            ));
        }

        // ============================================================================
        // VALIDATION
        // ============================================================================
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

        // Validate parts format
        for (const part of parts) {
            if (!part.partNumber || !part.etag) {
                return res.status(400).json(formatS3Error(
                    'INVALID_PARTS_FORMAT',
                    'Each part must have: { partNumber, etag }'
                ));
            }
        }

        // ============================================================================
        // AWS API CALL: Complete Multipart Upload
        // ============================================================================
        const apiCallStart = Date.now();

        const s3Client = getS3Client(s3Region, s3AccessKey, s3SecretKey);

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

        // ============================================================================
        // ANALYTICS
        // ============================================================================
        trackApiUsage({
            userId,
            endpoint: '/api/v1/upload/s3/multipart/complete',
            method: 'POST',
            provider: 's3',
            operation: 'multipart-complete',
            statusCode: 200,
            success: true,
            requestCount: 1,
            apiKeyId,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        console.log(`[${requestId}] ✅ Multipart completed in ${totalTime}ms (API: ${apiCallTime}ms)`);

        // ============================================================================
        // RESPONSE
        // ============================================================================
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
        console.error(`[${requestId}] 💥 Multipart complete error after ${totalTime}ms:`, error);

        if (apiKeyId) {
            trackApiUsage({
                userId: req.userId || apiKeyId,
                endpoint: '/api/v1/upload/s3/multipart/complete',
                method: 'POST',
                provider: 's3',
                operation: 'multipart-complete',
                statusCode: 500,
                success: false,
                apiKeyId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
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
 * POST /api/v1/upload/s3/multipart/abort
 * 
 * Cancels a multipart upload and cleans up parts
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
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
            s3Region = 'us-east-1'
        } = req.body;

        apiKeyId = req.apiKeyId;
        const userId = req.userId || apiKeyId;

        if (!apiKeyId) {
            return res.status(401).json(formatS3Error(
                'UNAUTHORIZED',
                'API key is required'
            ));
        }

        // ============================================================================
        // VALIDATION
        // ============================================================================
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

        // ============================================================================
        // AWS API CALL: Abort Multipart Upload
        // ============================================================================
        const apiCallStart = Date.now();

        const s3Client = getS3Client(s3Region, s3AccessKey, s3SecretKey);

        const abortCommand = new AbortMultipartUploadCommand({
            Bucket: s3Bucket,
            Key: objectKey,
            UploadId: uploadId
        });

        await s3Client.send(abortCommand);

        const apiCallTime = Date.now() - apiCallStart;
        const totalTime = Date.now() - startTime;

        // ============================================================================
        // ANALYTICS
        // ============================================================================
        trackApiUsage({
            userId,
            endpoint: '/api/v1/upload/s3/multipart/abort',
            method: 'POST',
            provider: 's3',
            operation: 'multipart-abort',
            statusCode: 200,
            success: true,
            requestCount: 1,
            apiKeyId,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        console.log(`[${requestId}] ✅ Multipart aborted in ${totalTime}ms (API: ${apiCallTime}ms)`);

        // ============================================================================
        // RESPONSE
        // ============================================================================
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
        console.error(`[${requestId}] 💥 Multipart abort error after ${totalTime}ms:`, error);

        if (apiKeyId) {
            trackApiUsage({
                userId: req.userId || apiKeyId,
                endpoint: '/api/v1/upload/s3/multipart/abort',
                method: 'POST',
                provider: 's3',
                operation: 'multipart-abort',
                statusCode: 500,
                success: false,
                apiKeyId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }

        return res.status(500).json(formatS3Error(
            'MULTIPART_ABORT_ERROR',
            'Failed to abort multipart upload',
            process.env.NODE_ENV === 'development' ? error.message : null
        ));
    }
};
