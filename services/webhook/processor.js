/**
 * Webhook Processor Service
 * 
 * - Deliver webhooks to target URLs
 * - Handle retries with exponential backoff
 * - Manage dead letter queue
 * - Track delivery metrics
 */

import { supabaseAdmin } from '../../config/supabase.js';
import { generateWebhookSignature, buildWebhookPayload, constructPublicUrl } from '../../utils/webhook/signature.js';
import { verifyFile } from './verifier.js';
import { enqueueWebhook, requeueWebhook } from './queue-manager.js';
import logger from '../../utils/logger.js';

// ✅ ADDED: Environment variable configuration
const MAX_ATTEMPTS = parseInt(process.env.WEBHOOK_MAX_ATTEMPTS || '3');
const RETRY_DELAYS = [
    parseInt(process.env.WEBHOOK_RETRY_DELAY_1 || '1000'),
    parseInt(process.env.WEBHOOK_RETRY_DELAY_2 || '5000'),
    parseInt(process.env.WEBHOOK_RETRY_DELAY_3 || '30000')
];
const WEBHOOK_TIMEOUT = parseInt(process.env.WEBHOOK_TIMEOUT || '15000');

// Circuit breaker state (in-memory, per-instance)
const circuitBreaker = new Map(); // domain -> { lastFailure, failureCount }
const CIRCUIT_BREAK_THRESHOLD = parseInt(process.env.WEBHOOK_CIRCUIT_BREAK_THRESHOLD || '5'); // Failures before breaking
const CIRCUIT_BREAK_WINDOW = parseInt(process.env.WEBHOOK_CIRCUIT_BREAK_WINDOW || '60000'); // 1 minute window
const CIRCUIT_BREAK_DURATION = parseInt(process.env.WEBHOOK_CIRCUIT_BREAK_DURATION || '300000'); // 5 minute break

/**
 * Process a single webhook
 * 
 * @param {Object} webhookRecord - Webhook record from database
 * @returns {Promise<Object>} { success: boolean, reason?: string }
 */
export async function processWebhook(webhookRecord) {
    const { id, webhook_url, webhook_secret, provider, bucket, file_key, filename } = webhookRecord;
    const startTime = Date.now();

    logger.debug(`[Webhook Processor] Processing ${id}...`);

    try {
        // 1. Verify file exists (if not already verified)
        if (webhookRecord.status === 'pending' || webhookRecord.status === 'verifying') {
            // For 'auto' trigger mode, poll for file
            if (webhookRecord.trigger_mode === 'auto') {
                const verifyResult = await verifyFile(webhookRecord);
                
                if (!verifyResult.exists) {
                    // Re-queue for later processing
                    await requeueWebhook(id, webhookRecord, 30000); // Retry in 30s
                    await updateWebhookStatus(id, 'pending', {
                        error_message: 'File not yet available, requeued'
                    });
                    return { success: false, reason: 'file_not_found_yet' };
                }

                // Update with actual file metadata
                if (verifyResult.metadata) {
                    await updateWebhookRecord(id, {
                        etag: verifyResult.metadata.etag,
                        file_size: verifyResult.metadata.contentLength
                    });
                }
            }
        }

        // 2. Prepare payload
        const payload = buildWebhookPayload(webhookRecord, {});

        // 3. Generate signature
        const signature = generateWebhookSignature(payload, webhook_secret);

        // 4. Deliver webhook
        const response = await deliverWebhook(webhook_url, payload, signature, id);

        // 5. Update status to completed
        await updateWebhookStatus(id, 'completed', {
            attempt_count: webhookRecord.attempt_count + 1,
            response_status: response.status,
            response_body: response.body.substring(0, 1000),
            completed_at: new Date().toISOString()
        });

        logger.debug(`[Webhook Processor] Completed ${id} in ${Date.now() - startTime}ms`);
        return { success: true };

    } catch (error) {
        logger.error(`[Webhook Processor] Failed ${id}:`, { message: error.message });
        
        const attemptCount = webhookRecord.attempt_count + 1;
        
        if (attemptCount >= MAX_ATTEMPTS) {
            // Move to dead letter queue
            await moveToDeadLetter(webhookRecord, error.message);
            await updateWebhookStatus(id, 'dead_letter', {
                attempt_count: attemptCount,
                error_message: error.message,
                failed_at: new Date().toISOString()
            });
            return { success: false, reason: 'max_retries' };
        } else {
            // Retry with exponential backoff
            const delay = RETRY_DELAYS[attemptCount - 1] + Math.random() * 1000; // Add jitter
            await requeueWebhook(id, webhookRecord, delay);
            await updateWebhookStatus(id, 'pending', {
                attempt_count: attemptCount,
                next_retry_at: new Date(Date.now() + delay).toISOString(),
                error_message: error.message
            });
            return { success: false, reason: 'retry_scheduled' };
        }
    }
}

/**
 * Check if a domain is circuit broken
 * 
 * ✅ ADDED: Circuit breaker pattern to prevent hammering failing domains
 * 
 * @param {string} url - Webhook URL
 * @returns {boolean} true if circuit is open (blocked)
 */
function isCircuitBroken(url) {
    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname;
        const state = circuitBreaker.get(domain);

        if (!state) return false;

        // Check if we're past the break window
        if (Date.now() > state.breakUntil) {
            // Reset failure count but keep monitoring
            circuitBreaker.delete(domain);
            return false;
        }

        return true;
    } catch {
        return false;
    }
}

/**
 * Record a failure for circuit breaker
 * 
 * @param {string} url - Webhook URL
 */
function recordFailure(url) {
    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname;
        const state = circuitBreaker.get(domain) || { failureCount: 0, breakUntil: 0 };

        state.failureCount += 1;

        // Open circuit if threshold exceeded
        if (state.failureCount >= CIRCUIT_BREAK_THRESHOLD) {
            state.breakUntil = Date.now() + CIRCUIT_BREAK_DURATION;
            logger.warn(`[Webhook Processor] Circuit opened for ${domain} after ${state.failureCount} failures`);
        }

        circuitBreaker.set(domain, state);
    } catch {
        // Ignore URL parsing errors
    }
}

/**
 * Record a success - reset failure count
 * 
 * @param {string} url - Webhook URL
 */
function recordSuccess(url) {
    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname;
        circuitBreaker.delete(domain); // Reset on success
    } catch {
        // Ignore URL parsing errors
    }
}

/**
 * Deliver webhook to target URL
 * 
 * @param {string} url - Target webhook URL
 * @param {Object} payload - Webhook payload
 * @param {string} signature - HMAC signature
 * @param {string} webhookId - Webhook ID
 * @returns {Promise<Object>} { status: number, body: string }
 */
async function deliverWebhook(url, payload, signature, webhookId) {
    // ✅ ADDED: Circuit breaker check
    if (isCircuitBroken(url)) {
        const urlObj = new URL(url);
        throw new Error(`Circuit breaker open for ${urlObj.hostname}, skipping delivery`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Signature': signature,
                'X-Webhook-ID': webhookId,
                'X-Webhook-Event': 'upload.completed',
                'User-Agent': 'ObitoX-Webhooks/1.0'
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const body = await response.text().catch(() => '');

        if (!response.ok) {
            recordFailure(url);
            throw new Error(`HTTP ${response.status}: ${body.substring(0, 200)}`);
        }

        // Record success for circuit breaker
        recordSuccess(url);

        return { status: response.status, body };

    } catch (error) {
        clearTimeout(timeoutId);
        recordFailure(url);
        
        if (error.name === 'AbortError') {
            throw new Error('Webhook timeout exceeded');
        }
        
        throw error;
    }
}

/**
 * Process batch of webhooks
 * 
 * @param {Array<Object>} webhookRecords - Array of webhook records
 * @returns {Promise<Object>} { successful: number, failed: number, results: Array }
 */
export async function processWebhookBatch(webhookRecords) {
    const results = await Promise.allSettled(
        webhookRecords.map(webhook => processWebhook(webhook))
    );

    let successful = 0;
    let failed = 0;
    const details = [];

    results.forEach((result, index) => {
        const webhook = webhookRecords[index];
        
        if (result.status === 'fulfilled') {
            if (result.value.success) {
                successful++;
            } else {
                failed++;
            }
            details.push({
                id: webhook.id,
                ...result.value
            });
        } else {
            failed++;
            details.push({
                id: webhook.id,
                success: false,
                reason: 'error',
                error: result.reason?.message || 'Unknown error'
            });
        }
    });

    logger.debug(`[Webhook Processor] Batch: ${successful} success, ${failed} failed`);
    
    return { successful, failed, details };
}

/**
 * Move webhook to dead letter queue
 * 
 * @param {Object} webhook - Webhook record
 * @param {string} failureReason - Reason for failure
 */
async function moveToDeadLetter(webhook, failureReason) {
    try {
        await supabaseAdmin.from('webhook_dead_letter').insert({
            webhook_id: webhook.id,
            original_payload: webhook,
            failure_reason: failureReason,
            attempt_count: webhook.attempt_count,
            last_attempt_at: new Date().toISOString()
        });

        logger.debug(`[Webhook Processor] Moved ${webhook.id} to dead letter`);
    } catch (error) {
        logger.error('[Webhook Processor] Dead letter insert failed:', { message: error.message });
    }
}

/**
 * Update webhook status in database
 * 
 * @param {string} id - Webhook ID
 * @param {string} status - New status
 * @param {Object} updates - Additional fields to update
 */
async function updateWebhookStatus(id, status, updates) {
    try {
        await supabaseAdmin
            .from('upload_webhooks')
            .update({
                status,
                ...updates,
                updated_at: new Date().toISOString()
            })
            .eq('id', id);
    } catch (error) {
        logger.error(`[Webhook Processor] Status update failed for ${id}:`, { message: error.message });
    }
}

/**
 * Update webhook record with additional data
 * 
 * @param {string} id - Webhook ID
 * @param {Object} data - Data to update
 */
async function updateWebhookRecord(id, data) {
    try {
        await supabaseAdmin
            .from('upload_webhooks')
            .update({
                ...data,
                updated_at: new Date().toISOString()
            })
            .eq('id', id);
    } catch (error) {
        logger.error(`[Webhook Processor] Record update failed for ${id}:`, { message: error.message });
    }
}

/**
 * Retry dead letter webhooks
 * 
 * @param {number} limit - Maximum number to retry
 * @returns {Promise<number>} Number of webhooks retried
 */
export async function retryDeadLetters(limit = 10) {
    try {
        // Get dead letters ready for retry
        const { data: deadLetters } = await supabaseAdmin
            .from('webhook_dead_letter')
            .select('*')
            .lt('retry_after', new Date().toISOString())
            .eq('resolved', false)
            .limit(limit)
            .order('created_at', { ascending: true });

        if (!deadLetters || deadLetters.length === 0) {
            return 0;
        }

        logger.debug(`[Webhook Processor] Retrying ${deadLetters.length} dead letters`);

        let retried = 0;
        for (const dl of deadLetters) {
            try {
                // Reset webhook status
                await supabaseAdmin
                    .from('upload_webhooks')
                    .update({
                        status: 'pending',
                        attempt_count: 0,
                        next_retry_at: null,
                        error_message: null,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', dl.webhook_id);

                // Delete from dead letter
                await supabaseAdmin
                    .from('webhook_dead_letter')
                    .delete()
                    .eq('id', dl.id);

                // Get full webhook record
                const { data: webhook } = await supabaseAdmin
                    .from('upload_webhooks')
                    .select('*')
                    .eq('id', dl.webhook_id)
                    .single();

                if (webhook) {
                    // Re-queue
                    await enqueueWebhook(webhook.id, webhook, 1); // High priority
                }

                retried++;
            } catch (error) {
                logger.error(`[Webhook Processor] Retry failed for ${dl.webhook_id}:`, { message: error.message });
            }
        }

        logger.debug(`[Webhook Processor] Retried ${retried} dead letters`);
        return retried;

    } catch (error) {
        logger.error('[Webhook Processor] Dead letter retry failed:', { message: error.message });
        return 0;
    }
}

/**
 * Resolve dead letter manually
 * 
 * @param {string} deadLetterId - Dead letter ID
 * @param {string} resolvedBy - User ID who resolved
 */
export async function resolveDeadLetter(deadLetterId, resolvedBy) {
    try {
        await supabaseAdmin
            .from('webhook_dead_letter')
            .update({
                resolved: true,
                resolved_at: new Date().toISOString(),
                resolved_by: resolvedBy
            })
            .eq('id', deadLetterId);

        logger.debug(`[Webhook Processor] Dead letter ${deadLetterId} resolved`);
        return true;
    } catch (error) {
        logger.error('[Webhook Processor] Resolve failed:', { message: error.message });
        return false;
    }
}

/**
 * Get webhook processing metrics
 * 
 * @returns {Promise<Object>} Processing metrics
 */
export async function getProcessingMetrics() {
    try {
        const { data } = await supabaseAdmin
            .from('upload_webhooks')
            .select('status', { count: 'exact' })
            .in('status', ['pending', 'delivering', 'completed', 'failed', 'dead_letter']);

        const metrics = {
            pending: 0,
            delivering: 0,
            completed: 0,
            failed: 0,
            dead_letter: 0,
            total: 0
        };

        data?.forEach(row => {
            if (metrics.hasOwnProperty(row.status)) {
                metrics[row.status]++;
            }
            metrics.total++;
        });

        return metrics;
    } catch (error) {
        logger.error('[Webhook Processor] Metrics fetch failed:', { message: error.message });
        return null;
    }
}
