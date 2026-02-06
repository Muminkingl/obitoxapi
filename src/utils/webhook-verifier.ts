/**
 * ObitoX SDK - Webhook Signature Verification Helper
 * 
 * Customers use this to verify that webhooks actually came from ObitoX
 * and not from a malicious third party.
 * 
 * @module webhook-verifier
 * 
 * @example
 * ```typescript
 * import { verifyWebhookSignature } from '@obitox/sdk';
 * 
 * // Verify webhook payload
 * const isValid = verifyWebhookSignature({
 *   payload: rawBody,        // The raw request body as string
 *   signature: signature,     // The X-Webhook-Signature header
 *   secret: webhookSecret    // Your webhook secret from dashboard
 * });
 * 
 * if (!isValid) {
 *   throw new Error('Invalid webhook signature');
 * }
 * ```
 */

// Webhook event types from ObitoX
export type WebhookEventType = 
  | 'file.uploaded'
  | 'file.deleted'
  | 'file.downloaded'
  | 'upload.completed'
  | 'upload.failed';

// Webhook payload structure from ObitoX
export interface WebhookPayload {
  id: string;
  event: WebhookEventType;
  timestamp: string;
  apiKeyId: string;
  provider: string;
  data: {
    filename: string;
    fileUrl: string;
    fileSize?: number;
    contentType?: string;
    metadata?: Record<string, unknown>;
  };
  retryCount?: number;
}

/**
 * Verify a webhook signature from ObitoX
 * 
 * Uses HMAC-SHA256 with timing-safe comparison to prevent timing attacks.
 * 
 * @param options - Verification options
 * @param options.payload - The raw request body (string) that was signed
 * @param options.signature - The signature from the X-Webhook-Signature header
 * @param options.secret - Your webhook secret from the ObitoX dashboard
 * @returns true if signature is valid, false otherwise
 * 
 * @security CRITICAL: Always verify webhook signatures in production!
 * @security Pass the RAW request body as a string, not parsed JSON
 */
export async function verifyWebhookSignature(options: {
  payload: string;
  signature: string;
  secret: string;
}): Promise<boolean> {
  const { payload, signature, secret } = options;

  if (!payload || !signature || !secret) {
    console.error('[Webhook Verifier] Missing required parameters');
    return false;
  }

  try {
    // Dynamic import for Node.js crypto (ESM compatible)
    const { createHmac, timingSafeEqual } = await import('crypto');

    // Compute expected signature
    const expectedSignature = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Timing-safe comparison to prevent timing attacks
    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    // Check buffer lengths match
    if (signatureBuffer.length !== expectedBuffer.length) {
      console.error('[Webhook Verifier] Signature length mismatch');
      return false;
    }

    // Use timing-safe comparison
    return timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch (error) {
    console.error('[Webhook Verifier] Verification error:', error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Parse and verify webhook payload
 * 
 * @param body - The raw request body
 * @param signature - The X-Webhook-Signature header
 * @param secret - Your webhook secret
 * @returns Parsed payload if valid, null otherwise
 */
export async function parseWebhookPayload(
  body: string,
  signature: string,
  secret: string
): Promise<WebhookPayload | null> {
  // First verify the signature
  const isValid = await verifyWebhookSignature({
    payload: body,
    signature,
    secret
  });

  if (!isValid) {
    return null;
  }

  try {
    return JSON.parse(body) as WebhookPayload;
  } catch (error) {
    console.error('[Webhook Verifier] Failed to parse webhook payload:', error);
    return null;
  }
}

/**
 * Create a webhook signature for testing/development
 * 
 * @param payload - The payload to sign
 * @param secret - Your webhook secret
 * @returns The HMAC-SHA256 signature
 */
export async function createWebhookSignature(payload: string, secret: string): Promise<string> {
  const { createHmac } = await import('crypto');
  
  return createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

// CommonJS compatibility helper
export function createWebhookSignatureSync(payload: string, secret: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHmac } = require('crypto');
  
  return createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

// Default export for convenience
export default {
  verifyWebhookSignature,
  parseWebhookPayload,
  createWebhookSignature,
  createWebhookSignatureSync
};
