/**
 * Generate Presigned URL for Cloudflare R2 Upload
 * CRITICAL PERFORMANCE: Pure cryptographic signing (5-10ms, ZERO external API calls)
 * 
 * OPTIMIZED: Uses only updateRequestMetrics (Redis-backed)
 */

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
    validateR2Credentials,
    validateExpiry,
    validateFileSize,
    getR2Client,
    buildPublicUrl,
    formatR2Error,
    SIGNED_URL_EXPIRY
} from './r2.config.js';
import { generateR2Filename } from './r2.helpers.js';
import { checkUserQuota } from '../shared/analytics.new.js';
import { incrementQuota, checkUsageWarnings } from '../../../utils/quota-manager.js';

// 🚀 REDIS METRICS: Single source of truth
import { updateRequestMetrics } from '../shared/metrics.helper.js';

// Import memory guard only (Redis not needed for pure crypto!)
import { checkMemoryRateLimit } from './cache/memory-guard.js';

/**
 * Generate presigned URL for R2 upload
 * Target Performance: 5-15ms P95
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export const generateR2SignedUrl = async (req, res) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    let apiKeyId;

    try {
        const {
            filename,
            contentType,
            fileSize,
            r2AccessKey,
            r2SecretKey,
            r2AccountId,
            r2Bucket,
            r2PublicUrl,
            expiresIn = SIGNED_URL_EXPIRY
        } = req.body;

        apiKeyId = req.apiKeyId;
        const userId = req.userId || apiKeyId;

        if (!apiKeyId) {
            return res.status(401).json(formatR2Error(
                'UNAUTHORIZED',
                'API key is required'
            ));
        }

        // LAYER 1: Memory Guard (Target: 0-2ms)
        const memoryStart = Date.now();
        const memCheck = checkMemoryRateLimit(userId, 'upload');
        const memoryTime = Date.now() - memoryStart;

        if (!memCheck.allowed) {
            return res.status(429).json(formatR2Error(
                'RATE_LIMIT_EXCEEDED',
                'Rate limit exceeded - too many requests',
                'Wait a moment and try again'
            ));
        }

        // LAYER 2: User Quota Check
        const quotaCheck = await checkUserQuota(userId);
        if (!quotaCheck.allowed) {
            return res.status(429).json(formatR2Error(
                'QUOTA_EXCEEDED',
                'Monthly quota exceeded',
                'Please upgrade your plan'
            ));
        }

        // VALIDATION: Required Fields
        if (!filename || !contentType) {
            updateRequestMetrics(apiKeyId, userId, 'r2', false).catch(() => { });

            return res.status(400).json(formatR2Error(
                'MISSING_PARAMETERS',
                'filename and contentType are required',
                'Provide filename and contentType in request body'
            ));
        }

        if (!r2AccessKey || !r2SecretKey || !r2AccountId || !r2Bucket) {
            updateRequestMetrics(apiKeyId, userId, 'r2', false).catch(() => { });

            return res.status(400).json(formatR2Error(
                'MISSING_R2_CREDENTIALS',
                'R2 credentials are required: r2AccessKey, r2SecretKey, r2AccountId, r2Bucket',
                'Get your R2 credentials from Cloudflare Dashboard → R2 → Manage R2 API Tokens'
            ));
        }

        // VALIDATION: Credential Format
        const credValidation = validateR2Credentials(r2AccessKey, r2SecretKey, r2AccountId, r2Bucket);
        if (!credValidation.valid) {
            updateRequestMetrics(apiKeyId, userId, 'r2', false).catch(() => { });

            return res.status(400).json({
                success: false,
                provider: 'r2',
                ...credValidation
            });
        }

        // VALIDATION: File Size
        if (fileSize) {
            const sizeValidation = validateFileSize(fileSize);
            if (!sizeValidation.valid) {
                updateRequestMetrics(apiKeyId, userId, 'r2', false).catch(() => { });

                return res.status(400).json({
                    success: false,
                    provider: 'r2',
                    ...sizeValidation
                });
            }
        }

        // VALIDATION: Expiry Time
        const expiryValidation = validateExpiry(expiresIn);
        if (!expiryValidation.valid) {
            updateRequestMetrics(apiKeyId, userId, 'r2', false).catch(() => { });

            return res.status(400).json({
                success: false,
                provider: 'r2',
                ...expiryValidation
            });
        }

        // OPERATION: Generate Unique Object Key
        const objectKey = generateR2Filename(filename, apiKeyId);

        // CRITICAL: Pure Crypto Signing (Target: 5-10ms, ZERO API calls!)
        const signingStart = Date.now();

        // Get S3Client (pure crypto, NO network call)
        const s3Client = getR2Client(r2AccountId, r2AccessKey, r2SecretKey);

        // Create PutObject command
        const command = new PutObjectCommand({
            Bucket: r2Bucket,
            Key: objectKey,
            ContentType: contentType
        });

        // Generate presigned URL (pure cryptography, NO API call!)
        const uploadUrl = await getSignedUrl(s3Client, command, {
            expiresIn: expiresIn
        });

        const signingTime = Date.now() - signingStart;

        // BUILD: Public URL
        const publicUrl = buildPublicUrl(r2AccountId, r2Bucket, objectKey, r2PublicUrl);

        const totalTime = Date.now() - startTime;

        // 🚀 SINGLE METRICS CALL (Redis-backed, non-blocking)
        updateRequestMetrics(apiKeyId, userId, 'r2', true, { fileSize: fileSize || 0 })
            .catch(() => { });

        // ✅ INCREMENT QUOTA (fire-and-forget, non-blocking)
        incrementQuota(userId, 1)
            .then(newCount => {
                console.log(`[${requestId}] 📊 Quota incremented: ${newCount}`);
            })
            .catch(err => {
                console.error(`[${requestId}] ⚠️ Quota increment failed:`, err.message);
            });

        console.log(`[${requestId}] ✅ SUCCESS in ${totalTime}ms (signing: ${signingTime}ms)`);

        // RESPONSE: Match Vercel Format
        return res.status(200).json({
            success: true,
            uploadUrl,
            publicUrl,
            uploadId: requestId,
            provider: 'r2',
            expiresIn,
            data: {
                filename: objectKey,
                originalFilename: filename,
                contentType,
                bucket: r2Bucket,
                accountId: r2AccountId,
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
        });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`[${requestId}] 💥 Error after ${totalTime}ms:`, error);

        if (apiKeyId) {
            updateRequestMetrics(apiKeyId, req.userId || apiKeyId, 'r2', false)
                .catch(() => { });
        }

        // Check if error is R2-specific
        if (error.name === 'CredentialsProviderError') {
            return res.status(401).json(formatR2Error(
                'INVALID_R2_CREDENTIALS',
                'R2 credentials format is invalid',
                'Check your Access Key ID and Secret Access Key'
            ));
        }

        return res.status(500).json(formatR2Error(
            'SERVER_ERROR',
            'Internal server error during signed URL generation',
            process.env.NODE_ENV === 'development' ? error.message : null
        ));
    }
};
