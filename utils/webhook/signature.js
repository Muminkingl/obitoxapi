/**
 * Webhook Utility Functions
 * 
 * - HMAC signature generation/verification
 * - Webhook ID generation
 * - Payload building
 */

import crypto from 'crypto';

/**
 * Generate HMAC-SHA256 signature for webhook payload
 * 
 * @param {Object} payload - The payload to sign
 * @param {string} secret - The webhook secret
 * @returns {string} SHA256 signature in format "sha256=..."
 */
export function generateWebhookSignature(payload, secret) {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return `sha256=${hmac.digest('hex')}`;
}

/**
 * Verify webhook signature (timing-safe comparison)
 * 
 * @param {Object} payload - The original payload
 * @param {string} signature - The signature to verify (format: "sha256=...")
 * @param {string} secret - The webhook secret
 * @returns {boolean} True if signature is valid
 */
export function verifyWebhookSignature(payload, signature, secret) {
    try {
        const expectedSignature = generateWebhookSignature(payload, secret);

        // Use timing-safe comparison to prevent timing attacks
        const signatureBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expectedSignature);

        if (signatureBuffer.length !== expectedBuffer.length) {
            return false;
        }

        return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
    } catch (error) {
        console.error('[Webhook Signature] Verification error:', error.message);
        return false;
    }
}

/**
 * Generate a unique webhook ID (UUID format)
 * 
 * @returns {string} Webhook ID as UUID
 */
export function generateWebhookId() {
    return crypto.randomUUID();
}

/**
 * Generate a webhook secret
 * 
 * @returns {string} 32-byte hex string
 */
export function generateWebhookSecret() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Construct public URL from provider and bucket/key
 * 
 * @param {string} provider - Provider name (R2, S3, SUPABASE, UPLOADCARE)
 * @param {string} bucket - Bucket/container name
 * @param {string} key - File key/path
 * @returns {string} Public URL
 */
export function constructPublicUrl(provider, bucket, key) {
    const encodedKey = encodeURIComponent(key);

    switch (provider.toUpperCase()) {
        case 'R2':
            return `https://pub-${bucket}.r2.dev/${encodedKey}`;
        case 'S3':
            return `https://${bucket}.s3.amazonaws.com/${encodedKey}`;
        case 'SUPABASE':
            return `https://${bucket}.supabase.co/storage/v1/object/public/${key}`;
        case 'UPLOADCARE':
            return `https://ucarecdn.com/${key}`;
        default:
            return `https://${bucket}/${encodedKey}`;
    }
}

/**
 * Build webhook payload
 * 
 * @param {Object} webhook - Webhook record from database
 * @param {Object} fileMetadata - File metadata from storage provider
 * @returns {Object} Formatted webhook payload
 */
export function buildWebhookPayload(webhook, fileMetadata = {}) {
    return {
        event: 'upload.completed',
        webhookId: webhook.id,
        timestamp: new Date().toISOString(),
        file: {
            url: constructPublicUrl(webhook.provider, webhook.bucket, webhook.file_key),
            filename: webhook.filename,
            key: webhook.file_key,
            size: fileMetadata.contentLength || webhook.file_size,
            contentType: fileMetadata.contentType || webhook.content_type,
            etag: fileMetadata.etag || webhook.etag,
            lastModified: fileMetadata.lastModified || new Date().toISOString()
        },
        provider: webhook.provider,
        bucket: webhook.bucket,
        metadata: webhook.metadata || {}
    };
}

/**
 * Build webhook headers
 * 
 * @param {Object} webhook - Webhook record
 * @param {Object} payload - The webhook payload
 * @returns {Object} Headers object
 */
export function buildWebhookHeaders(webhook, payload) {
    const signature = generateWebhookSignature(payload, webhook.webhook_secret);

    return {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-ID': webhook.id,
        'X-Webhook-Event': 'upload.completed',
        'User-Agent': 'ObitoX-Webhooks/1.0',
        'X-Request-Time': new Date().toISOString()
    };
}

/**
 * Parse webhook ID from token
 * 
 * @param {string} token - Webhook token
 * @returns {string|null} Webhook ID or null if invalid
 */
export function parseWebhookToken(token) {
    if (!token || typeof token !== 'string') {
        return null;
    }

    if (token.startsWith('wh_')) {
        return token;
    }

    return null;
}

/**
 * Validate webhook URL
 * 
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid HTTP/HTTPS URL
 */
export function isValidWebhookUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}
