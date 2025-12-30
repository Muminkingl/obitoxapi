/**
 * R2 Time-Limited Download URLs
 * Generate presigned download URLs with configurable expiry
 * Uses pure crypto signing - NO external API calls
 * 
 * Target Performance: <30ms
 * Architecture: Request → Memory Guard (1ms) → Pure Crypto (5-10ms) → Response
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
import { updateR2Metrics } from './r2.helpers.js';
import { checkMemoryRateLimit } from './cache/memory-guard.js';

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
            fileKey,              // Object key (filename) to download
            r2AccessKey,
            r2SecretKey,
            r2AccountId,
            r2Bucket,
            r2PublicUrl,          // Optional custom domain
            expiresIn = SIGNED_URL_EXPIRY  // Default: 1 hour
        } = req.body;

        const apiKeyId = req.apiKeyId;
        const userId = req.userId || apiKeyId;

        console.log(`[${requestId}] 🔗 Download URL request for: ${fileKey}`);

        // ============================================================================
        // LAYER 1: Memory Guard (Target: 0-2ms)
        // For pure crypto operations, lightweight rate limiting only
        // ============================================================================
        const memoryStart = Date.now();
        const memCheck = checkMemoryRateLimit(userId, 'r2-download');
        const memoryTime = Date.now() - memoryStart;

        if (!memCheck.allowed) {
            console.log(`[${requestId}] ❌ Blocked by memory guard in ${memoryTime}ms`);
            return res.status(429).json(formatR2Error(
                'RATE_LIMIT_EXCEEDED',
                'Rate limit exceeded - too many download URL requests',
                'Wait a moment and try again'
            ));
        }

        // ============================================================================
        // VALIDATION: Required Fields
        // ============================================================================
        if (!fileKey || !r2AccessKey || !r2SecretKey || !r2AccountId || !r2Bucket) {
            return res.status(400).json(formatR2Error(
                'MISSING_PARAMETERS',
                'fileKey, r2AccessKey, r2SecretKey, r2AccountId, and r2Bucket are required',
                'Include all R2 credentials and file key in request body'
            ));
        }

        // ============================================================================
        // VALIDATION: Expiry Time
        // ============================================================================
        const expiryInt = parseInt(expiresIn);

        if (isNaN(expiryInt) || expiryInt < MIN_EXPIRY || expiryInt > MAX_EXPIRY) {
            return res.status(400).json(formatR2Error(
                'INVALID_EXPIRY',
                `expiresIn must be between ${MIN_EXPIRY} (1 minute) and ${MAX_EXPIRY} (7 days) seconds`,
                `Valid range: 60 to 604800 seconds. You provided: ${expiresIn}`
            ));
        }

        // ============================================================================
        // CRYPTO SIGNING: Generate Presigned Download URL
        // This is pure cryptographic operation - ZERO external API calls!
        // ============================================================================
        const signingStart = Date.now();

        // Create R2 client (configured for S3-compatible operations)
        const client = getR2Client(r2AccountId, r2AccessKey, r2SecretKey);

        // Create GetObject command for download
        const command = new GetObjectCommand({
            Bucket: r2Bucket,
            Key: fileKey
        });

        // Generate presigned download URL (pure crypto, 5-10ms)
        const downloadUrl = await getSignedUrl(client, command, {
            expiresIn: expiryInt
        });

        const signingTime = Date.now() - signingStart;

        // Build public URL (for reference)
        const publicUrl = buildPublicUrl(r2AccountId, r2Bucket, fileKey, r2PublicUrl);

        const totalTime = Date.now() - startTime;

        console.log(`[${requestId}] ✅ Download URL generated in ${totalTime}ms (signing: ${signingTime}ms)`);

        // ============================================================================
        // ANALYTICS: Non-blocking metrics update
        // ============================================================================
        updateR2Metrics(apiKeyId, userId, 'r2', 'success', 0, {
            operation: 'download-url',
            fileKey,
            expiresIn: expiryInt,
            responseTime: totalTime
        }).catch(() => { });

        // ============================================================================
        // RESPONSE: Same format as other R2 operations
        // ============================================================================
        return res.status(200).json({
            success: true,
            provider: 'r2',
            downloadUrl,          // Presigned URL for direct download
            publicUrl,            // Public URL (for reference only)
            fileKey,
            bucket: r2Bucket,
            expiresIn: expiryInt,
            expiresAt: new Date(Date.now() + expiryInt * 1000).toISOString(),
            performance: {
                requestId,
                totalTime: `${totalTime}ms`,
                breakdown: {
                    memoryGuard: `${memoryTime}ms`,
                    cryptoSigning: `${signingTime}ms`  // ⚡ Pure crypto - NO API calls!
                }
            }
        });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`[${requestId}] ❌ Download URL error (${totalTime}ms):`, error.message);

        // Track failed request
        if (req.apiKeyId) {
            updateR2Metrics(req.apiKeyId, req.userId, 'r2', 'failed', 0, {
                operation: 'download-url',
                error: error.message,
                responseTime: totalTime
            }).catch(() => { });
        }

        // Handle specific error types
        if (error.name === 'NoSuchKey' || error.name === 'NotFound') {
            return res.status(404).json(formatR2Error(
                'FILE_NOT_FOUND',
                'File not found in R2 bucket',
                `Check that the file key "${req.body.fileKey}" exists and the bucket name is correct`
            ));
        }

        if (error.name === 'AccessDenied') {
            return res.status(403).json(formatR2Error(
                'ACCESS_DENIED',
                'Access denied to R2 bucket',
                'Check that your R2 credentials have read permissions for this bucket'
            ));
        }

        return res.status(500).json(formatR2Error(
            'DOWNLOAD_URL_FAILED',
            'Failed to generate download URL',
            error.message
        ));
    }
};
