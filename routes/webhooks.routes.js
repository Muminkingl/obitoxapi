/**
 * Webhook Routes
 * 
 * - POST /api/v1/webhooks/confirm - Confirm upload and trigger webhook
 * - GET /api/v1/webhooks/status/:id - Check webhook status
 * - GET /api/v1/webhooks/list - List user's webhooks
 * - POST /api/v1/webhooks/create - Create webhook config
 * - DELETE /api/v1/webhooks/:id - Delete webhook
 * - POST /api/v1/webhooks/:id/retry - Retry failed webhook
 */

import express from 'express';
import validateApiKey from '../middlewares/apikey.middleware.js';
import {
    confirmUploadWebhook,
    getWebhookStatus,
    listWebhooks,
    createWebhook,
    deleteWebhook,
    retryWebhook
} from '../controllers/webhooks/confirm.controller.js';

const router = express.Router();

// All webhook routes require API key authentication
router.use(validateApiKey);

/**
 * POST /api/v1/webhooks/confirm
 * Client confirms upload completion, triggers webhook
 */
router.post('/confirm', confirmUploadWebhook);

/**
 * GET /api/v1/webhooks/status/:id
 * Check webhook delivery status
 */
router.get('/status/:id', getWebhookStatus);

/**
 * GET /api/v1/webhooks/list
 * List user's webhooks with pagination
 */
router.get('/list', listWebhooks);

/**
 * POST /api/v1/webhooks/create
 * Create a webhook configuration (server-triggered mode)
 */
router.post('/create', createWebhook);

/**
 * DELETE /api/v1/webhooks/:id
 * Cancel/delete a webhook
 */
router.delete('/:id', deleteWebhook);

/**
 * POST /api/v1/webhooks/:id/retry
 * Retry a failed webhook
 */
router.post('/:id/retry', retryWebhook);

export default router;
