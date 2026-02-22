/**
 * Webhook File Verifier Service
 * 
 * - Verify file exists in S3/R2 via HEAD request
 * - Poll for file until it exists (with timeout)
 * - Extract metadata from storage provider
 * 
 * ✅ FIXES Applied:
 * - Increased timeout from 30s to 120s (AWS eventual consistency)
 * - ETag mismatch now throws error to trigger retry logic
 */

import { getR2Client } from '../../controllers/providers/r2/r2.config.js';
import { getS3Client } from '../../controllers/providers/s3/s3.config.js';
import { HeadObjectCommand } from '@aws-sdk/client-s3';

// ✅ SECURITY: Decrypt credentials stored encrypted in DB
import { decryptCredential } from '../../utils/credential-encryption.js';
import logger from '../../utils/logger.js';

/**
 * Get appropriate S3 client based on provider
 * 
 * @param {Object} webhook - Webhook record
 * @returns {Object} { client, provider }
 */
function getStorageClient(webhook) {
    // Decrypt credentials that were encrypted at rest
    const accessKey = decryptCredential(webhook.access_key_id);
    const secretKey = decryptCredential(webhook.secret_access_key);

    switch (webhook.provider.toUpperCase()) {
        case 'R2':
            // ✅ FIX: getR2Client expects positional args: (accountId, accessKey, secretKey)
            return {
                client: getR2Client(
                    webhook.account_id,
                    accessKey,
                    secretKey
                ),
                provider: 'R2'
            };
        case 'S3':
            // ✅ FIX: getS3Client expects positional args: (region, accessKey, secretKey, endpoint)
            return {
                client: getS3Client(
                    webhook.region || 'us-east-1',
                    accessKey,
                    secretKey,
                    webhook.endpoint  // Pass endpoint for MinIO/custom S3-compatible storage
                ),
                provider: 'S3'
            };
        case 'SUPABASE':
        case 'UPLOADCARE':
            // These providers don't use S3-compatible clients
            // Verification is handled separately in verifyFile
            return { client: null, provider: webhook.provider.toUpperCase() };
        default:
            throw new Error(`Unsupported provider: ${webhook.provider}`);
    }
}

/**
 * Verify file exists in storage and get its metadata
 * 
 * @param {Object} webhook - Webhook record with storage credentials
 * @returns {Promise<Object>} { exists: boolean, metadata: Object|null }
 */
export async function verifyFile(webhook) {
    try {
        // ✅ FIX: Check if credentials are available before attempting verification
        // Webhooks may not have storage credentials if they were created without them
        const provider = webhook.provider?.toUpperCase();

        if (provider === 'R2') {
            if (!webhook.account_id || !webhook.access_key_id || !webhook.secret_access_key) {
                logger.info(`[Webhook Verifier] ⚠️ Skipping verification - no R2 credentials stored for ${webhook.id}`);
                // Assume file exists since we can't verify without credentials
                // This is safe for manual trigger mode where client confirms upload
                return {
                    exists: true,
                    metadata: {
                        contentLength: webhook.file_size || 0,
                        contentType: webhook.content_type,
                        skippedVerification: true,
                        reason: 'no_credentials_stored'
                    }
                };
            }
        } else if (provider === 'S3') {
            if (!webhook.access_key_id || !webhook.secret_access_key) {
                logger.info(`[Webhook Verifier] ⚠️ Skipping verification - no S3 credentials stored for ${webhook.id}`);
                return {
                    exists: true,
                    metadata: {
                        contentLength: webhook.file_size || 0,
                        contentType: webhook.content_type,
                        skippedVerification: true,
                        reason: 'no_credentials_stored'
                    }
                };
            }
        } else if (provider === 'SUPABASE') {
            // ✅ Supabase uses its own Storage API - skip S3-style verification
            // For Supabase, we trust that the file was uploaded since we got a success response
            logger.info(`[Webhook Verifier] ✅ Skipping verification for Supabase - file assumed uploaded for ${webhook.id}`);
            return {
                exists: true,
                metadata: {
                    contentLength: webhook.file_size || 0,
                    contentType: webhook.content_type,
                    skippedVerification: true,
                    reason: 'supabase_no_s3_verification'
                }
            };
        } else if (provider === 'UPLOADCARE') {
            // ✅ Uploadcare uses its own CDN API - skip S3-style verification
            // For Uploadcare, we trust that the file was uploaded since we got a success response
            logger.info(`[Webhook Verifier] ✅ Skipping verification for Uploadcare - file assumed uploaded for ${webhook.id}`);
            return {
                exists: true,
                metadata: {
                    contentLength: webhook.file_size || 0,
                    contentType: webhook.content_type,
                    skippedVerification: true,
                    reason: 'uploadcare_no_s3_verification'
                }
            };
        }

        const { client } = getStorageClient(webhook);

        const command = new HeadObjectCommand({
            Bucket: webhook.bucket,
            Key: webhook.file_key
        });

        const response = await client.send(command);

        // ✅ FIX: Verify ETag matches - throw error on mismatch to trigger retry
        if (webhook.etag) {
            const storedEtag = response.ETag?.replace(/"/g, '');
            const expectedEtag = webhook.etag.replace(/"/g, '');

            if (storedEtag && expectedEtag && storedEtag !== expectedEtag) {
                const error = new Error(`ETag mismatch: expected ${expectedEtag}, got ${storedEtag}`);
                logger.error(`webhook verifier error:`, { error: `ETag mismatch for ${webhook.id}` });
                throw error;
            }
        }

        const metadata = {
            contentLength: response.ContentLength,
            contentType: response.ContentType,
            etag: response.ETag?.replace(/"/g, ''),
            lastModified: response.LastModified?.toISOString(),
            metadata: response.Metadata || {}
        };

        logger.info(`[Webhook Verifier] ✅ File verified: ${webhook.file_key}`);
        return { exists: true, metadata };

    } catch (error) {
        if (error.name === 'NotFound' || error.name === 'NoSuchKey' || error.name === '404') {
            return { exists: false, metadata: null };
        }

        logger.error(`webhook verifier error:`, { error });
        throw error;
    }
}

/**
 * Poll for file until it exists (with timeout)
 * 
 * @param {Object} webhook - Webhook record
 * @param {number} maxAttempts - Maximum polling attempts
 * @param {number} intervalMs - Interval between attempts (milliseconds)
 * @returns {Promise<Object>} Verification result
 */
export async function pollForFile(webhook, maxAttempts = 10, intervalMs = 1000) {
    logger.info(`[Webhook Verifier] 🔍 Polling for file: ${webhook.file_key}`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const result = await verifyFile(webhook);

            if (result.exists) {
                if (attempt > 1) {
                    logger.info(`[Webhook Verifier] ✅ File found after ${attempt} attempts`);
                }
                return result;
            }
        } catch (error) {
            logger.info(`[Webhook Verifier] ⚠️ Attempt ${attempt} failed: ${error.message}`);
        }

        // Wait before next attempt
        if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
    }

    logger.info(`[Webhook Verifier] ⚠️ File not found after ${maxAttempts} attempts`);
    return { exists: false, metadata: null };
}

/**
 * Wait for file with exponential backoff
 * 
 * ✅ FIX: Increased timeout from 30s to 120s (2 minutes)
 * This handles AWS S3 eventual consistency which can take 2+ minutes
 * for cross-region replication, especially for large files.
 * 
 * @param {Object} webhook - Webhook record
 * @param {number} maxWaitMs - Maximum total wait time (milliseconds)
 * @returns {Promise<Object>} Verification result
 */
export async function waitForFile(webhook, maxWaitMs = 120000) { // ✅ FIX: 2 minutes instead of 30 seconds
    logger.info(`[Webhook Verifier] ⏳ Waiting for file (max ${maxWaitMs}ms = ${maxWaitMs / 1000}s): ${webhook.file_key}`);

    const startTime = Date.now();
    let attempt = 0;
    let intervalMs = 500;

    while (Date.now() - startTime < maxWaitMs) {
        attempt++;

        try {
            const result = await verifyFile(webhook);

            if (result.exists) {
                logger.info(`[Webhook Verifier] ✅ File available after ${Date.now() - startTime}ms (attempt ${attempt})`);
                return result;
            }
        } catch (error) {
            logger.info(`[Webhook Verifier] ⚠️ Attempt ${attempt} failed: ${error.message}`);
        }

        // Exponential backoff with cap at 5 seconds
        intervalMs = Math.min(intervalMs * 1.5, 5000);
        const remainingWait = maxWaitMs - (Date.now() - startTime);
        const actualWait = Math.min(intervalMs, remainingWait);

        if (actualWait > 0) {
            await new Promise(resolve => setTimeout(resolve, actualWait));
        }
    }

    logger.info(`[Webhook Verifier] ⏰ Timeout after ${maxWaitMs}ms (${attempt} attempts)`);
    return { exists: false, metadata: null, timedOut: true };
}

/**
 * Check if file is ready (exists and not being written)
 * 
 * @param {Object} webhook - Webhook record
 * @returns {Promise<Object>} { ready: boolean, metadata: Object|null }
 */
export async function checkFileReady(webhook) {
    try {
        const result = await verifyFile(webhook);

        if (!result.exists) {
            return { ready: false, reason: 'not_found' };
        }

        // For large files, check if size matches expected
        if (webhook.file_size && result.metadata.contentLength !== webhook.file_size) {
            return {
                ready: false,
                reason: 'size_mismatch',
                expected: webhook.file_size,
                actual: result.metadata.contentLength
            };
        }

        return { ready: true, metadata: result.metadata };

    } catch (error) {
        return { ready: false, reason: error.message };
    }
}

/**
 * Get file metadata without verifying existence
 * 
 * @param {Object} webhook - Webhook record
 * @returns {Promise<Object|null>} File metadata or null
 */
export async function getFileMetadata(webhook) {
    try {
        const result = await verifyFile(webhook);
        return result.metadata;
    } catch {
        return null;
    }
}

/**
 * Verify multiple files at once
 * 
 * @param {Array<Object>} webhooks - Array of webhook records
 * @returns {Promise<Array>} Array of verification results
 */
export async function verifyMultipleFiles(webhooks) {
    const results = await Promise.all(
        webhooks.map(async (webhook) => {
            try {
                return await verifyFile(webhook);
            } catch (error) {
                return { exists: false, metadata: null, error: error.message };
            }
        })
    );

    return results;
}
