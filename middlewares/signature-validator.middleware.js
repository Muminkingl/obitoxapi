/**
 * Request Signature Validation Middleware
 *
 * Layer 2: Anti-Abuse Protection
 * Purpose: Validate that requests are signed with the secret key
 *
 * This middleware:
 * 1. Extracts X-Signature and X-Timestamp headers
 * 2. Gets secret_hash from req.secretHash (set by apikey.middleware.optimized.js) — zero DB calls
 * 3. Validates provided secret matches stored hash (SHA-256 comparison)
 * 4. Validates HMAC-SHA256 signature
 * 5. Validates timestamp is recent (<5 min) — prevents replay attacks
 *
 * Placement in middleware chain:
 *   1. Behavioral throttle (Layer 4) ← First
 *   2. API key validator             ← Sets req.apiKeyId + req.secretHash
 *   3. Signature validator (THIS)    ← Validates signature
 *   4. Upload handler                ← Handles request
 */

import crypto from 'crypto';  // FIX #1: moved from bottom of file to top
import { verifySignature, isTimestampValid } from '../utils/signature.utils.js';
import { supabaseAdmin } from '../config/supabase.js';
import logger from '../utils/logger.js';

/**
 * Signature Validation Middleware
 *
 * @middleware
 * @requires req.apiKeyId   - Set by apikey.middleware.optimized.js
 * @requires req.secretHash - Set by apikey.middleware.optimized.js (avoids DB call)
 * @requires X-Signature header - HMAC signature from SDK
 * @requires X-Timestamp header - Unix timestamp in milliseconds
 */
export async function signatureValidator(req, res, next) {
    // FIX #2: one Date.now() call, two uses
    const startTime = Date.now();
    const requestId = `sig_${startTime}`;

    try {
        // ── STEP 1: VALIDATE HEADERS ────────────────────────────────────────

        const signature = req.headers['x-signature'];
        const timestamp = req.headers['x-timestamp'];

        if (!signature) {
            logger.debug(`[${requestId}] Missing X-Signature header`);
            return res.status(401).json({
                success: false,
                error: 'MISSING_SIGNATURE',
                message: 'Request signature required',
                hint: 'Include X-Signature header with HMAC-SHA256 signature'
            });
        }

        if (!timestamp) {
            logger.debug(`[${requestId}] Missing X-Timestamp header`);
            return res.status(401).json({
                success: false,
                error: 'MISSING_TIMESTAMP',
                message: 'Request timestamp required',
                hint: 'Include X-Timestamp header with Unix timestamp (milliseconds)'
            });
        }

        // ── STEP 2: VALIDATE TIMESTAMP (prevents replay attacks) ────────────

        const timestampNum = parseInt(timestamp);

        if (isNaN(timestampNum)) {
            logger.debug(`[${requestId}] Invalid timestamp format: ${timestamp}`);
            return res.status(401).json({
                success: false,
                error: 'INVALID_TIMESTAMP',
                message: 'Timestamp must be a valid Unix timestamp in milliseconds'
            });
        }

        if (!isTimestampValid(timestampNum)) {
            // FIX #3: compute ageSeconds once, use twice
            const ageSeconds = Math.floor((Date.now() - timestampNum) / 1000);
            logger.debug(`[${requestId}] Timestamp too old: ${ageSeconds}s`);
            return res.status(401).json({
                success: false,
                error: 'EXPIRED_TIMESTAMP',
                message: 'Request timestamp expired',
                hint: 'Timestamp must be within 5 minutes. Check your system clock.',
                age: `${ageSeconds} seconds old`
            });
        }

        // ── STEP 3: GET SECRET HASH ──────────────────────────────────────────

        const apiKeyId = req.apiKeyId;

        if (!apiKeyId) {
            logger.debug(`[${requestId}] No apiKeyId found (middleware order issue?)`);
            return res.status(500).json({
                success: false,
                error: 'INTERNAL_ERROR',
                message: 'API key validation failed. Please contact support.'
            });
        }

        // 🚀 req.secretHash is set by apikey.middleware.optimized.js — zero DB calls on this path
        let secret_hash = req.secretHash;

        // Fallback to DB only if not cached (edge case: very first request before cache warm-up)
        if (!secret_hash) {
            logger.debug(`[${requestId}] secret_hash not cached, falling back to DB`);
            const { data: keyData, error: dbError } = await supabaseAdmin
                .from('api_keys')
                .select('secret_hash')
                .eq('id', apiKeyId)
                .single();

            if (dbError || !keyData) {
                logger.error(`[${requestId}] Failed to fetch secret_hash:`, dbError?.message);
                return res.status(500).json({
                    success: false,
                    error: 'DATABASE_ERROR',
                    message: 'Failed to validate request signature'
                });
            }

            secret_hash = keyData.secret_hash;
        }

        if (!secret_hash) {
            // FIX #4: three debug calls collapsed into one
            logger.debug(`[${requestId}] Legacy key (no secret_hash) — bypassing in ${Date.now() - startTime}ms`);
            return next();
        }

        // ── STEP 4: VERIFY SIGNATURE ─────────────────────────────────────────

        // The SDK sends the raw sk_... secret in X-API-Secret.
        // We SHA-256 it and compare against the stored hash, then use it for HMAC.
        const providedSecret = req.headers['x-api-secret'];

        if (!providedSecret) {
            logger.debug(`[${requestId}] Missing X-API-Secret header`);
            return res.status(401).json({
                success: false,
                error: 'MISSING_SECRET',
                message: 'API secret required for signature validation',
                hint: 'Include X-API-Secret header with your sk_... secret key'
            });
        }

        // Compare provided secret against stored hash
        const providedSecretHash = crypto
            .createHash('sha256')
            .update(providedSecret)
            .digest('hex');

        if (providedSecretHash !== secret_hash) {
            logger.warn(`[${requestId}] Secret hash mismatch`);
            return res.status(401).json({
                success: false,
                error: 'INVALID_SECRET',
                message: 'Invalid API secret',
                hint: 'The provided secret does not match the stored secret for this key'
            });
        }

        // FIX #5: const directly in the try — no redundant let outside
        try {
            const isValidSignature = verifySignature(req, signature, providedSecret);

            if (!isValidSignature) {
                logger.warn(`[${requestId}] Invalid signature`);
                return res.status(401).json({
                    success: false,
                    error: 'INVALID_SIGNATURE',
                    message: 'Request signature is invalid',
                    hint: 'Signature must be HMAC-SHA256(method|path|timestamp|body, secret)'
                });
            }
        } catch (sigError) {
            logger.error(`[${requestId}] Signature verification error:`, sigError.message);
            return res.status(401).json({
                success: false,
                error: 'SIGNATURE_ERROR',
                message: 'Failed to verify signature',
                hint: 'Check signature format (must be hex-encoded HMAC-SHA256)'
            });
        }

        // ── SUCCESS ──────────────────────────────────────────────────────────

        logger.debug(`[${requestId}] Signature validated in ${Date.now() - startTime}ms`);
        next();

    } catch (error) {
        logger.error(`[${requestId}] Unexpected error after ${Date.now() - startTime}ms:`, error.message);
        return res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred during signature validation'
        });
    }
}
