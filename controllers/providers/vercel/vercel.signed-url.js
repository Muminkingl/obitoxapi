/**
 * Generate Signed URL for Vercel Blob Upload
 * Returns placeholder URL - client uses Vercel SDK directly
 * 
 * OPTIMIZED: Uses only updateRequestMetrics for tracking (Redis-backed)
 */

import { validateFileInput, validateVercelToken } from '../shared/validation.helper.js';
import { generateUniqueFilename } from '../shared/filename.helper.js';
import { updateRequestMetrics } from '../shared/metrics.helper.js';
import { checkUserQuota } from '../shared/analytics.new.js';
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
            return res.status(400).json(
                formatMissingFieldsError(['filename', 'vercelToken'].filter(field =>
                    !req.body[field]
                ))
            );
        }

        // 2. Check User Quota
        const quotaCheck = await checkUserQuota(req.userId);
        if (!quotaCheck.allowed) {
            return res.status(429).json(
                formatErrorResponse(
                    'Monthly quota exceeded. Please upgrade your plan.',
                    'QUOTA_EXCEEDED'
                )
            );
        }

        // 3. Validate file input
        const fileValidation = validateFileInput(filename, contentType, fileSize);
        if (!fileValidation.isValid) {
            return res.status(400).json(
                formatErrorResponse(
                    'File validation failed',
                    'INVALID_FILE',
                    { errors: fileValidation.errors }
                )
            );
        }

        // 4. Validate Vercel token format
        const tokenValidation = validateVercelToken(vercelToken);
        if (!tokenValidation.isValid) {
            return res.status(401).json(
                formatErrorResponse(
                    tokenValidation.error,
                    'INVALID_TOKEN_FORMAT'
                )
            );
        }

        // 5. Generate unique filename
        const finalFilename = generateUniqueFilename(filename);

        // 6. Return placeholder URLs
        // Note: Client will use Vercel SDK directly for actual upload
        const uploadUrl = `vercel://${finalFilename}`;
        const fileUrl = `vercel://${finalFilename}`;

        // 7. Update metrics via Redis (non-blocking, single call)
        updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', true, { fileSize: fileSize || 0 })
            .catch(err => console.error('Metrics error:', err));

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

        updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', false)
            .catch(err => console.error('Metrics error:', err));

        return res.status(500).json(
            formatErrorResponse(
                'Failed to generate upload URL',
                'INTERNAL_ERROR',
                { message: error.message }
            )
        );
    }
};
