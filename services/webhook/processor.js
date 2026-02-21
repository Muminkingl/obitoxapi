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
/**
 * Internal worker — does all HTTP/Redis work and returns pending DB ops.
 * Does NOT write to the database. This lets processWebhookBatch collect
 * all pending writes and fire them concurrently at the end (Fix #1).
 */
async function _processWebhookWork(webhookRecord) {
    const { id, webhook_url, webhook_secret } = webhookRecord;
    const startTime = Date.now();

    logger.debug(`[Webhook Processor] Processing ${id}...`);

    try {
        // 1. Verify file exists (auto-trigger mode)
        if ((webhookRecord.status === 'pending' || webhookRecord.status === 'verifying')
            && webhookRecord.trigger_mode === 'auto') {

            const verifyResult = await verifyFile(webhookRecord);

            if (!verifyResult.exists) {
                await requeueWebhook(id, webhookRecord, 30000);
                return {
                    success: false,
                    reason: 'file_not_found_yet',
                    pendingUpdate: { id, status: 'pending', updates: { error_message: 'File not yet available, requeued' } }
                };
            }

            // Intermediate metadata update stays in-place (non-status, happens before delivery)
            if (verifyResult.metadata) {
                await updateWebhookRecord(id, {
                    etag: verifyResult.metadata.etag,
                    file_size: verifyResult.metadata.contentLength
                });
            }
        }

        // 2. Build payload + signature
        const payload = buildWebhookPayload(webhookRecord, {});
        const signature = generateWebhookSignature(payload, webhook_secret);

        // 3. Deliver (outgoing HTTP — the slow part)
        const response = await deliverWebhook(webhook_url, payload, signature, id);

        logger.debug(`[Webhook Processor] Delivered ${id} in ${Date.now() - startTime}ms`);

        return {
            success: true,
            pendingUpdate: {
                id,
                status: 'completed',
                updates: {
                    attempt_count: webhookRecord.attempt_count + 1,
                    response_status: response.status,
                    response_body: response.body.substring(0, 1000),
                    completed_at: new Date().toISOString()
                }
            }
        };

    } catch (error) {
        logger.error(`[Webhook Processor] Failed ${id}:`, { message: error.message });

        const attemptCount = webhookRecord.attempt_count + 1;

        if (attemptCount >= MAX_ATTEMPTS) {
            return {
                success: false,
                reason: 'max_retries',
                pendingDeadLetter: { webhook: webhookRecord, reason: error.message },
                pendingUpdate: {
                    id,
                    status: 'dead_letter',
                    updates: {
                        attempt_count: attemptCount,
                        error_message: error.message,
                        failed_at: new Date().toISOString()
                    }
                }
            };
        } else {
            const delay = RETRY_DELAYS[attemptCount - 1] + Math.random() * 1000;
            await requeueWebhook(id, webhookRecord, delay); // Redis — fast, stays here
            return {
                success: false,
                reason: 'retry_scheduled',
                pendingUpdate: {
                    id,
                    status: 'pending',
                    updates: {
                        attempt_count: attemptCount,
                        next_retry_at: new Date(Date.now() + delay).toISOString(),
                        error_message: error.message
                    }
                }
            };
        }
    }
}

/**
 * Process a single webhook — public API, backward compatible.
 * Executes DB writes immediately. For batch processing use processWebhookBatch().
 */
export async function processWebhook(webhookRecord) {
    const result = await _processWebhookWork(webhookRecord);
    if (result.pendingDeadLetter) {
        await moveToDeadLetter(result.pendingDeadLetter.webhook, result.pendingDeadLetter.reason);
    }
    if (result.pendingUpdate) {
        await updateWebhookStatus(result.pendingUpdate.id, result.pendingUpdate.status, result.pendingUpdate.updates);
    }
    return { success: result.success, reason: result.reason };
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
 * Run async tasks with a max concurrency limit.
 * Processes items in chunks of `limit` — prevents connection pool exhaustion.
 *
 * FIX #4: Previously processWebhookBatch fired all 100 HTTP calls simultaneously
 * via a single Promise.allSettled. At batch=100 this saturates Node's HTTP pool
 * and causes mass timeouts → retry storm.
 * Now: process in groups of 20, collect results in order.
 */
async function runWithConcurrency(items, limit, fn) {
    const results = [];
    for (let i = 0; i < items.length; i += limit) {
        const chunk = items.slice(i, i + limit);
        const settled = await Promise.allSettled(chunk.map(item => fn(item)));
        for (const r of settled) {
            if (r.status === 'fulfilled') {
                results.push(r.value);
            } else {
                // Treat unexpected throws as failed with no pending ops
                results.push({ success: false, reason: 'error', pendingUpdate: null, pendingDeadLetter: null });
            }
        }
    }
    return results;
}

/**
 * Process batch of webhooks.
 *
 * FIX #1: N+1 DB status updates replaced with a single concurrent batch.
 *   Before: each processWebhook() wrote to DB immediately → 100 scattered DB calls/tick.
 *   After:  HTTP work runs first (concurrency-limited to 20), then ALL DB writes
 *           fire concurrently via Promise.all at the end → minimum round-trips.
 *
 * FIX #4: HTTP calls capped at 20 concurrent to prevent connection pool exhaustion.
 */
export async function processWebhookBatch(webhookRecords) {
    // Phase 1: HTTP delivery + Redis ops — max 20 concurrent
    const workResults = await runWithConcurrency(webhookRecords, 20, _processWebhookWork);

    // Phase 2: Fire all DB writes concurrently (not one-by-one)
    const dbOps = [];
    for (const result of workResults) {
        if (result.pendingDeadLetter) {
            dbOps.push(moveToDeadLetter(result.pendingDeadLetter.webhook, result.pendingDeadLetter.reason));
        }
        if (result.pendingUpdate) {
            dbOps.push(updateWebhookStatus(
                result.pendingUpdate.id,
                result.pendingUpdate.status,
                result.pendingUpdate.updates
            ));
        }
    }
    if (dbOps.length > 0) {
        await Promise.all(dbOps);
    }

    let successful = 0;
    let failed = 0;
    const details = [];

    for (let i = 0; i < workResults.length; i++) {
        const result = workResults[i];
        const webhook = webhookRecords[i];
        if (result.success) {
            successful++;
        } else {
            failed++;
        }
        details.push({ id: webhook?.id, success: result.success, reason: result.reason });
    }

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
