/**
 * Generate Presigned URL for Cloudflare R2 Upload
 * CRITICAL PERFORMANCE: Pure cryptographic signing (5-10ms, ZERO external API calls)
 * 
 * Following Rule #1: NO external API calls in request path
 * Following Rule #2: Validate format only, NOT credentials
 * Following Rule #3: Response format identical to Vercel
 */

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
    validateR2Credentials,
    validateExpiry,
    validateFileSize,
    getR2Client,
    generateObjectKey,
    buildPublicUrl,
    formatR2Response,
    formatR2Error,
    SIGNED_URL_EXPIRY
} from './r2.config.js';
import { updateR2Metrics, logR2Upload, generateR2Filename } from './r2.helpers.js';

// Import memory guard only (Redis not needed for pure crypto!)
import { checkMemoryRateLimit } from './cache/memory-guard.js';

/**
 * Generate presigned URL for R2 upload
 * Target Performance: 5-15ms P95
 * 
 * Architecture:
 * Request → Memory Guard (1ms) → Pure Crypto Signing (5-10ms) → Response
 * Total: 6-11ms ✅ (NO Redis needed - crypto costs nothing!)
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
            r2AccessKey,        // Shorter, matches vercelToken pattern
            r2SecretKey,        // Shorter, matches supabaseKey pattern
            r2AccountId,
            r2Bucket,
            r2PublicUrl,  // Optional custom domain
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
            return res.status(429).json(formatR2Error(
                'RATE_LIMIT_EXCEEDED',
                'Rate limit exceeded - too many requests',
                'Wait a moment and try again'
            ));
        }

        // ============================================================================
        // VALIDATION: Required Fields
        // ============================================================================
        if (!filename || !contentType) {
            updateR2Metrics(apiKeyId, userId, 'r2', 'failed', 0).catch(() => { });

            return res.status(400).json(formatR2Error(
                'MISSING_PARAMETERS',
                'filename and contentType are required',
                'Provide filename and contentType in request body'
            ));
        }

        if (!r2AccessKey || !r2SecretKey || !r2AccountId || !r2Bucket) {
            updateR2Metrics(apiKeyId, userId, 'r2', 'failed', 0).catch(() => { });

            return res.status(400).json(formatR2Error(
                'MISSING_R2_CREDENTIALS',
                'R2 credentials are required: r2AccessKey, r2SecretKey, r2AccountId, r2Bucket',
                'Get your R2 credentials from Cloudflare Dashboard → R2 → Manage R2 API Tokens'
            ));
        }

        // ============================================================================
        // VALIDATION: Credential Format (1ms, NO API call!)
        // Following Rule #2: Validate format ONLY
        // ============================================================================
        const credValidation = validateR2Credentials(r2AccessKey, r2SecretKey, r2AccountId, r2Bucket);
        if (!credValidation.valid) {
            updateR2Metrics(apiKeyId, userId, 'r2', 'failed', 0).catch(() => { });

            return res.status(400).json({
                success: false,
                provider: 'r2',
                ...credValidation
            });
        }

        // ============================================================================
        // VALIDATION: File Size
        // ============================================================================
        if (fileSize) {
            const sizeValidation = validateFileSize(fileSize);
            if (!sizeValidation.valid) {
                updateR2Metrics(apiKeyId, userId, 'r2', 'failed', 0).catch(() => { });

                return res.status(400).json({
                    success: false,
                    provider: 'r2',
                    ...sizeValidation
                });
            }
        }

        // ============================================================================
        // VALIDATION: Expiry Time
        // ============================================================================
        const expiryValidation = validateExpiry(expiresIn);
        if (!expiryValidation.valid) {
            updateR2Metrics(apiKeyId, userId, 'r2', 'failed', 0).catch(() => { });

            return res.status(400).json({
                success: false,
                provider: 'r2',
                ...expiryValidation
            });
        }

        // ============================================================================
        // OPERATION: Generate Unique Object Key
        // ============================================================================
        const objectKey = generateR2Filename(filename, apiKeyId);

        // ============================================================================
        // CRITICAL: Pure Crypto Signing (Target: 5-10ms, ZERO API calls!)
        // Following Rule #1: NO external API calls
        // ============================================================================
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

        // ============================================================================
        // BUILD: Public URL
        // ============================================================================
        const publicUrl = buildPublicUrl(r2AccountId, r2Bucket, objectKey, r2PublicUrl);

        const totalTime = Date.now() - startTime;

        // ============================================================================
        // LOGGING: Non-Blocking (Following Rule #6)
        // ============================================================================
        logR2Upload(
            apiKeyId,
            userId,
            'r2',
            objectKey,
            contentType,
            fileSize || 0,
            'initiated',
            publicUrl
        ).catch(() => { });

        // ============================================================================
        // METRICS: Non-Blocking (Following Rule #9)
        // ============================================================================
        updateR2Metrics(apiKeyId, userId, 'r2', 'success', fileSize || 0, contentType)
            .catch(() => { });

        console.log(`[${requestId}] ✅ SUCCESS in ${totalTime}ms (signing: ${signingTime}ms)`);

        // ============================================================================
        // RESPONSE: Match Vercel Format (Following Rule #3)
        // ============================================================================
        return res.status(200).json({
            success: true,
            uploadUrl,           // Presigned URL for PUT request
            publicUrl,           // Public access URL
            uploadId: requestId, // Unique upload ID
            provider: 'r2',
            expiresIn,          // URL expiry in seconds
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
                    cryptoSigning: `${signingTime}ms`  // ⚡ Pure crypto - NO API calls, NO Redis!
                }
            }
        });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`[${requestId}] 💥 Error after ${totalTime}ms:`, error);

        if (apiKeyId) {
            updateR2Metrics(apiKeyId, req.userId, 'r2', 'failed', 0).catch(() => { });
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
