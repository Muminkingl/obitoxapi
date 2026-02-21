/**
 * Webhook Queue Manager
 * 
 * Redis-based queue for webhook processing
 * - Enqueue webhook for processing
 * - Dequeue batch of webhooks
 * - Queue length monitoring
 */

import { getRedis } from '../../config/redis.js';
import logger from '../../utils/logger.js';

const WEBHOOK_QUEUE_KEY = 'webhook:queue';
const WEBHOOK_PROCESSING_KEY = 'webhook:processing';
const WEBHOOK_PRIORITY_KEY = 'webhook:priority';

/**
 * Add webhook to Redis queue
 * 
 * @param {string} webhookId - Webhook ID
 * @param {Object} payload - Webhook data payload
 * @param {number} priority - Priority level (0 = normal, higher = more urgent)
 * @returns {Promise<boolean>} True if enqueued successfully
 */
export async function enqueueWebhook(webhookId, payload, priority = 0) {
    const redis = getRedis();

    if (!redis) {
        logger.error('[Webhook Queue] Redis not available');
        return false;
    }

    try {
        const queueItem = JSON.stringify({
            id: webhookId,
            payload,
            priority,
            enqueuedAt: new Date().toISOString()
        });

        if (priority > 5) {
            // High priority: add to sorted set with current timestamp as score
            // Lower score = higher priority
            await redis.zadd(WEBHOOK_PRIORITY_KEY, Date.now(), queueItem);
            logger.debug(`[Webhook Queue] Enqueued ${webhookId} (HIGH PRIORITY)`);
        } else {
            // Normal priority: add to list (FIFO)
            await redis.lpush(WEBHOOK_QUEUE_KEY, queueItem);
            logger.debug(`[Webhook Queue] Enqueued ${webhookId}`);
        }

        return true;
    } catch (error) {
        logger.error('[Webhook Queue] Enqueue failed:', { message: error.message });
        return false;
    }
}

/**
 * Get batch of webhooks from queue
 * 
 * @param {number} batchSize - Maximum number of webhooks to dequeue
 * @returns {Promise<Array>} Array of webhook queue items
 */
export async function dequeueWebhooks(batchSize = 100) {
    const redis = getRedis();

    if (!redis) {
        logger.warn('[Webhook Queue] Redis not available');
        return [];
    }

    try {
        const items = [];
        const now = Date.now();

        // First, check priority queue (sorted set)
        const priorityItems = await redis.zrangebyscore(
            WEBHOOK_PRIORITY_KEY,
            0,
            now,
            'LIMIT',
            0,
            Math.min(batchSize, 10) // Priority queue limited to 10 items max
        );

        for (const item of priorityItems) {
            items.push(JSON.parse(item));
            await redis.zrem(WEBHOOK_PRIORITY_KEY, item);
        }

        if (items.length >= batchSize) {
            return items.slice(0, batchSize);
        }

        // Then get from normal queue
        const normalItems = await redis.rpop(WEBHOOK_QUEUE_KEY, batchSize - items.length);

        if (normalItems && normalItems.length > 0) {
            for (const item of normalItems) {
                items.push(JSON.parse(item));
            }
        }

        if (items.length > 0) {
            logger.debug(`[Webhook Queue] Dequeued ${items.length} webhooks`);
        }

        return items;
    } catch (error) {
        logger.error('[Webhook Queue] Dequeue failed:', { message: error.message });
        return [];
    }
}

/**
 * Get queue length
 * 
 * @returns {Promise<number>} Total number of webhooks in queue
 */
export async function getQueueLength() {
    const redis = getRedis();

    if (!redis) return 0;

    try {
        const [listLen, priorityLen] = await Promise.all([
            redis.llen(WEBHOOK_QUEUE_KEY),
            redis.zcard(WEBHOOK_PRIORITY_KEY)
        ]);

        return listLen + priorityLen;
    } catch (error) {
        logger.error('[Webhook Queue] Queue length check failed:', { message: error.message });
        return 0;
    }
}

/**
 * Get queue statistics
 * 
 * ✅ ADDED: Defensive null handling for Redis responses
 * 
 * @returns {Promise<Object>} Queue stats
 */
export async function getQueueStats() {
    const redis = getRedis();

    if (!redis) {
        return { total: 0, normal: 0, priority: 0 };
    }

    try {
        const [normal, priority] = await Promise.all([
            redis.llen(WEBHOOK_QUEUE_KEY),
            redis.zcard(WEBHOOK_PRIORITY_KEY)
        ]);

        // ✅ DEFENSIVE: Ensure we always have numbers
        const normalCount = normal || 0;
        const priorityCount = priority || 0;

        return {
            total: normalCount + priorityCount,
            normal: normalCount,
            priority: priorityCount
        };
    } catch (error) {
        logger.error('[Webhook Queue] Stats check failed:', { message: error.message });
        return { total: 0, normal: 0, priority: 0 };
    }
}

/**
 * Re-queue webhook for retry
 * 
 * @param {string} webhookId - Webhook ID
 * @param {Object} payload - Webhook data payload
 * @param {number} delayMs - Delay before processing (milliseconds)
 * @returns {Promise<boolean>} True if re-queued successfully
 */
export async function requeueWebhook(webhookId, payload, delayMs = 5000) {
    const redis = getRedis();

    if (!redis) {
        logger.error('[Webhook Queue] Redis not available');
        return false;
    }

    try {
        const queueItem = JSON.stringify({
            id: webhookId,
            payload,
            priority: 0,
            retryCount: (payload.retryCount || 0) + 1,
            enqueuedAt: new Date().toISOString()
        });

        // Add to processing queue with TTL
        // Will be moved back to main queue after delay
        await redis.setex(`${WEBHOOK_PROCESSING_KEY}:${webhookId}`, Math.ceil(delayMs / 1000), queueItem);

        logger.debug(`[Webhook Queue] Requeued ${webhookId} for retry in ${delayMs}ms`);
        return true;
    } catch (error) {
        logger.error('[Webhook Queue] Requeue failed:', { message: error.message });
        return false;
    }
}

/**
 * Remove webhook from queue (for cancelled/deleted webhooks)
 * 
 * @param {string} webhookId - Webhook ID
 * @returns {Promise<boolean>} True if removed successfully
 */
export async function removeWebhook(webhookId) {
    const redis = getRedis();

    if (!redis) return false;

    try {
        // Remove from normal queue
        const items = await redis.lrange(WEBHOOK_QUEUE_KEY, 0, -1);
        for (const item of items) {
            const parsed = JSON.parse(item);
            if (parsed.id === webhookId) {
                await redis.lrem(WEBHOOK_QUEUE_KEY, 0, item);
                logger.debug(`[Webhook Queue] Removed ${webhookId} from queue`);
                break;
            }
        }

        // Remove from priority queue
        const priorityItems = await redis.zrange(WEBHOOK_PRIORITY_KEY, 0, -1);
        for (const item of priorityItems) {
            const parsed = JSON.parse(item);
            if (parsed.id === webhookId) {
                await redis.zrem(WEBHOOK_PRIORITY_KEY, item);
                logger.debug(`[Webhook Queue] Removed ${webhookId} from priority queue`);
                break;
            }
        }

        // Remove from processing
        await redis.del(`${WEBHOOK_PROCESSING_KEY}:${webhookId}`);

        return true;
    } catch (error) {
        logger.error('[Webhook Queue] Remove failed:', { message: error.message });
        return false;
    }
}

/**
 * Clear all webhooks from queue (admin only)
 * 
 * @returns {Promise<boolean>} True if cleared successfully
 */
export async function clearQueue() {
    const redis = getRedis();

    if (!redis) return false;

    try {
        await Promise.all([
            redis.del(WEBHOOK_QUEUE_KEY),
            redis.del(WEBHOOK_PRIORITY_KEY)
        ]);

        logger.info('[Webhook Queue] Queue cleared');
        return true;
    } catch (error) {
        logger.error('[Webhook Queue] Clear failed:', { message: error.message });
        return false;
    }
}
