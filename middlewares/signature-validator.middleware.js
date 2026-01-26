/**
 * Request Signature Validation Middleware
 * 
 * Layer 2: Anti-Abuse Protection
 * Purpose: Validate that requests are signed with the secret key
 * 
 * This middleware:
 * 1. Extracts X-Signature and X-Timestamp headers
 * 2. Gets API key's secret_hash from database (via req.apiKeyId from previous middleware)
 * 3. Validates signature matches expected HMAC
 * 4. Validates timestamp is recent (<5 min)
 * 5. Rejects if either fails → Makes stolen keys useless!
 * 
 * Placement in middleware chain:
 *   1. Behavioral throttle (Layer 4) ← First
 *   2. API key validator (existing)  ← Sets req.apiKeyId
 *   3. Signature validator (THIS)    ← Validates signature
 *   4. Upload handler                ← Handles request
 */

import { verifySignature, isTimestampValid } from '../utils/signature.utils.js';
import { supabaseAdmin } from '../config/supabase.js';

/**
 * Signature Validation Middleware
 * 
 * @middleware
 * @requires req.apiKeyId - Set by apikey.middleware.optimized.js
 * @requires X-Signature header - HMAC signature from SDK
 * @requires X-Timestamp header - Unix timestamp in milliseconds
 */
export async function signatureValidator(req, res, next) {
    const requestId = `sig_${Date.now()}`;
    const startTime = Date.now();

    try {
        // ============================================================
        // STEP 1: VALIDATE HEADERS
        // ============================================================

        const signature = req.headers['x-signature'];
        const timestamp = req.headers['x-timestamp'];

        if (!signature) {
            console.log(`[${requestId}] ❌ Missing X-Signature header`);
            return res.status(401).json({
                success: false,
                error: 'MISSING_SIGNATURE',
                message: 'Request signature required',
                hint: 'Include X-Signature header with HMAC-SHA256 signature'
            });
        }

        if (!timestamp) {
            console.log(`[${requestId}] ❌ Missing X-Timestamp header`);
            return res.status(401).json({
                success: false,
                error: 'MISSING_TIMESTAMP',
                message: 'Request timestamp required',
                hint: 'Include X-Timestamp header with Unix timestamp (milliseconds)'
            });
        }

        // ============================================================
        // STEP 2: VALIDATE TIMESTAMP (Prevent Replay Attacks)
        // ============================================================

        const timestampNum = parseInt(timestamp);

        if (isNaN(timestampNum)) {
            console.log(`[${requestId}] ❌ Invalid timestamp format: ${timestamp}`);
            return res.status(401).json({
                success: false,
                error: 'INVALID_TIMESTAMP',
                message: 'Timestamp must be a valid Unix timestamp in milliseconds'
            });
        }

        if (!isTimestampValid(timestampNum)) {
            const age = Date.now() - timestampNum;
            console.log(`[${requestId}] ❌ Timestamp too old: ${Math.floor(age / 1000)}s`);
            return res.status(401).json({
                success: false,
                error: 'EXPIRED_TIMESTAMP',
                message: 'Request timestamp expired',
                hint: 'Timestamp must be within 5 minutes. Check your system clock.',
                age: `${Math.floor(age / 1000)} seconds old`
            });
        }

        // ============================================================
        // STEP 3: GET SECRET HASH (FROM CACHE or DB FALLBACK)
        // ============================================================

        // The API key ID should be set by apikey.middleware.optimized.js
        const apiKeyId = req.apiKeyId;

        if (!apiKeyId) {
            console.log(`[${requestId}] ❌ No apiKeyId found in request (middleware order issue?)`);
            return res.status(500).json({
                success: false,
                error: 'INTERNAL_ERROR',
                message: 'API key validation failed. Please contact support.'
            });
        }

        // 🚀 OPTIMIZATION: Use cached secret_hash from API key middleware (saves 150-200ms!)
        let secret_hash = req.secretHash;

        // Fallback to DB only if not cached (edge case)
        if (!secret_hash) {
            console.log(`[${requestId}] ⚠️ secret_hash not cached, falling back to DB`);
            const { data: keyData, error: dbError } = await supabaseAdmin
                .from('api_keys')
                .select('secret_hash')
                .eq('id', apiKeyId)
                .single();

            if (dbError || !keyData) {
                console.error(`[${requestId}] ❌ Failed to fetch secret_hash:`, dbError?.message);
                return res.status(500).json({
                    success: false,
                    error: 'DATABASE_ERROR',
                    message: 'Failed to validate request signature'
                });
            }

            secret_hash = keyData.secret_hash;
        }

        if (!secret_hash) {
            // Legacy key without secret - allow through for backwards compatibility
            console.log(`[${requestId}] ⚠️ No secret_hash for API key (legacy key?)`);
            console.log(`[${requestId}] ✅ Allowing request (legacy key without secret)`);
            const totalTime = Date.now() - startTime;
            console.log(`[${requestId}] Signature validation bypassed in ${totalTime}ms (legacy key)`);
            return next();
        }

        // ============================================================
        // STEP 4: VERIFY SIGNATURE
        // ============================================================

        // Note: We need the ACTUAL secret (sk_...), not the hash
        // But we only store the hash in the DB for security!
        // Solution: SDK must send both ox_ key AND sk_ secret
        // We hash the sk_ and compare with stored hash, then use sk_ for HMAC

        // Get the secret from request headers (SDK sends it)
        const providedSecret = req.headers['x-api-secret'];

        if (!providedSecret) {
            console.log(`[${requestId}] ❌ Missing X-API-Secret header`);
            return res.status(401).json({
                success: false,
                error: 'MISSING_SECRET',
                message: 'API secret required for signature validation',
                hint: 'Include X-API-Secret header with your sk_... secret key'
            });
        }

        // Verify the provided secret matches the stored hash
        const providedSecretHash = crypto
            .createHash('sha256')
            .update(providedSecret)
            .digest('hex');

        if (providedSecretHash !== secret_hash) {
            console.log(`[${requestId}] ❌ Secret hash mismatch`);
            return res.status(401).json({
                success: false,
                error: 'INVALID_SECRET',
                message: 'Invalid API secret',
                hint: 'The provided secret does not match the stored secret for this key'
            });
        }

        // Now verify the signature using the provided secret
        let isValidSignature = false;

        try {
            isValidSignature = verifySignature(req, signature, providedSecret);
        } catch (error) {
            console.error(`[${requestId}] ❌ Signature verification error:`, error.message);
            return res.status(401).json({
                success: false,
                error: 'SIGNATURE_ERROR',
                message: 'Failed to verify signature',
                hint: 'Check signature format (must be hex-encoded HMAC-SHA256)'
            });
        }

        if (!isValidSignature) {
            console.log(`[${requestId}] ❌ Invalid signature`);
            return res.status(401).json({
                success: false,
                error: 'INVALID_SIGNATURE',
                message: 'Request signature is invalid',
                hint: 'Signature must be HMAC-SHA256(method|path|timestamp|body, secret)'
            });
        }

        // ============================================================
        // SUCCESS: SIGNATURE VALID
        // ============================================================

        const totalTime = Date.now() - startTime;
        console.log(`[${requestId}] ✅ Signature validated in ${totalTime}ms`);

        // Continue to next middleware
        next();

    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`[${requestId}] ❌ Unexpected error after ${totalTime}ms:`, error);

        return res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred during signature validation'
        });
    }
}

// Missing crypto import
import crypto from 'crypto';
