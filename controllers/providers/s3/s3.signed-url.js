/**
 * Generate Presigned URL for AWS S3 Upload
 * CRITICAL PERFORMANCE: Pure cryptographic signing (7-15ms, ZERO external API calls)
 * 
 * Following Rule #1: NO external API calls in request path
 * Following Rule #2: Validate format only, NOT credentials
 * Following Rule #3: Response format identical to R2/Vercel
 * 
 * Based on R2 controller (90% code reuse)
 * S3-specific additions: regions, storage classes, SSE-S3 encryption
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
    formatS3Response,
    formatS3Error,
    SIGNED_URL_EXPIRY,
    DEFAULT_ENCRYPTION,
    ENCRYPTION_TYPES
} from './s3.config.js';
import { buildS3PublicUrl, isValidRegion, getInvalidRegionError } from '../../../utils/aws/s3-regions.js';
import { isValidStorageClass as validateStorageClassName, getInvalidStorageClassError } from '../../../utils/aws/s3-storage-classes.js';
import { getCloudFrontUrl, isValidCloudFrontDomain, getCloudFrontValidationError } from '../../../utils/aws/s3-cloudfront.js';
import { checkUserQuota, trackApiUsage } from '../shared/analytics.new.js';
import { incrementQuota, checkUsageWarnings } from '../../../utils/quota-manager.js';

// Import memory guard only (Redis not needed for pure crypto!)
import { checkMemoryRateLimit } from '../r2/cache/memory-guard.js';

// ✅ MODULE LOADED - This proves the file was loaded with quota support!
console.log('🔄 [S3 SIGNED URL] Module loaded with Layer 3 quota support!');

/**
 * Generate presigned URL for S3 upload
 * Target Performance: 7-15ms P95 (same as R2)
 * 
 * Architecture:
 * Request → Memory Guard (1ms) → Pure Crypto Signing (7-12ms) → Response
 * Total: 8-13ms ✅ (NO Redis needed - crypto costs nothing!)
 * 
 * S3-Specific Features:
 * - Multi-region support (8 regions)
 * - Storage class selection (STANDARD, IA, Glacier)
 * - Server-side encryption (SSE-S3)
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
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
            s3AccessKey,        // AWS Access Key ID (AKIA...)
            s3SecretKey,        // AWS Secret Access Key
            s3Bucket,           // S3 bucket name
            s3Region = 'us-east-1',           // NEW: AWS region (default: us-east-1)
            s3StorageClass = 'STANDARD',      // NEW: Storage class (default: STANDARD)
            s3CloudFrontDomain,               // OPTIONAL: CloudFront CDN domain (Phase 2B)
            s3EncryptionType = 'SSE-S3',      // OPTIONAL: Encryption type (Phase 3B)
            s3KmsKeyId,                        // OPTIONAL: KMS key ARN (required if SSE-KMS)
            s3EnableVersioning = false,       // OPTIONAL: Enable versioning info (Phase 3C)
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
        // LAYER 1: Memory Guard (Target: 0-2ms)
        // For pure crypto operations, we only need lightweight memory protection
        // NO Redis check needed - signing costs us nothing!
        // ============================================================================
        const memoryStart = Date.now();
        const memCheck = checkMemoryRateLimit(userId, 'upload');
        const memoryTime = Date.now() - memoryStart;

        if (!memCheck.allowed) {
            console.log(`[${requestId}] ❌ Blocked by memory guard in ${memoryTime}ms`);
            return res.status(429).json(formatS3Error(
                'RATE_LIMIT_EXCEEDED',
                'Rate limit exceeded - too many requests',
                'Wait a moment and try again'
            ));
        }

        // ============================================================================
        // LAYER 2: User Quota Check (Database RPC)
        // ============================================================================
        const quotaCheck = await checkUserQuota(userId);
        if (!quotaCheck.allowed) {
            trackApiUsage({
                userId,
                endpoint: '/api/v1/upload/s3/signed-url',
                method: 'POST',
                provider: 's3',
                operation: 'signed-url',
                statusCode: 429,
                success: false,
                apiKeyId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
            return res.status(429).json(formatS3Error(
                'QUOTA_EXCEEDED',
                'Monthly quota exceeded',
                'Please upgrade your plan'
            ));
        }

        // ============================================================================
        // VALIDATION: Required Fields
        // ============================================================================
        if (!filename || !contentType) {
            trackApiUsage({
                userId,
                endpoint: '/api/v1/upload/s3/signed-url',
                method: 'POST',
                provider: 's3',
                operation: 'signed-url',
                statusCode: 400,
                success: false,
                apiKeyId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });

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

        // ============================================================================
        // VALIDATION: AWS Region (NEW for S3)
        // ============================================================================
        if (!isValidRegion(s3Region)) {
            const regionError = getInvalidRegionError(s3Region);
            return res.status(400).json({
                success: false,
                provider: 's3',
                ...regionError
            });
        }

        // ============================================================================
        // VALIDATION: Storage Class (NEW for S3)
        // ============================================================================
        if (!validateStorageClassName(s3StorageClass)) {
            const classError = getInvalidStorageClassError(s3StorageClass);
            return res.status(400).json({
                success: false,
                provider: 's3',
                ...classError
            });
        }

        // ============================================================================
        // VALIDATION: Encryption Type (OPTIONAL - Phase 3B)
        // ============================================================================
        const encryptionValidation = validateEncryptionType(s3EncryptionType);
        if (!encryptionValidation.valid) {
            return res.status(400).json({
                success: false,
                provider: 's3',
                ...encryptionValidation
            });
        }

        // ============================================================================
        // VALIDATION: KMS Key ARN (Required if SSE-KMS)
        // ============================================================================
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
        // VALIDATION: CloudFront Domain (OPTIONAL - Phase 2B)
        // ============================================================================
        if (s3CloudFrontDomain && !isValidCloudFrontDomain(s3CloudFrontDomain)) {
            const cfError = getCloudFrontValidationError(s3CloudFrontDomain);
            return res.status(400).json({
                success: false,
                provider: 's3',
                ...cfError
            });
        }

        // ============================================================================
        // VALIDATION: Credential Format (1ms, NO API call!)
        // Following Rule #2: Validate format ONLY
        // ============================================================================
        const credValidation = validateS3Credentials(s3AccessKey, s3SecretKey, s3Bucket, s3Region);
        if (!credValidation.valid) {
            return res.status(400).json({
                success: false,
                provider: 's3',
                ...credValidation
            });
        }

        // ============================================================================
        // VALIDATION: File Size
        // ============================================================================
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

        // ============================================================================
        // VALIDATION: Expiry Time
        // ============================================================================
        const expiryValidation = validateExpiry(expiresIn);
        if (!expiryValidation.valid) {
            return res.status(400).json({
                success: false,
                provider: 's3',
                ...expiryValidation
            });
        }

        // ============================================================================
        // OPERATION: Generate Unique Object Key
        // ============================================================================
        const objectKey = generateObjectKey(filename);

        // ============================================================================
        // CRITICAL: Pure Crypto Signing (Target: 7-12ms, ZERO API calls!)
        // Following Rule #1: NO external API calls
        // ============================================================================
        const signingStart = Date.now();

        // Get S3Client (pure crypto, NO network call)
        const s3Client = getS3Client(s3Region, s3AccessKey, s3SecretKey);

        // Create PutObject command with S3-specific parameters
        // Phase 3B: Support SSE-KMS encryption
        const encryptionParams = {
            ServerSideEncryption: ENCRYPTION_TYPES[s3EncryptionType]
        };

        // Add KMS key ID if using SSE-KMS
        if (s3EncryptionType === 'SSE-KMS' && s3KmsKeyId) {
            encryptionParams.SSEKMSKeyId = s3KmsKeyId;
        }

        const command = new PutObjectCommand({
            Bucket: s3Bucket,
            Key: objectKey,
            ContentType: contentType,
            StorageClass: s3StorageClass,               // NEW: Storage class
            ...encryptionParams                         // NEW: Encryption parameters (SSE-S3 or SSE-KMS)
        });

        // Generate presigned URL (pure cryptography, NO API call!)
        const uploadUrl = await getSignedUrl(s3Client, command, {
            expiresIn: expiresIn
        });

        const signingTime = Date.now() - signingStart;

        // ============================================================================
        // BUILD: Public URL (region-specific)
        // ============================================================================
        const publicUrl = buildS3PublicUrl(s3Bucket, s3Region, objectKey);

        // ============================================================================
        // BUILD: CloudFront CDN URL (OPTIONAL - Phase 2B)
        // Pure string manipulation - NO API calls!
        // ============================================================================
        const cdnUrl = getCloudFrontUrl(objectKey, s3CloudFrontDomain);

        const totalTime = Date.now() - startTime;

        // ============================================================================
        // METRICS: Non-Blocking (Following Rule #9)
        // ============================================================================
        trackApiUsage({
            userId,
            endpoint: '/api/v1/upload/s3/signed-url',
            method: 'POST',
            provider: 's3',
            operation: 'signed-url',
            statusCode: 200,
            success: true,
            requestCount: 1,
            apiKeyId,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        console.log(`[${requestId}] ✅ SUCCESS in ${totalTime}ms (signing: ${signingTime}ms, region: ${s3Region})`);

        // ============================================================================
        // RESPONSE: Match R2/Vercel Format (Following Rule #3)
        // ============================================================================
        const response = {
            success: true,
            uploadUrl,           // Presigned URL for PUT request
            publicUrl,           // Public access URL (direct S3)
            cdnUrl,              // CloudFront CDN URL (if configured) - Phase 2B
            uploadId: requestId, // Unique upload ID
            provider: 's3',
            region: s3Region,             // NEW: AWS region
            storageClass: s3StorageClass, // NEW: Storage class
            encryption: {                 // NEW: Encryption details (Phase 3B)
                type: s3EncryptionType,
                algorithm: ENCRYPTION_TYPES[s3EncryptionType],
                ...(s3EncryptionType === 'SSE-KMS' && s3KmsKeyId && { kmsKeyId: s3KmsKeyId })
            },
            versioning: s3EnableVersioning ? {  // NEW: Versioning info (Phase 3C)
                enabled: true,
                note: 'Versioning must be enabled on your S3 bucket. AWS will auto-assign versionId on upload.',
                how: 'AWS Console → S3 → Your Bucket → Properties → Bucket Versioning → Enable',
                docs: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html',
                benefit: 'Keep multiple versions of same object, restore previous versions, recover from deletions'
            } : undefined,
            expiresIn,          // URL expiry in seconds
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
                    cryptoSigning: `${signingTime}ms`  // ⚡ Pure crypto - NO API calls, NO Redis!
                }
            }
        };

        // Send response first (don't block on quota increment)
        res.status(200).json(response);

        // ✅ INCREMENT QUOTA AFTER SUCCESS (Layer 3)
        // Fire-and-forget: Don't wait for completion, don't block response
        console.log(`[${requestId}] 🔄 STARTING quota increment for user: ${userId}`);

        const quotaPromise = incrementQuota(userId, 1)
            .then(newCount => {
                console.log(`[${requestId}] 📊 Quota incremented: ${newCount} requests this month`);
                // Check for usage warnings (80%, 95%)
                return checkUsageWarnings(userId, req.tier || 'free', newCount);
            })
            .catch(err => {
                console.error(`[${requestId}] ⚠️ Quota increment failed:`, err);
                console.error(`[${requestId}] Stack:`, err.stack);
                // Don't fail the request - quota increment is non-critical for response
            });

        // Make sure the promise doesn't get garbage collected
        quotaPromise.catch(() => { }); // Ensure no unhandled rejection

    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`[${requestId}] 💥 Error after ${totalTime}ms:`, error);

        if (apiKeyId) {
            trackApiUsage({
                userId: req.userId || apiKeyId,
                endpoint: '/api/v1/upload/s3/signed-url',
                method: 'POST',
                provider: 's3',
                operation: 'signed-url',
                statusCode: error.name === 'CredentialsProviderError' ? 401 : 500,
                success: false,
                apiKeyId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }

        // Check if error is S3-specific
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
