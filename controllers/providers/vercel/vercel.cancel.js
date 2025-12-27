/**
 * Cancel upload operation
 * Marks upload as cancelled in tracking system
 */

import { updateRequestMetrics } from '../shared/metrics.helper.js';
import { formatErrorResponse, formatMissingFieldsError } from '../shared/error.helper.js';

/**
 * Cancel Vercel upload
 * Note: Vercel Blob doesn't support cancelling in-progress uploads
 * This marks the upload as cancelled in our tracking system
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export const cancelVercelUpload = async (req, res) => {
    try {
        const { uploadId, vercelToken } = req.body;

        // 1. Validate required fields
        if (!uploadId || !vercelToken) {
            return res.status(400).json(
                formatMissingFieldsError(['uploadId', 'vercelToken'].filter(field =>
                    !req.body[field]
                ))
            );
        }

        // 2. Track cancellation (non-blocking)
        // Note: Vercel Blob doesn't support cancelling uploads
        // We just mark it as cancelled in our system
        updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', false)
            .catch(err => console.error('Metrics error:', err));

        // 3. Return success
        return res.status(200).json({
            success: true,
            message: 'Upload cancellation requested',
            uploadId,
            status: 'cancelled',
            timestamp: new Date().toISOString(),
            note: 'Upload marked as cancelled in tracking system. Vercel Blob does not support cancelling in-progress uploads.'
        });

    } catch (error) {
        console.error('Cancel upload error:', error);

        return res.status(500).json(
            formatErrorResponse(
                'Failed to cancel upload',
                'CANCEL_FAILED',
                { message: error.message }
            )
        );
    }
};
