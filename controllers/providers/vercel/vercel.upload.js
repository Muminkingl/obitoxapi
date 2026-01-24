/**
 * Upload file to Vercel Blob (Server-Side)
 * Handles direct file upload to Vercel Blob from server
 * 
 * OPTIMIZED: Uses only updateRequestMetrics (Redis-backed)
 */

import { put } from '@vercel/blob';
import { validateFileInput, validateVercelToken, checkVercelSizeLimit } from '../shared/validation.helper.js';
import { generateUniqueFilename } from '../shared/filename.helper.js';
import { updateRequestMetrics } from '../shared/metrics.helper.js';
import { checkUserQuota } from '../shared/analytics.new.js';
import { formatErrorResponse, handleProviderError, formatMissingFieldsError } from '../shared/error.helper.js';
import { formatVercelResponse, VERCEL_BLOB_LIMIT } from './vercel.config.js';

/**
 * Upload file to Vercel Blob (server-side)
 * Supports both multipart form data and base64
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export const uploadToVercelBlob = async (req, res) => {
    try {
        const { vercelToken } = req.body;

        // 1. Validate Vercel token existence
        if (!vercelToken) {
            updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', false)
                .catch(err => console.error('Metrics error:', err));

            return res.status(400).json(
                formatMissingFieldsError(['vercelToken'])
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

        // 3. Validate Vercel token format
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

        // 4. Extract file data (multipart or base64)
        let fileBuffer;
        let originalFilename;
        let fileMimetype;
        let fileSize;

        if (req.file) {
            // Multipart form data
            fileBuffer = req.file.buffer;
            originalFilename = req.file.originalname;
            fileMimetype = req.file.mimetype;
            fileSize = req.file.size;
        } else if (req.body.file) {
            // Base64 upload
            try {
                fileBuffer = Buffer.from(req.body.file, 'base64');
                originalFilename = req.body.filename || 'uploaded-file';
                fileMimetype = req.body.contentType || 'application/octet-stream';
                fileSize = fileBuffer.length;
            } catch (decodeError) {
                return res.status(400).json(
                    formatErrorResponse(
                        'Invalid base64 file data',
                        'INVALID_FILE_ENCODING'
                    )
                );
            }
        } else {
            return res.status(400).json(
                formatMissingFieldsError(['file'])
            );
        }

        // 5. Validate file
        const fileValidation = validateFileInput(originalFilename, fileMimetype, fileSize);
        if (!fileValidation.isValid) {
            updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', false)
                .catch(err => console.error('Metrics error:', err));

            return res.status(400).json(
                formatErrorResponse(
                    'File validation failed',
                    'INVALID_FILE',
                    { errors: fileValidation.errors }
                )
            );
        }

        // 6. Check Vercel Blob size limit
        const sizeCheck = checkVercelSizeLimit(fileSize);
        if (sizeCheck.exceeds) {
            updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', false)
                .catch(err => console.error('Metrics error:', err));

            return res.status(413).json(
                formatErrorResponse(
                    sizeCheck.message,
                    'VERCEL_SIZE_LIMIT_EXCEEDED',
                    {
                        maxSize: `${(VERCEL_BLOB_LIMIT / 1024 / 1024).toFixed(1)}MB`,
                        currentSize: `${(fileSize / 1024 / 1024).toFixed(2)}MB`,
                        recommendation: 'Split large files into smaller chunks or use a different provider'
                    }
                )
            );
        }

        // 7. Validate file buffer
        if (fileSize > 0 && fileBuffer.length === 0) {
            return res.status(400).json(
                formatErrorResponse(
                    'File appears to be corrupted or empty',
                    'CORRUPTED_FILE'
                )
            );
        }

        // 8. Generate unique filename
        const finalFilename = generateUniqueFilename(originalFilename);

        // 9. Upload to Vercel Blob with timeout
        let blob;
        const startTime = Date.now();

        try {
            const uploadPromise = put(finalFilename, fileBuffer, {
                access: 'public',
                token: vercelToken,
                addRandomSuffix: false
            });

            // Race with timeout (60 seconds)
            blob = await Promise.race([
                uploadPromise,
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Upload timeout')), 60000)
                )
            ]);

            const uploadTime = Date.now() - startTime;
            console.log(`✅ Upload completed in ${uploadTime}ms`);

        } catch (uploadError) {
            console.error('Vercel upload error:', uploadError);

            updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', false)
                .catch(err => console.error('Metrics error:', err));

            return res.status(500).json(
                handleProviderError(uploadError, 'vercel')
            );
        }

        // 10. Update metrics via Redis (non-blocking, single call)
        updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', true, { fileSize })
            .catch(err => console.error('Metrics error:', err));

        // 11. Return success response
        return res.status(200).json(
            formatVercelResponse(blob, originalFilename, fileMimetype)
        );

    } catch (error) {
        console.error('Upload handler error:', error);

        updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', false)
            .catch(err => console.error('Metrics error:', err));

        return res.status(500).json(
            formatErrorResponse(
                'Upload failed',
                'INTERNAL_ERROR',
                { message: error.message }
            )
        );
    }
};
