/**
 * R2 Time-Limited Download URLs
 * Generate presigned download URLs with configurable expiry
 * Uses pure crypto signing - NO external API calls
 * 
 * OPTIMIZED: Uses only updateRequestMetrics (Redis-backed)
 */

import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
    getR2Client,
    formatR2Error,
    buildPublicUrl,
    SIGNED_URL_EXPIRY,
    MAX_EXPIRY,
    MIN_EXPIRY
} from './r2.config.js';
import { checkMemoryRateLimit } from './cache/memory-guard.js';
import logger from '../../../utils/logger.js';

// Quota check
import { checkUserQuota } from '../shared/analytics.new.js';

// 🚀 REDIS METRICS: Single source of truth
import { updateRequestMetrics } from '../shared/metrics.helper.js';

/**
 * Generate time-limited download URL for R2 file
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export const generateR2DownloadUrl = async (req, res) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
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

        // LAYER 1: Memory Guard
        const memoryStart = Date.now();
        const memCheck = checkMemoryRateLimit(userId, 'r2-download');
        const memoryTime = Date.now() - memoryStart;

        if (!memCheck.allowed) {
            return res.status(429).json(formatR2Error(
                'RATE_LIMIT_EXCEEDED',
                'Rate limit exceeded - too many download URL requests',
                'Wait a moment and try again'
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

        // VALIDATION: Required Fields
        if (!fileKey || !r2AccessKey || !r2SecretKey || !r2AccountId || !r2Bucket) {
            return res.status(400).json(formatR2Error(
                'MISSING_PARAMETERS',
                'fileKey, r2AccessKey, r2SecretKey, r2AccountId, and r2Bucket are required',
                'Include all R2 credentials and file key in request body'
            ));
        }

        // VALIDATION: Expiry Time
        const expiryInt = parseInt(expiresIn);

        if (isNaN(expiryInt) || expiryInt < MIN_EXPIRY || expiryInt > MAX_EXPIRY) {
            return res.status(400).json(formatR2Error(
                'INVALID_EXPIRY',
                `expiresIn must be between ${MIN_EXPIRY} (1 minute) and ${MAX_EXPIRY} (7 days) seconds`,
                `Valid range: 60 to 604800 seconds. You provided: ${expiresIn}`
            ));
        }

        // CRYPTO SIGNING: Generate Presigned Download URL
        const signingStart = Date.now();

        const client = getR2Client(r2AccountId, r2AccessKey, r2SecretKey);

        const command = new GetObjectCommand({
            Bucket: r2Bucket,
            Key: fileKey
        });

        const downloadUrl = await getSignedUrl(client, command, {
            expiresIn: expiryInt
        });

        const signingTime = Date.now() - signingStart;

        const publicUrl = buildPublicUrl(r2AccountId, r2Bucket, fileKey, r2PublicUrl);

        const totalTime = Date.now() - startTime;

        // 🚀 SINGLE METRICS CALL (Redis-backed)
        updateRequestMetrics(apiKeyId, userId, 'r2', true)
            .catch(() => { });

        logger.info(`[${requestId}] ✅ Download URL generated in ${totalTime}ms`);

        return res.status(200).json({
            success: true,
            provider: 'r2',
            downloadUrl,
            publicUrl,
            fileKey,
            bucket: r2Bucket,
            expiresIn: expiryInt,
            expiresAt: new Date(Date.now() + expiryInt * 1000).toISOString(),
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
        logger.error(`r2 error:`, { error });

        if (req.apiKeyId) {
            updateRequestMetrics(req.apiKeyId, req.userId || req.apiKeyId, 'r2', false)
                .catch(() => { });
        }

        if (error.name === 'NoSuchKey' || error.name === 'NotFound') {
            return res.status(404).json(formatR2Error(
                'FILE_NOT_FOUND',
                'File not found in R2 bucket',
                `Check that the file key "${req.body.fileKey}" exists`
            ));
        }

        if (error.name === 'AccessDenied') {
            return res.status(403).json(formatR2Error(
                'ACCESS_DENIED',
                'Access denied to R2 bucket',
                'Check that your R2 credentials have read permissions'
            ));
        }

        return res.status(500).json(formatR2Error(
            'DOWNLOAD_URL_FAILED',
            'Failed to generate download URL',
            process.env.NODE_ENV === 'development' ? error.message : null
        ));
    }
};
