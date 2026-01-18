/**
 * Generate Signed URL for Vercel Blob Upload
 * Returns placeholder URL - client uses Vercel SDK directly
 */

import { supabaseAdmin } from '../../../database/supabase.js';
import { validateFileInput, validateVercelToken } from '../shared/validation.helper.js';
import { generateUniqueFilename } from '../shared/filename.helper.js';
import { updateRequestMetrics } from '../shared/metrics.helper.js';
import { checkUserQuota, trackApiUsage } from '../shared/analytics.new.js';
import { formatErrorResponse, formatMissingFieldsError } from '../shared/error.helper.js';
import { MAX_FILE_SIZE } from './vercel.config.js';

/**
 * Generate signed URL for Vercel Blob upload
 * Note: Returns placeholder URL - actual upload handled by client SDK
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export const generateVercelSignedUrl = async (req, res) => {
    try {
        const { filename, contentType, vercelToken, fileSize } = req.body;

        // 1. Validate required fields
        if (!filename || !vercelToken) {
            // Track failed request
            trackApiUsage({
                userId: req.userId,
                endpoint: '/api/v1/upload/vercel/signed-url',
                method: 'POST',
                provider: 'vercel',
                operation: 'signed-url',
                statusCode: 400,
                success: false,
                apiKeyId: req.apiKeyId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });

            return res.status(400).json(
                formatMissingFieldsError(['filename', 'vercelToken'].filter(field =>
                    !req.body[field]
                ))
            );
        }

        // 1.5. Check User Quota
        const quotaCheck = await checkUserQuota(req.userId);
        if (!quotaCheck.allowed) {
            trackApiUsage({
                userId: req.userId,
                endpoint: '/api/v1/upload/vercel/signed-url',
                method: 'POST',
                provider: 'vercel',
                operation: 'signed-url',
                statusCode: 429,
                success: false,
                apiKeyId: req.apiKeyId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });

            return res.status(429).json(
                formatErrorResponse(
                    'Monthly quota exceeded. Please upgrade your plan.',
                    'QUOTA_EXCEEDED'
                )
            );
        }

        // 2. Validate file input
        const fileValidation = validateFileInput(filename, contentType, fileSize);
        if (!fileValidation.isValid) {
            trackApiUsage({
                userId: req.userId,
                endpoint: '/api/v1/upload/vercel/signed-url',
                method: 'POST',
                provider: 'vercel',
                operation: 'signed-url',
                statusCode: 400,
                success: false,
                apiKeyId: req.apiKeyId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });

            return res.status(400).json(
                formatErrorResponse(
                    'File validation failed',
                    'INVALID_FILE',
                    { errors: fileValidation.errors }
                )
            );
        }

        // 3. Validate Vercel token format
        const tokenValidation = validateVercelToken(vercelToken);
        if (!tokenValidation.isValid) {
            trackApiUsage({
                userId: req.userId,
                endpoint: '/api/v1/upload/vercel/signed-url',
                method: 'POST',
                provider: 'vercel',
                operation: 'signed-url',
                statusCode: 401,
                success: false,
                apiKeyId: req.apiKeyId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });

            return res.status(401).json(
                formatErrorResponse(
                    tokenValidation.error,
                    'INVALID_TOKEN_FORMAT'
                )
            );
        }

        // 4. Generate unique filename
        const finalFilename = generateUniqueFilename(filename);

        // 5. Return placeholder URLs
        // Note: Client will use Vercel SDK directly for actual upload
        // This removes the need for server-side token testing (1-2s latency)
        const uploadUrl = `vercel://${finalFilename}`;
        const fileUrl = `vercel://${finalFilename}`;

        // 6. Log upload (non-blocking fire-and-forget)
        supabaseAdmin
            .from('uploads_log')
            .insert({
                api_key_id: req.apiKeyId,
                user_id: req.userId,
                filename: finalFilename,
                file_url: fileUrl,
                status: 'initiated',
                provider: 'vercel',
                created_at: new Date(),
                metadata: {
                    user_agent: req.headers['user-agent'],
                    ip_address: req.ip,
                    token_prefix: vercelToken.substring(0, 20) + '...'
                }
            })
            .then(() => { })  // Fire-and-forget - don't wait for result
            .catch(err => console.error('Upload log error:', err));

        // 7. Update metrics (non-blocking)
        // Also tracks usage in api_usage_logs and increments quota via RPC
        trackApiUsage({
            userId: req.userId,
            endpoint: '/api/v1/upload/vercel/signed-url',
            method: 'POST',
            provider: 'vercel',
            operation: 'signed-url',
            statusCode: 200,
            success: true,
            requestCount: 1, // 1 signed URL = 1 request
            apiKeyId: req.apiKeyId,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        // Legacy metrics update (keep for backward compatibility if needed, or remove? 
        // The plan says "Update Analytics to New DB Schema". 
        // We should probably keep legacy specific tables updating if they are still used by other parts, 
        // but metrics.helper.js updates api_keys and provider_usage.
        // The new system might replace provider_usage?
        // "Provider Alignment: Ensure all 4 providers ... use this new system."
        // Let's keep updateRequestMetrics for now to maintain the old specific tables until full migration,
        // or better yet, make `trackApiUsage` also call `updateRequestMetrics` internally?
        // No, let's call both for safety to ensure all charts work.
        updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', true, { fileSize: fileSize || 0 })
            .catch(err => console.error('Legacy metrics error:', err));

        // 8. Return response with upload instructions
        return res.status(200).json({
            success: true,
            data: {
                uploadUrl,
                fileUrl,
                filename: finalFilename,
                originalFilename: filename,
                contentType,
                maxFileSize: MAX_FILE_SIZE,
                method: 'PUT'
            },
            upload: {
                headers: {
                    'Authorization': `Bearer ${vercelToken}`,
                    'Content-Type': contentType
                },
                instructions: {
                    method: 'Use Vercel Blob SDK put() method for reliable uploads',
                    sdk: '@vercel/blob',
                    example: `import { put } from '@vercel/blob';\nconst blob = await put('${finalFilename}', file, { access: 'public', token: '${vercelToken}' });`
                }
            },
            provider: 'vercel',
            message: 'Use Vercel Blob SDK to upload. Token validation will happen during actual upload.'
        });

    } catch (error) {
        console.error('Signed URL generation error:', error);

        trackApiUsage({
            userId: req.userId,
            endpoint: '/api/v1/upload/vercel/signed-url',
            method: 'POST',
            provider: 'vercel',
            operation: 'signed-url',
            statusCode: 500,
            success: false,
            apiKeyId: req.apiKeyId,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', false)
            .catch(err => console.error('Legacy metrics error:', err));

        return res.status(500).json(
            formatErrorResponse(
                'Failed to generate upload URL',
                'INTERNAL_ERROR',
                { message: error.message }
            )
        );
    }
};
