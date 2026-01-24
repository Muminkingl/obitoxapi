/**
 * Cancel upload operation (DEPRECATED)
 * 
 * ⚠️ DEPRECATED: This endpoint is kept for backward compatibility only.
 * Vercel Blob does NOT support cancelling in-progress uploads.
 * Client-side cancellation uses AbortController directly.
 * 
 * @deprecated Use client-side AbortController instead
 */

import { formatErrorResponse } from '../shared/error.helper.js';

/**
 * Cancel Vercel upload (NO-OP, DEPRECATED)
 * 
 * @deprecated Vercel Blob doesn't support server-side cancellation.
 * Use AbortController on the client side for upload cancellation.
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export const cancelVercelUpload = async (req, res) => {
    // Return deprecation notice - no actual cancellation happens
    return res.status(200).json({
        success: true,
        message: 'DEPRECATED: Cancel endpoint is no longer active',
        deprecated: true,
        note: 'Vercel Blob does not support server-side upload cancellation. Use AbortController on the client side.',
        recommendation: 'Remove calls to this endpoint from your code.',
        timestamp: new Date().toISOString()
    });
};
