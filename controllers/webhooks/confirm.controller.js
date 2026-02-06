/**
 * Webhook Controller
 * 
 * - POST /api/v1/webhooks/confirm - Client confirms upload completion
 * - GET /api/v1/webhooks/status/:id - Check webhook status
 * - GET /api/v1/webhooks/list - List user's webhooks
 */

import { supabaseAdmin } from '../../config/supabase.js';
import { getRedis } from '../../config/redis.js';
import { enqueueWebhook } from '../../services/webhook/queue-manager.js';
import { generateWebhookId, generateWebhookSecret, isValidWebhookUrl } from '../../utils/webhook/signature.js';

/**
 * IDEMPOTENCY_KEY_PREFIX for double-confirm prevention
 */
const IDEMPOTENCY_PREFIX = 'webhook:confirm:idempotency:';
const IDEMPOTENCY_TTL = 60; // 60 seconds window

/**
 * POST /api/v1/webhooks/confirm
 * Client confirms upload completion, triggers webhook delivery
 * 
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 */
export async function confirmUploadWebhook(req, res) {
    try {
        const { webhookId, etag } = req.body;
        const apiKeyId = req.apiKeyId;
        const userId = req.userId;

        if (!webhookId) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_WEBHOOK_ID',
                message: 'webhookId is required'
            });
        }

        // Get webhook record
        const { data: webhook, error } = await supabaseAdmin
            .from('upload_webhooks')
            .select('*')
            .eq('id', webhookId)
            .eq('user_id', userId)
            .single();

        if (error || !webhook) {
            return res.status(404).json({
                success: false,
                error: 'WEBHOOK_NOT_FOUND',
                message: 'Webhook not found or access denied'
            });
        }

        // Check if already processed
        if (webhook.status === 'completed') {
            return res.json({
                success: true,
                message: 'Webhook already delivered',
                status: 'completed',
                deliveredAt: webhook.completed_at
            });
        }

        // Check if in dead letter
        if (webhook.status === 'dead_letter') {
            return res.status(410).json({
                success: false,
                error: 'WEBHOOK_IN_DEAD_LETTER',
                message: 'Webhook has failed too many times and is in dead letter queue'
            });
        }

        // Check if expired
        if (new Date(webhook.expires_at) < new Date()) {
            await supabaseAdmin
                .from('upload_webhooks')
                .update({
                    status: 'failed',
                    failed_at: new Date().toISOString(),
                    error_message: 'Webhook expired before delivery'
                })
                .eq('id', webhookId);

            return res.status(410).json({
                success: false,
                error: 'WEBHOOK_EXPIRED',
                message: 'Webhook token has expired'
            });
        }

        // Update ETag if provided
        if (etag) {
            await supabaseAdmin
                .from('upload_webhooks')
                .update({
                    etag,
                    status: 'verifying'
                })
                .eq('id', webhookId);
        } else {
            await supabaseAdmin
                .from('upload_webhooks')
                .update({ status: 'verifying' })
                .eq('id', webhookId);
        }

        // ✅ ADDED: Idempotency check - prevent double-confirm
        const redis = getRedis();
        const idempotencyKey = `${IDEMPOTENCY_PREFIX}${webhookId}`;
        
        if (redis?.status === 'ready') {
            // Try to acquire lock with SETNX
            const acquired = await redis.set(idempotencyKey, '1', 'EX', IDEMPOTENCY_TTL, 'NX');
            if (!acquired) {
                // Another request is already processing this webhook
                console.warn(`[Webhook Confirm] ⏭️ Duplicate confirm request for ${webhookId}`);
                return res.json({
                    success: true,
                    message: 'Webhook confirmation already in progress',
                    webhookId: webhook.id,
                    status: webhook.status,
                    duplicated: true
                });
            }
        }

        // Add to Redis queue for processing
        console.log(`[Webhook Confirm] 🔄 Enqueueing webhook ${webhook.id}...`);
        const enqueued = await enqueueWebhook(webhook.id, webhook, 0);
        console.log(`[Webhook Confirm] 📤 Enqueue result: ${enqueued}`);

        if (!enqueued) {
            // Fallback: queue unavailable, will be picked up by worker
            console.warn('[Webhook Confirm] ⚠️ Queue unavailable, webhook will be processed by worker');
        }

        res.json({
            success: true,
            message: 'Webhook queued for delivery',
            webhookId: webhook.id,
            status: 'queued',
            estimatedDelivery: '5-30 seconds'
        });

    } catch (error) {
        console.error('[Webhook Confirm] Error:', error);
        res.status(500).json({
            success: false,
            error: 'WEBHOOK_CONFIRMATION_FAILED',
            message: error.message
        });
    }
}

/**
 * GET /api/v1/webhooks/status/:id
 * Check webhook delivery status
 * 
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 */
export async function getWebhookStatus(req, res) {
    try {
        const { id } = req.params;
        const userId = req.userId;

        const { data: webhook, error } = await supabaseAdmin
            .from('upload_webhooks')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (error || !webhook) {
            return res.status(404).json({
                success: false,
                error: 'WEBHOOK_NOT_FOUND',
                message: 'Webhook not found'
            });
        }

        res.json({
            success: true,
            data: {
                id: webhook.id,
                status: webhook.status,
                provider: webhook.provider,
                filename: webhook.filename,
                createdAt: webhook.created_at,
                deliveredAt: webhook.completed_at,
                failedAt: webhook.failed_at,
                attemptCount: webhook.attempt_count,
                lastAttemptAt: webhook.last_attempt_at,
                nextRetryAt: webhook.next_retry_at,
                errorMessage: webhook.error_message,
                webhookUrl: webhook.webhook_url
            }
        });

    } catch (error) {
        console.error('[Webhook Status] Error:', error);
        res.status(500).json({
            success: false,
            error: 'STATUS_FETCH_FAILED',
            message: error.message
        });
    }
}

/**
 * GET /api/v1/webhooks/list
 * List user's webhooks with pagination
 * 
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 */
export async function listWebhooks(req, res) {
    try {
        const { status, limit = 20, offset = 0 } = req.query;
        const userId = req.userId;

        let query = supabaseAdmin
            .from('upload_webhooks')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

        if (status) {
            query = query.eq('status', status);
        }

        const { data: webhooks, error } = await query;

        if (error) {
            throw error;
        }

        // Get total count
        const { count } = await supabaseAdmin
            .from('upload_webhooks')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

        res.json({
            success: true,
            data: webhooks,
            pagination: {
                total: count,
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });

    } catch (error) {
        console.error('[Webhook List] Error:', error);
        res.status(500).json({
            success: false,
            error: 'LIST_FAILED',
            message: error.message
        });
    }
}

/**
 * POST /api/v1/webhooks/create
 * Create a webhook configuration (for server-triggered mode)
 * 
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 */
export async function createWebhook(req, res) {
    try {
        const {
            webhookUrl,
            webhookSecret,
            provider,
            bucket,
            fileKey,
            filename,
            contentType,
            fileSize,
            metadata
        } = req.body;

        const apiKeyId = req.apiKeyId;
        const userId = req.userId;

        // Validate webhook URL
        if (!webhookUrl || !isValidWebhookUrl(webhookUrl)) {
            return res.status(400).json({
                success: false,
                error: 'INVALID_WEBHOOK_URL',
                message: 'Valid webhook URL is required (http/https)'
            });
        }

        // Generate webhook ID and secret
        const id = generateWebhookId();
        const secret = webhookSecret || generateWebhookSecret();

        // Insert webhook record
        const { data: webhook, error } = await supabaseAdmin
            .from('upload_webhooks')
            .insert({
                id,
                user_id: userId,
                api_key_id: apiKeyId,
                webhook_url: webhookUrl,
                webhook_secret: secret,
                trigger_mode: 'auto', // Server will verify file
                provider,
                bucket,
                file_key: fileKey,
                filename,
                content_type: contentType,
                file_size: fileSize,
                etag: null,
                status: 'pending',
                metadata: metadata || {}
            })
            .select()
            .single();

        if (error) {
            throw error;
        }

        res.status(201).json({
            success: true,
            data: {
                webhookId: webhook.id,
                webhookSecret: secret,
                status: 'pending'
            }
        });

    } catch (error) {
        console.error('[Webhook Create] Error:', error);
        res.status(500).json({
            success: false,
            error: 'WEBHOOK_CREATION_FAILED',
            message: error.message
        });
    }
}

/**
 * DELETE /api/v1/webhooks/:id
 * Cancel/delete a webhook
 * 
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 */
export async function deleteWebhook(req, res) {
    try {
        const { id } = req.params;
        const userId = req.userId;

        // Check ownership
        const { data: webhook, error } = await supabaseAdmin
            .from('upload_webhooks')
            .select('id, status')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (error || !webhook) {
            return res.status(404).json({
                success: false,
                error: 'WEBHOOK_NOT_FOUND',
                message: 'Webhook not found'
            });
        }

        if (webhook.status === 'completed') {
            return res.status(400).json({
                success: false,
                error: 'WEBHOOK_ALREADY_COMPLETED',
                message: 'Cannot delete a completed webhook'
            });
        }

        // Delete webhook
        await supabaseAdmin
            .from('upload_webhooks')
            .delete()
            .eq('id', id);

        res.json({
            success: true,
            message: 'Webhook deleted'
        });

    } catch (error) {
        console.error('[Webhook Delete] Error:', error);
        res.status(500).json({
            success: false,
            error: 'DELETE_FAILED',
            message: error.message
        });
    }
}

/**
 * POST /api/v1/webhooks/:id/retry
 * Retry a failed webhook
 * 
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 */
export async function retryWebhook(req, res) {
    try {
        const { id } = req.params;
        const userId = req.userId;

        // Get webhook
        const { data: webhook, error } = await supabaseAdmin
            .from('upload_webhooks')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (error || !webhook) {
            return res.status(404).json({
                success: false,
                error: 'WEBHOOK_NOT_FOUND',
                message: 'Webhook not found'
            });
        }

        if (webhook.status === 'completed') {
            return res.status(400).json({
                success: false,
                error: 'WEBHOOK_ALREADY_COMPLETED',
                message: 'Cannot retry a completed webhook'
            });
        }

        // Reset and requeue
        await supabaseAdmin
            .from('upload_webhooks')
            .update({
                status: 'pending',
                attempt_count: 0,
                next_retry_at: null,
                error_message: null,
                updated_at: new Date().toISOString()
            })
            .eq('id', id);

        // Re-queue
        await enqueueWebhook(webhook.id, webhook, 1); // High priority

        res.json({
            success: true,
            message: 'Webhook queued for retry',
            webhookId: id
        });

    } catch (error) {
        console.error('[Webhook Retry] Error:', error);
        res.status(500).json({
            success: false,
            error: 'RETRY_FAILED',
            message: error.message
        });
    }
}
