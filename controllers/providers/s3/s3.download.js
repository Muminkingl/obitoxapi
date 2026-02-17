/**
 * AWS S3 Download Controller
 * Generate presigned download URLs for S3 objects
 * 
 * OPTIMIZED: Uses only updateRequestMetrics (Redis-backed)
 */

import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
    validateS3Credentials,
    validateExpiry,
    getS3Client,
    formatS3Error,
    SIGNED_URL_EXPIRY
} from './s3.config.js';
import { buildS3PublicUrl, isValidRegion, getInvalidRegionError } from '../../../utils/aws/s3-regions.js';
import { getCloudFrontUrl, isValidCloudFrontDomain, getCloudFrontValidationError } from '../../../utils/aws/s3-cloudfront.js';
import { checkUserQuota } from '../shared/analytics.new.js';
import { incrementQuota } from '../../../utils/quota-manager.js';

// 🚀 REDIS METRICS: Single source of truth
import { updateRequestMetrics } from '../shared/metrics.helper.js';

// Import memory guard
import { checkMemoryRateLimit } from '../r2/cache/memory-guard.js';

/**
 * Generate S3 presigned download URL
 */
export const generateS3DownloadUrl = async (req, res) => {
    const requestId = `dl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    let apiKeyId;

    try {
        const {
            key,
            s3AccessKey,
            s3SecretKey,
            s3Bucket,
            s3Region = 'us-east-1',
            s3CloudFrontDomain,
            s3Endpoint,  // Custom endpoint for MinIO/LocalStack
            expiresIn = SIGNED_URL_EXPIRY,
            responseContentType,
            responseContentDisposition
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
        const memCheck = checkMemoryRateLimit(userId, 'download');
        const memoryTime = Date.now() - memoryStart;

        if (!memCheck.allowed) {
            return res.status(429).json(formatS3Error(
                'RATE_LIMIT_EXCEEDED',
                'Rate limit exceeded - too many requests'
            ));
        }

        // LAYER 2: Quota Check (OPT-2: use MW2 data if available, else fallback)
        const quotaCheck = req.quotaChecked || await checkUserQuota(userId);
        if (!quotaCheck.allowed) {
            return res.status(429).json(formatS3Error(
                'QUOTA_EXCEEDED',
                'Monthly quota exceeded'
            ));
        }

        // VALIDATION
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

        const credValidation = validateS3Credentials(s3AccessKey, s3SecretKey, s3Bucket, s3Region, s3Endpoint);
        if (!credValidation.valid) {
            return res.status(400).json({
                success: false,
                provider: 's3',
                ...credValidation
            });
        }

        if (!s3Endpoint && !isValidRegion(s3Region)) {
            const regionError = getInvalidRegionError(s3Region);
            return res.status(400).json({
                success: false,
                provider: 's3',
                ...regionError
            });
        }

        if (s3CloudFrontDomain && !isValidCloudFrontDomain(s3CloudFrontDomain)) {
            const cfError = getCloudFrontValidationError(s3CloudFrontDomain);
            return res.status(400).json({
                success: false,
                provider: 's3',
                ...cfError
            });
        }

        const expiryValidation = validateExpiry(expiresIn);
        if (!expiryValidation.valid) {
            return res.status(400).json({
                success: false,
                provider: 's3',
                ...expiryValidation
            });
        }

        // CRYPTO SIGNING
        const signingStart = Date.now();
        const s3Client = getS3Client(s3Region, s3AccessKey, s3SecretKey, s3Endpoint);

        const commandParams = {
            Bucket: s3Bucket,
            Key: key
        };

        if (responseContentType) {
            commandParams.ResponseContentType = responseContentType;
        }

        if (responseContentDisposition) {
            commandParams.ResponseContentDisposition = responseContentDisposition;
        }

        const command = new GetObjectCommand(commandParams);
        const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn });
        const signingTime = Date.now() - signingStart;

        // BUILD URLs
        const publicUrl = buildS3PublicUrl(s3Bucket, s3Region, key);
        const cdnUrl = getCloudFrontUrl(key, s3CloudFrontDomain);

        const totalTime = Date.now() - startTime;

        // 🚀 SINGLE METRICS CALL (Redis-backed)
        updateRequestMetrics(apiKeyId, userId, 's3', true)
            .catch(() => { });

        console.log(`[${requestId}] ✅ Download URL generated in ${totalTime}ms`);

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
        incrementQuota(userId, 1).catch(() => { });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`[${requestId}] 💥 Download URL error after ${totalTime}ms:`, error);

        if (apiKeyId) {
            updateRequestMetrics(apiKeyId, req.userId || apiKeyId, 's3', false)
                .catch(() => { });
        }

        return res.status(500).json(formatS3Error(
            'S3_DOWNLOAD_ERROR',
            'Failed to generate download URL',
            process.env.NODE_ENV === 'development' ? error.message : null
        ));
    }
};
