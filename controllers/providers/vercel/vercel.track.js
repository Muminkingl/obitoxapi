/**
 * Track upload events
 * Logs upload events for analytics and monitoring
 */

import { supabaseAdmin } from '../../../database/supabase.js';
import { logFileUpload } from '../shared/analytics.helper.js';
import { updateRequestMetrics } from '../shared/metrics.helper.js';
import { trackApiUsage } from '../shared/analytics.new.js';
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
            provider = 'vercel'
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

        // 2. Get user info from middleware (if available)
        const userId = req.userId || req.user?.id || null;
        const apiKeyId = req.apiKeyId || req.apiKey?.id || null;

        // 3. Log to file_uploads table (non-blocking, if we have user info)
        if (filename && userId && apiKeyId) {
            logFileUpload({
                apiKeyId,
                userId,
                provider,
                fileName: filename,
                fileType: 'application/octet-stream',
                fileSize: fileSize || 0,
                uploadStatus: event === 'completed' ? 'success' : event,
                fileUrl,
                errorMessage: error
            }).catch(err => console.error('Log error:', err));
        }

        // 4. Log to api_requests table (non-blocking, if we have user info)
        if (userId && apiKeyId) {
            supabaseAdmin
                .from('api_requests')
                .insert({
                    api_key_id: apiKeyId,
                    user_id: userId,
                    request_type: 'upload',
                    provider,
                    status_code: event === 'completed' ? 200 : 400,
                    request_size_bytes: fileSize || 0,
                    response_size_bytes: event === 'completed' ? (fileSize || 0) : 0,
                    error_message: error,
                    requested_at: new Date().toISOString()
                })
                .then(() => { })
                .catch(err => console.error('Request log error:', err));
        }

        // 5. Update metrics (non-blocking, if we have user info)
        // 5. Update metrics (non-blocking, if we have user info)
        if (userId && apiKeyId && event === 'completed') {
            trackApiUsage({
                userId,
                endpoint: '/api/v1/upload/vercel/track',
                method: 'POST',
                provider,
                operation: 'confirm', // Use 'confirm' or 'track' to distinguish from signed-url
                statusCode: 200,
                success: true,
                requestCount: 1, // 1 upload completion = 1 request
                apiKeyId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });

            updateRequestMetrics(apiKeyId, userId, provider, true, fileSize || 0)
                .catch(err => console.error('Metrics error:', err));
        } else if (userId && apiKeyId && event === 'failed') {
            trackApiUsage({
                userId,
                endpoint: '/api/v1/upload/vercel/track',
                method: 'POST',
                provider,
                operation: 'confirm',
                statusCode: 400,
                success: false,
                requestCount: 1, // Failed upload tracking might still count as request if we want? Or valid tracking request?
                // Plans say "1 file upload completion = 1 request". Implies success. 
                // But failed request to API is still a request.
                apiKeyId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });

            updateRequestMetrics(apiKeyId, userId, provider, false, fileSize || 0)
                .catch(err => console.error('Metrics error:', err));
        }

        // 6. Return success immediately
        return res.status(200).json({
            success: true,
            message: 'Event tracked successfully',
            event,
            timestamp: new Date().toISOString(),
            tracked: !!(userId && apiKeyId)
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
