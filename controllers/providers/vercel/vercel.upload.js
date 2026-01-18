/**
 * Upload file to Vercel Blob (Server-Side)
 * Handles direct file upload to Vercel Blob from server
 */

import { put } from '@vercel/blob';
import { validateFileInput, validateVercelToken, checkVercelSizeLimit } from '../shared/validation.helper.js';
import { generateUniqueFilename } from '../shared/filename.helper.js';
import { logFileUpload } from '../shared/analytics.helper.js';
import { updateRequestMetrics } from '../shared/metrics.helper.js';
import { checkUserQuota, trackApiUsage } from '../shared/analytics.new.js';
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
            trackApiUsage({
                userId: req.userId,
                endpoint: '/api/v1/upload/vercel',
                method: 'POST',
                provider: 'vercel',
                operation: 'upload',
                statusCode: 400,
                success: false,
                apiKeyId: req.apiKeyId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
            updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', false)
                .catch(err => console.error('Metrics error:', err));

            return res.status(400).json(
                formatMissingFieldsError(['vercelToken'])
            );
        }

        // 1.5. Check User Quota
        const quotaCheck = await checkUserQuota(req.userId);
        if (!quotaCheck.allowed) {
            trackApiUsage({
                userId: req.userId,
                endpoint: '/api/v1/upload/vercel',
                method: 'POST',
                provider: 'vercel',
                operation: 'upload',
                statusCode: 413, // Payload Too Large / Quota
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

        // 2. Validate Vercel token format
        const tokenValidation = validateVercelToken(vercelToken);
        if (!tokenValidation.isValid) {
            trackApiUsage({
                userId: req.userId,
                endpoint: '/api/v1/upload/vercel',
                method: 'POST',
                provider: 'vercel',
                operation: 'upload',
                statusCode: 401,
                success: false,
                apiKeyId: req.apiKeyId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
            updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', false)
                .catch(err => console.error('Metrics error:', err));

            return res.status(401).json(
                formatErrorResponse(
                    tokenValidation.error,
                    'INVALID_TOKEN_FORMAT'
                )
            );
        }

        // 3. Extract file data (multipart or base64)
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

        // 4. Validate file
        const fileValidation = validateFileInput(originalFilename, fileMimetype, fileSize);
        if (!fileValidation.isValid) {
            trackApiUsage({
                userId: req.userId,
                endpoint: '/api/v1/upload/vercel',
                method: 'POST',
                provider: 'vercel',
                operation: 'upload',
                statusCode: 400,
                success: false,
                apiKeyId: req.apiKeyId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
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

        // 5. Check Vercel Blob size limit
        const sizeCheck = checkVercelSizeLimit(fileSize);
        if (sizeCheck.exceeds) {
            trackApiUsage({
                userId: req.userId,
                endpoint: '/api/v1/upload/vercel',
                method: 'POST',
                provider: 'vercel',
                operation: 'upload',
                statusCode: 413,
                success: false,
                apiKeyId: req.apiKeyId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
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

        // 6. Validate file buffer
        if (fileSize > 0 && fileBuffer.length === 0) {
            return res.status(400).json(
                formatErrorResponse(
                    'File appears to be corrupted or empty',
                    'CORRUPTED_FILE'
                )
            );
        }

        // 7. Generate unique filename
        const finalFilename = generateUniqueFilename(originalFilename);

        // 8. Upload to Vercel Blob with timeout
        let blob;
        const startTime = Date.now();

        try {
            const uploadPromise = put(finalFilename, fileBuffer, {
                access: 'public',
                token: vercelToken,
                addRandomSuffix: false // We handle this ourselves
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

            trackApiUsage({
                userId: req.userId,
                endpoint: '/api/v1/upload/vercel',
                method: 'POST',
                provider: 'vercel',
                operation: 'upload',
                statusCode: 500,
                success: false,
                apiKeyId: req.apiKeyId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
            updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', false)
                .catch(err => console.error('Metrics error:', err));

            // Log failed upload
            logFileUpload({
                apiKeyId: req.apiKeyId,
                userId: req.userId,
                provider: 'vercel',
                fileName: finalFilename,
                fileType: fileMimetype,
                fileSize,
                uploadStatus: 'failed',
                errorMessage: uploadError.message
            }).catch(err => console.error('Log error:', err));

            return res.status(500).json(
                handleProviderError(uploadError, 'vercel')
            );
        }

        // 9. Log successful upload (non-blocking)
        logFileUpload({
            apiKeyId: req.apiKeyId,
            userId: req.userId,
            provider: 'vercel',
            fileName: finalFilename,
            fileType: fileMimetype,
            fileSize,
            uploadStatus: 'success',
            fileUrl: blob.url
        }).catch(err => console.error('Log error:', err));

        // 10. Update metrics (non-blocking)
        trackApiUsage({
            userId: req.userId,
            endpoint: '/api/v1/upload/vercel',
            method: 'POST',
            provider: 'vercel',
            operation: 'upload',
            statusCode: 200,
            success: true,
            requestCount: 1,
            apiKeyId: req.apiKeyId,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });
        updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', true, { fileSize })
            .catch(err => console.error('Metrics error:', err));

        // 11. Return success response
        return res.status(200).json(
            formatVercelResponse(blob, originalFilename, fileMimetype)
        );

    } catch (error) {
        console.error('Upload handler error:', error);

        trackApiUsage({
            userId: req.userId,
            endpoint: '/api/v1/upload/vercel',
            method: 'POST',
            provider: 'vercel',
            operation: 'upload',
            statusCode: 500,
            success: false,
            apiKeyId: req.apiKeyId,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });
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
