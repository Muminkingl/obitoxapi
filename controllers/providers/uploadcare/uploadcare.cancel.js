/**
 * Uploadcare Upload Cancellation
 * Note: Not applicable for Uploadcare as uploads are immediate
 */

import { updateUploadcareMetrics } from './uploadcare.helpers.js';

/**
 * Cancel upload (not applicable for Uploadcare as uploads are immediate)
 */
export const cancelUploadcareUpload = async (req, res) => {
    const apiKeyId = req.apiKeyId;
    const userId = req.userId;

    try {
        if (!apiKeyId) {
            return res.status(401).json({
                success: false,
                error: 'UNAUTHORIZED',
                message: 'API key is required'
            });
        }

        // Uploadcare uploads are immediate, so cancellation is not applicable
        updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'success', 0).catch(() => { });

        res.status(200).json({
            success: true,
            message: 'Upload cancellation not applicable for Uploadcare',
            data: {
                reason: 'Uploadcare uploads are immediate and cannot be cancelled',
                provider: 'uploadcare'
            }
        });

    } catch (error) {
        if (apiKeyId) {
            updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0).catch(() => { });
        }

        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Internal server error during upload cancellation',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};
