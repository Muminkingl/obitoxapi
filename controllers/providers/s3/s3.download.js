/**
 * AWS S3 Download Controller
 * 
 * Generate presigned download URLs for S3 objects
 * 
 * Performance: 5-10ms (pure crypto, zero API calls)
 * 
 * CRITICAL:
 * - NO external API calls in request path
 * - Pure cryptographic signing
 * - Optional CloudFront CDN URLs
 */

import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
    validateS3Credentials,
    validateExpiry,
    getS3Client,
    formatS3Response,
    formatS3Error,
    SIGNED_URL_EXPIRY
} from './s3.config.js';
import { buildS3PublicUrl, isValidRegion, getInvalidRegionError } from '../../../utils/aws/s3-regions.js';
import { getCloudFrontUrl, isValidCloudFrontDomain, getCloudFrontValidationError } from '../../../utils/aws/s3-cloudfront.js';
import { checkUserQuota, trackApiUsage } from '../shared/analytics.new.js';
import { incrementQuota, checkUsageWarnings } from '../../../utils/quota-manager.js';

// Import memory guard
import { checkMemoryRateLimit } from '../r2/cache/memory-guard.js';

console.log('🔄 [S3 DOWNLOAD] Module loaded!');

/**
 * Generate S3 presigned download URL
 * POST /api/v1/download/s3/signed-url
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export const generateS3DownloadUrl = async (req, res) => {
    const requestId = `dl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    let apiKeyId;

    try {
        const {
            key,                          // Required: S3 object key
            s3AccessKey,                  // Required: AWS Access Key
            s3SecretKey,                  // Required: AWS Secret Key
            s3Bucket,                     // Required: S3 bucket name
            s3Region = 'us-east-1',       // Optional: AWS region
            s3CloudFrontDomain,           // Optional: CloudFront CDN domain
            expiresIn = SIGNED_URL_EXPIRY, // Optional: URL expiry
            responseContentType,          // Optional: Override Content-Type
            responseContentDisposition    // Optional: e.g., "attachment; filename=photo.jpg"
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
        // LAYER 1: Memory Guard
        // ============================================================================
        const memoryStart = Date.now();
        const memCheck = checkMemoryRateLimit(userId, 'download');
        const memoryTime = Date.now() - memoryStart;

        if (!memCheck.allowed) {
            console.log(`[${requestId}] ❌ Blocked by memory guard in ${memoryTime}ms`);
            return res.status(429).json(formatS3Error(
                'RATE_LIMIT_EXCEEDED',
                'Rate limit exceeded - too many requests'
            ));
        }

        // ============================================================================
        // LAYER 2: User Quota Check
        // ============================================================================
        const quotaCheck = await checkUserQuota(userId);
        if (!quotaCheck.allowed) {
            trackApiUsage({
                userId,
                endpoint: '/api/v1/download/s3/signed-url',
                method: 'POST',
                provider: 's3',
                operation: 'download',
                statusCode: 429,
                success: false,
                apiKeyId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
            return res.status(429).json(formatS3Error(
                'QUOTA_EXCEEDED',
                'Monthly quota exceeded'
            ));
        }

        // ============================================================================
        // VALIDATION: Required Fields
        // ============================================================================
        if (!key) {
            return res.status(400).json(formatS3Error(
                'MISSING_KEY',
                'S3 object key is required',
                'Provide the key parameter (e.g., "upl123_photo.jpg")'
            ));
        }

        if (!s3AccessKey || !s3SecretKey || !s3Bucket) {
            return res.status(400).json(formatS3Error(
                'MISSING_S3_CREDENTIALS',
                'S3 credentials are required: s3AccessKey, s3SecretKey, s3Bucket'
            ));
        }

        // ============================================================================
        // VALIDATION: Credentials & Region
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
            const regionError = getInvalidRegionError(s3Region);
            return res.status(400).json({
                success: false,
                provider: 's3',
                ...regionError
            });
        }

        // ============================================================================
        // VALIDATION: CloudFront Domain (Optional)
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
        // OPERATION: Generate Download URL (Pure Crypto)
        // ============================================================================
        const signingStart = Date.now();

        const s3Client = getS3Client(s3Region, s3AccessKey, s3SecretKey);

        // Build GetObject command
        const commandParams = {
            Bucket: s3Bucket,
            Key: key
        };

        // Add optional response header overrides
        if (responseContentType) {
            commandParams.ResponseContentType = responseContentType;
        }

        if (responseContentDisposition) {
            commandParams.ResponseContentDisposition = responseContentDisposition;
        }

        const command = new GetObjectCommand(commandParams);

        // Generate presigned download URL (pure crypto, NO API call!)
        const downloadUrl = await getSignedUrl(s3Client, command, {
            expiresIn
        });

        const signingTime = Date.now() - signingStart;

        // ============================================================================
        // BUILD: Public and CDN URLs
        // ============================================================================
        const publicUrl = buildS3PublicUrl(s3Bucket, s3Region, key);
        const cdnUrl = getCloudFrontUrl(key, s3CloudFrontDomain);

        const totalTime = Date.now() - startTime;

        // ============================================================================
        // ANALYTICS
        // ============================================================================
        trackApiUsage({
            userId,
            endpoint: '/api/v1/download/s3/signed-url',
            method: 'POST',
            provider: 's3',
            operation: 'download',
            statusCode: 200,
            success: true,
            requestCount: 1,
            apiKeyId,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        console.log(`[${requestId}] ✅ Download URL generated in ${totalTime}ms (signing: ${signingTime}ms)`);

        // ============================================================================
        // RESPONSE
        // ============================================================================
        const response = {
            success: true,
            downloadUrl,
            publicUrl,
            cdnUrl,
            key,
            provider: 's3',
            region: s3Region,
            expiresIn,
            expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
            hint: cdnUrl
                ? 'Use cdnUrl for faster global delivery via CloudFront'
                : 'Use downloadUrl to download the file',
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
        console.error(`[${requestId}] 💥 Download URL error after ${totalTime}ms:`, error);

        if (apiKeyId) {
            trackApiUsage({
                userId: req.userId || apiKeyId,
                endpoint: '/api/v1/download/s3/signed-url',
                method: 'POST',
                provider: 's3',
                operation: 'download',
                statusCode: 500,
                success: false,
                apiKeyId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }

        return res.status(500).json(formatS3Error(
            'S3_DOWNLOAD_ERROR',
            'Failed to generate download URL',
            process.env.NODE_ENV === 'development' ? error.message : null
        ));
    }
};
