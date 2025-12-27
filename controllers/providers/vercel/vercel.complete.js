/**
 * Complete upload tracking
 * Marks upload as complete in database
 */

import { supabaseAdmin } from '../../../database/supabase.js';
import { updateRequestMetrics } from '../shared/metrics.helper.js';
import { formatErrorResponse, formatMissingFieldsError } from '../shared/error.helper.js';

/**
 * Complete Vercel upload
 * Updates tracking tables to mark upload as complete
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

        // 2. Get user info from middleware (if available)
        const userId = req.userId || req.user?.id || null;
        const apiKeyId = req.apiKeyId || req.apiKey?.id || null;

        // 3. Update upload status to completed (non-blocking)
        if (userId) {
            supabaseAdmin
                .from('upload_logs')
                .update({
                    file_url: fileUrl,
                    status: 'completed',
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId)
                .eq('file_name', filename)
                .then(() => { })
                .catch(err => console.error('Upload log update error:', err));
        }

        // 4. Update metrics (non-blocking)
        if (apiKeyId && userId) {
            updateRequestMetrics(apiKeyId, userId, provider, true, { fileSize: fileSize || 0 })
                .catch(err => console.error('Metrics error:', err));
        }

        // 5. Return success immediately
        return res.status(200).json({
            success: true,
            message: 'Upload marked as complete',
            data: {
                filename,
                originalFilename: filename,
                fileSize: fileSize || 0,
                fileUrl: fileUrl || null,
                provider,
                completedAt: new Date().toISOString(),
                metricsUpdated: !!(apiKeyId && userId),
                tracked: !!userId
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
