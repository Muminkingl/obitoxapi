/**
 * Request Signature Utilities
 * 
 * Layer 2: Request Signature Validation
 * Purpose: Make stolen API keys (ox_...) useless without the secret (sk_...)
 * 
 * How It Works:
 * 1. SDK signs request: HMAC-SHA256(method + path + timestamp + body, sk_secret)
 * 2. Server validates signature matches
 * 3. Server checks timestamp is recent (<5 min)
 * 4. Rejects if either check fails
 * 
 * Benefits:
 * - Stolen ox_ keys are USELESS without sk_ secret
 * - Prevents replay attacks (timestamp validation)
 * - Zero UX impact (SDK handles automatically)
 */

import crypto from 'crypto';

/**
 * Generate HMAC-SHA256 signature for a request
 * 
 * This is what the SDK does on the client side.
 * Server uses the same function to verify.
 * 
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string} path - Request path (/api/v1/upload/vercel/signed-url)
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @param {Object|string} body - Request body (will be stringified if object)
 * @param {string} secret - API secret key (sk_...)
 * @returns {string} HMAC-SHA256 signature (hex)
 * 
 * @example
 * const signature = generateSignature(
 *   'POST',
 *   '/api/v1/upload/vercel/signed-url',
 *   Date.now(),
 *   { filename: 'test.txt' },
 *   'sk_abc123...'
 * );
 */
export function generateSignature(method, path, timestamp, body, secret) {
    // Normalize the body
    const bodyString = typeof body === 'string'
        ? body
        : body
            ? JSON.stringify(body)
            : '';

    // Create the message to sign
    // Format: METHOD|PATH|TIMESTAMP|BODY
    const message = `${method.toUpperCase()}|${path}|${timestamp}|${bodyString}`;

    // Generate HMAC-SHA256 signature
    const signature = crypto
        .createHmac('sha256', secret)
        .update(message)
        .digest('hex');

    return signature;
}

/**
 * Verify a request signature
 * 
 * Server-side validation. Compares provided signature with expected signature.
 * Uses constant-time comparison to prevent timing attacks.
 * 
 * @param {Object} req - Express request object
 * @param {string} providedSignature - Signature from X-Signature header
 * @param {string} secret - API secret key from database
 * @returns {boolean} True if signature is valid
 * 
 * @example
 * const isValid = verifySignature(req, req.headers['x-signature'], 'sk_abc123...');
 */
export function verifySignature(req, providedSignature, secret) {
    const method = req.method;
    const path = req.originalUrl || req.url;
    const timestamp = parseInt(req.headers['x-timestamp']);
    const body = req.body;

    // Generate expected signature
    const expectedSignature = generateSignature(method, path, timestamp, body, secret);

    // Constant-time comparison (prevents timing attacks)
    return crypto.timingSafeEqual(
        Buffer.from(providedSignature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
    );
}

/**
 * Check if timestamp is valid (within acceptable window)
 * 
 * Prevents replay attacks by rejecting old requests.
 * Default window: 5 minutes (300 seconds)
 * 
 * @param {number} timestamp - Timestamp from X-Timestamp header (milliseconds)
 * @param {number} maxAgeMs - Maximum age in milliseconds (default: 5 min)
 * @returns {boolean} True if timestamp is valid
 * 
 * @example
 * const isValid = isTimestampValid(req.headers['x-timestamp']);
 * // Returns false if timestamp is >5 minutes old
 */
export function isTimestampValid(timestamp, maxAgeMs = 5 * 60 * 1000) {
    const now = Date.now();
    const age = now - timestamp;

    // Check if timestamp is:
    // 1. Not in the future (allow 30s clock skew)
    // 2. Not too old (default: 5 minutes)
    return age >= -30000 && age <= maxAgeMs;
}

/**
 * Extract secret from database hash
 * 
 * Helper for getting secret_hash from database and validating against provided secret.
 * Note: In production, we store HASH of secret, not plaintext.
 * 
 * @param {string} providedSecret - Secret from SDK (sk_...)
 * @param {string} storedHash - SHA-256 hash from database
 * @returns {boolean} True if secret matches hash
 * 
 * @example
 * const matches = validateSecretHash('sk_abc123...', storedHashFromDB);
 */
export function validateSecretHash(providedSecret, storedHash) {
    const providedHash = crypto
        .createHash('sha256')
        .update(providedSecret)
        .digest('hex');

    return providedHash === storedHash;
}
