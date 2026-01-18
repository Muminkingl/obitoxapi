/**
 * Delete file from Vercel Blob
 * Uses Vercel Blob's del() function
 */

import { del } from '@vercel/blob';
import { validateVercelToken } from '../shared/validation.helper.js';
import { updateRequestMetrics } from '../shared/metrics.helper.js';
import { formatErrorResponse, handleProviderError, formatMissingFieldsError } from '../shared/error.helper.js';

// NEW: Analytics & Quota
import { checkUserQuota, trackApiUsage } from '../shared/analytics.new.js';

/**
 * Delete file from Vercel Blob
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export const deleteVercelFile = async (req, res) => {
    try {
        const { fileUrl, vercelToken } = req.body;
        const { apiKeyId } = req;
        const userId = req.userId || apiKeyId;

        // ========================================================================
        // QUOTA CHECK (Database RPC) 💰
        // ========================================================================
        const quotaCheck = await checkUserQuota(userId);
        if (!quotaCheck.allowed) {
            trackApiUsage({
                userId,
                endpoint: '/api/v1/upload/vercel/delete',
                method: 'DELETE',
                provider: 'vercel',
                operation: 'delete',
                statusCode: 403,
                success: false,
                apiKeyId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
            return res.status(403).json({
                success: false,
                error: 'QUOTA_EXCEEDED',
                message: 'Monthly quota exceeded',
                limit: quotaCheck.limit,
                used: quotaCheck.used
            });
        }

        // 1. Validate required fields
        if (!fileUrl || !vercelToken) {
            updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', false)
                .catch(err => console.error('Metrics error:', err));

            return res.status(400).json(
                formatMissingFieldsError(['fileUrl', 'vercelToken'].filter(field =>
                    !req.body[field]
                ))
            );
        }

        // 2. Validate Vercel token
        const tokenValidation = validateVercelToken(vercelToken);
        if (!tokenValidation.isValid) {
            updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', false)
                .catch(err => console.error('Metrics error:', err));

            return res.status(401).json(
                formatErrorResponse(
                    tokenValidation.error,
                    'INVALID_TOKEN_FORMAT'
                )
            );
        }

        // 3. Delete from Vercel Blob with timeout
        try {
            const deletePromise = del(fileUrl, { token: vercelToken });

            // Race with timeout (30 seconds)
            await Promise.race([
                deletePromise,
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Delete timeout')), 30000)
                )
            ]);

            console.log('✅ File deleted from Vercel Blob');

        } catch (deleteError) {
            console.error('Vercel delete error:', deleteError);

            // Handle timeout
            if (deleteError.message === 'Delete timeout') {
                updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', false)
                    .catch(err => console.error('Metrics error:', err));

                return res.status(408).json(
                    formatErrorResponse(
                        'Delete operation timed out',
                        'DELETE_TIMEOUT',
                        { message: 'The file may still be deleted in the background' }
                    )
                );
            }

            // Handle other errors
            updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', false)
                .catch(err => console.error('Metrics error:', err));

            return res.status(500).json(
                handleProviderError(deleteError, 'vercel')
            );
        }

        // 4. Update metrics (non-blocking)
        updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', true)
            .catch(err => console.error('Metrics error:', err));

        // New Usage Tracking
        trackApiUsage({
            userId,
            endpoint: '/api/v1/upload/vercel/delete',
            method: 'DELETE',
            provider: 'vercel',
            operation: 'delete',
            statusCode: 200,
            success: true,
            requestCount: 1,
            apiKeyId,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        // 5. Return success
        return res.status(200).json({
            success: true,
            message: 'File deleted successfully from Vercel Blob',
            fileUrl,
            provider: 'vercel',
            timestamp: new Date().toISOString(),
            debug_userId: userId // DEBUGGING
        });

    } catch (error) {
        console.error('Delete handler error:', error);

        updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', false)
            .catch(err => console.error('Metrics error:', err));

        trackApiUsage({
            userId: req.userId || req.apiKeyId,
            endpoint: '/api/v1/upload/vercel/delete',
            method: 'DELETE',
            provider: 'vercel',
            operation: 'delete',
            statusCode: 500,
            success: false,
            apiKeyId: req.apiKeyId,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        return res.status(500).json(
            formatErrorResponse(
                'Failed to process delete request',
                'DELETE_PROCESSING_FAILED',
                { message: error.message }
            )
        );
    }
};
