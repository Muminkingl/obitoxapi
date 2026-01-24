/**
 * Uploadcare Upload Cancellation (DEPRECATED)
 * 
 * ⚠️ DEPRECATED: Uploadcare uploads are immediate and cannot be cancelled.
 * This endpoint is kept for backward compatibility only.
 * 
 * @deprecated Use client-side cancellation if needed before upload starts
 */

/**
 * Cancel upload (DEPRECATED - does nothing)
 * 
 * @deprecated Uploadcare uploads are immediate, cancellation not applicable.
 */
export const cancelUploadcareUpload = async (req, res) => {
    // Return deprecation notice - no actual cancellation happens
    return res.status(200).json({
        success: true,
        message: 'DEPRECATED: Cancel endpoint is no longer active',
        deprecated: true,
        note: 'Uploadcare uploads are immediate and cannot be cancelled server-side.',
        recommendation: 'Remove calls to this endpoint from your code.',
        provider: 'uploadcare',
        timestamp: new Date().toISOString()
    });
};
