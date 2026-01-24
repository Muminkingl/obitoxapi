/**
 * Track upload events for Uploadcare
 * Logs upload events for analytics via Redis metrics
 * 
 * OPTIMIZED: Uses only updateRequestMetrics (Redis-backed)
 */

import { updateRequestMetrics } from '../shared/metrics.helper.js';
import { formatErrorResponse } from '../shared/error.helper.js';

/**
 * Track upload event
 * Used for analytics, monitoring, and billing
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export const trackUploadEvent = async (req, res) => {
    try {
        const {
            event,
            filename,
            fileSize,
            fileUrl,
            error,
            provider = 'uploadcare'
        } = req.body;

        // 1. Validate event type
        const validEvents = ['initiated', 'completed', 'failed', 'cancelled'];
        if (!event || !validEvents.includes(event)) {
            return res.status(400).json(
                formatErrorResponse(
                    `Invalid event type. Must be one of: ${validEvents.join(', ')}`,
                    'INVALID_EVENT'
                )
            );
        }

        // 2. Get user info from middleware
        const userId = req.userId || req.user?.id || null;
        const apiKeyId = req.apiKeyId || req.apiKey?.id || null;

        // 3. Update metrics via Redis (non-blocking, single call)
        if (userId && apiKeyId) {
            const success = event === 'completed';
            updateRequestMetrics(apiKeyId, userId, 'uploadcare', success, { fileSize: fileSize || 0 })
                .catch(err => console.error('Metrics error:', err));
        }

        // 4. Return success immediately
        return res.status(200).json({
            success: true,
            message: 'Event tracked successfully',
            event,
            timestamp: new Date().toISOString(),
            tracked: !!(userId && apiKeyId),
            provider: 'uploadcare'
        });

    } catch (error) {
        console.error('Track event error:', error);

        return res.status(500).json(
            formatErrorResponse(
                'Failed to track event',
                'TRACKING_FAILED',
                { message: error.message }
            )
        );
    }
};
