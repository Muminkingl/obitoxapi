/**
 * Generate HMAC-SHA256 signature for request
 * 
 * Layer 2 Security: Request Signatures
 * This makes stolen API keys useless without the secret.
 * 
 * @param method - HTTP method (GET, POST, etc.)
 * @param path - Request path
 * @param timestamp - Unix timestamp in milliseconds
 * @param body - Request body (will be stringified)
 * @returns HMAC-SHA256 signature (hex)
 */
function generateSignature(
    method: string,
    path: string,
    timestamp: number,
    body: any,
    secret: string
): string {
    // Polyfill for crypto in browser/node
    const crypto = typeof window !== 'undefined' && window.crypto
        ? window.crypto
        : require('crypto');

    // Normalize body
    const bodyString = typeof body === 'string'
        ? body
        : body
            ? JSON.stringify(body)
            : '';

    // Create message: METHOD|PATH|TIMESTAMP|BODY
    const message = `${method.toUpperCase()}|${path}|${timestamp}|${bodyString}`;

    // Generate HMAC-SHA256
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
        // Browser environment - use Web Crypto API (async)
        throw new Error('Browser signature generation not yet implemented - use Node.js for now');
    } else {
        // Node.js environment
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(message);
        return hmac.digest('hex');
    }
}

export { generateSignature };
