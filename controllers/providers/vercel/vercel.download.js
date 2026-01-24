/**
 * Download file from Vercel Blob
 * Returns public download URL (Vercel files are public by default)
 * 
 * OPTIMIZED: Uses only updateRequestMetrics (Redis-backed)
 */

import { validateVercelToken } from '../shared/validation.helper.js';
import { updateRequestMetrics } from '../shared/metrics.helper.js';
import { checkUserQuota } from '../shared/analytics.new.js';
import { formatErrorResponse, formatMissingFieldsError } from '../shared/error.helper.js';

/**
 * Download file from Vercel Blob
 * Returns download URL - NO verification (Vercel files are public)
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export const downloadVercelFile = async (req, res) => {
    try {
        const { fileUrl, vercelToken } = req.body;
        const apiKeyId = req.apiKeyId;
        const userId = req.userId || apiKeyId;

        // 1. Check User Quota
        const quotaCheck = await checkUserQuota(userId);
        if (!quotaCheck.allowed) {
            return res.status(403).json({
                success: false,
                error: 'QUOTA_EXCEEDED',
                message: 'Monthly quota exceeded',
                limit: quotaCheck.limit,
                used: quotaCheck.used
            });
        }

        // 2. Validate required fields
        if (!fileUrl) {
            return res.status(400).json(
                formatMissingFieldsError(['fileUrl'])
            );
        }

        if (!vercelToken) {
            return res.status(400).json(
                formatMissingFieldsError(['vercelToken'])
            );
        }

        // 3. Validate token format
        const tokenValidation = validateVercelToken(vercelToken);
        if (!tokenValidation.isValid) {
            return res.status(401).json(
                formatErrorResponse(
                    tokenValidation.error,
                    'INVALID_TOKEN_FORMAT'
                )
            );
        }

        // 4. Extract filename from URL
        const urlParts = fileUrl.split('/');
        const filename = urlParts[urlParts.length - 1];

        // 5. Update metrics via Redis (non-blocking, single call)
        updateRequestMetrics(apiKeyId, userId, 'vercel', true)
            .catch(err => console.error('Metrics error:', err));

        // 6. Return download URL immediately (no verification needed)
        // Vercel Blob files are public - if file doesn't exist, user gets 404 when downloading
        return res.status(200).json({
            success: true,
            message: 'File download URL generated successfully',
            data: {
                filename,
                downloadUrl: fileUrl,
                downloadMethod: 'direct',
                isPrivate: false,
                provider: 'vercel',
                instructions: {
                    note: 'Vercel Blob files are publicly accessible',
                    curlExample: `curl -o "${filename}" "${fileUrl}"`,
                    browserExample: `window.open("${fileUrl}", "_blank")`
                }
            }
        });

    } catch (error) {
        console.error('Download handler error:', error);

        updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', false)
            .catch(err => console.error('Metrics error:', err));

        return res.status(500).json(
            formatErrorResponse(
                'Internal server error',
                'SERVER_ERROR',
                { message: error.message }
            )
        );
    }
};
