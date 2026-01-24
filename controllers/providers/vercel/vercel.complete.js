/**
 * Complete upload tracking (DEPRECATED - Use /vercel/track instead)
 * 
 * ⚠️ DEPRECATED: This endpoint duplicates /vercel/track with event='completed'.
 * Kept for backward compatibility only. New code should use /vercel/track.
 * 
 * @deprecated Use POST /api/v1/upload/vercel/track with { event: 'completed' } instead
 */

import { updateRequestMetrics } from '../shared/metrics.helper.js';
import { formatErrorResponse, formatMissingFieldsError } from '../shared/error.helper.js';

/**
 * Complete Vercel upload (DEPRECATED)
 * 
 * @deprecated Use /vercel/track with event='completed' instead.
 * This endpoint is maintained for backward compatibility only.
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export const completeVercelUpload = async (req, res) => {
    try {
        const { filename, fileUrl, fileSize, provider = 'vercel' } = req.body;

        // 1. Validate required fields
        if (!filename) {
            return res.status(400).json(
                formatMissingFieldsError(['filename'])
            );
        }

        // 2. Get user info from middleware
        const userId = req.userId || req.user?.id || null;
        const apiKeyId = req.apiKeyId || req.apiKey?.id || null;

        // 3. Update metrics via Redis (non-blocking)
        if (apiKeyId && userId) {
            updateRequestMetrics(apiKeyId, userId, provider, true, { fileSize: fileSize || 0 })
                .catch(err => console.error('Metrics error:', err));
        }

        // 4. Return success with deprecation notice
        return res.status(200).json({
            success: true,
            message: 'Upload marked as complete',
            deprecated: true,
            deprecationNotice: 'This endpoint is deprecated. Use POST /api/v1/upload/vercel/track with { event: "completed" } instead.',
            data: {
                filename,
                fileSize: fileSize || 0,
                fileUrl: fileUrl || null,
                provider,
                completedAt: new Date().toISOString(),
                metricsUpdated: !!(apiKeyId && userId)
            }
        });

    } catch (error) {
        console.error('Complete upload error:', error);

        return res.status(500).json(
            formatErrorResponse(
                'Failed to complete upload',
                'COMPLETE_FAILED',
                { message: error.message }
            )
        );
    }
};
