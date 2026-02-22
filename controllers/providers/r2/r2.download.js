/**
 * Download/Get Info for File from Cloudflare R2
 * Uses AWS SDK HeadObjectCommand to get metadata
 * 
 * OPTIMIZED: Uses only updateRequestMetrics (Redis-backed)
 */

import { HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getR2Client, buildPublicUrl, formatR2Error, SIGNED_URL_EXPIRY } from './r2.config.js';
import logger from '../../../utils/logger.js';

// Quota check
import { checkUserQuota } from '../shared/analytics.new.js';

// Import memory guard
import { checkMemoryRateLimit } from './cache/memory-guard.js';

import { updateRequestMetrics } from '../shared/metrics.helper.js';

/**
 * Get file info and download URL from R2
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export const downloadR2File = async (req, res) => {
    const startTime = Date.now();

    try {
        const {
            fileKey,
            r2AccessKey,
            r2SecretKey,
            r2AccountId,
            r2Bucket,
            r2PublicUrl,
            expiresIn = SIGNED_URL_EXPIRY
        } = req.body;

        const apiKeyId = req.apiKeyId;
        const userId = req.userId || apiKeyId;

        if (!apiKeyId) {
            return res.status(401).json(formatR2Error(
                'UNAUTHORIZED',
                'API key is required'
            ));
        }

        // LAYER 1: Memory Guard (fastest possible)
        const memCheck = checkMemoryRateLimit(userId, 'r2-download');
        if (!memCheck.allowed) {
            return res.status(429).json(formatR2Error(
                'RATE_LIMIT_EXCEEDED',
                'Rate limit exceeded - too many download requests',
                'Wait a moment before trying again'
            ));
        }

        // QUOTA CHECK (OPT-2: use MW2 data if available, else fallback)
        const quotaCheck = req.quotaChecked || await checkUserQuota(userId);
        if (!quotaCheck.allowed) {
            return res.status(403).json(formatR2Error(
                'QUOTA_EXCEEDED',
                'Monthly quota exceeded',
                `Used: ${quotaCheck.current || quotaCheck.used}, Limit: ${quotaCheck.limit}`
            ));
        }

        // Validate required fields
        if (!fileKey || !r2AccessKey || !r2SecretKey || !r2AccountId || !r2Bucket) {
            return res.status(400).json(formatR2Error(
                'MISSING_PARAMETERS',
                'fileKey, r2AccessKey, r2SecretKey, r2AccountId, and r2Bucket are required'
            ));
        }

        // Get S3Client
        const s3Client = getR2Client(r2AccountId, r2AccessKey, r2SecretKey);

        // Get file metadata
        const headCommand = new HeadObjectCommand({
            Bucket: r2Bucket,
            Key: fileKey
        });

        const metadata = await s3Client.send(headCommand);

        // Generate presigned download URL
        const getCommand = new GetObjectCommand({
            Bucket: r2Bucket,
            Key: fileKey
        });

        const downloadUrl = await getSignedUrl(s3Client, getCommand, {
            expiresIn
        });

        // Build public URL
        const publicUrl = buildPublicUrl(r2AccountId, r2Bucket, fileKey, r2PublicUrl);

        const totalTime = Date.now() - startTime;

        // 🚀 SINGLE METRICS CALL (Redis-backed)
        updateRequestMetrics(apiKeyId, userId, 'r2', true)
            .catch(() => { });

        return res.status(200).json({
            success: true,
            provider: 'r2',
            data: {
                fileKey,
                bucket: r2Bucket,
                publicUrl,
                downloadUrl,
                metadata: {
                    contentType: metadata.ContentType,
                    contentLength: metadata.ContentLength,
                    lastModified: metadata.LastModified,
                    etag: metadata.ETag
                },
                expiresIn
            },
            performance: {
                totalTime: `${totalTime}ms`
            }
        });

    } catch (error) {
        logger.error(`r2 error:`, { error });

        if (req.apiKeyId) {
            updateRequestMetrics(req.apiKeyId, req.userId || req.apiKeyId, 'r2', false)
                .catch(() => { });
        }

        if (error.name === 'NotFound') {
            return res.status(404).json(formatR2Error(
                'FILE_NOT_FOUND',
                'File not found in R2 bucket',
                'Check that the file key and bucket name are correct'
            ));
        }

        return res.status(500).json(formatR2Error(
            'DOWNLOAD_FAILED',
            'Failed to get file info from R2',
            process.env.NODE_ENV === 'development' ? error.message : null
        ));
    }
};
