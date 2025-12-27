/**
 * Download file from Vercel Blob
 * Returns public download URL (Vercel files are public by default)
 */

import { validateVercelToken } from '../shared/validation.helper.js';
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

        // 1. Validate required fields
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

        // 2. Validate token format
        const tokenValidation = validateVercelToken(vercelToken);
        if (!tokenValidation.isValid) {
            return res.status(401).json(
                formatErrorResponse(
                    tokenValidation.error,
                    'INVALID_TOKEN_FORMAT'
                )
            );
        }

        // 3. Extract filename from URL
        const urlParts = fileUrl.split('/');
        const filename = urlParts[urlParts.length - 1];

        // 4. Return download URL immediately (no verification needed)
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

        return res.status(500).json(
            formatErrorResponse(
                'Internal server error',
                'SERVER_ERROR',
                { message: error.message }
            )
        );
    }
};
