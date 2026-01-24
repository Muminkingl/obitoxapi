/**
 * Analytics tracking helper (LEGACY - DEPRECATED)
 * 
 * NOTE: The original tables (upload_logs, api_requests, file_uploads) have been deleted.
 * These functions are now NO-OPs for backwards compatibility.
 * 
 * All metrics tracking is now handled by:
 * - Redis-backed updateRequestMetrics() from metrics.helper.js
 * - Daily tables synced by daily-rollup-worker.js
 */

/**
 * Log file upload (NO-OP - table deleted)
 * @deprecated Use updateRequestMetrics from metrics.helper.js instead
 */
export const logFileUpload = async (data) => {
    // NO-OP: upload_logs, api_requests, file_uploads tables have been deleted
    // Metrics are now tracked via Redis → api_keys, provider_usage, etc.
    return;
};

/**
 * Track upload initiation (NO-OP - table deleted)
 * @deprecated Use updateRequestMetrics from metrics.helper.js instead
 */
export const trackUploadInitiated = async (data) => {
    // NO-OP: upload_logs table has been deleted
    return;
};

/**
 * Track upload completion (NO-OP - table deleted)
 * @deprecated Use updateRequestMetrics from metrics.helper.js instead
 */
export const trackUploadCompleted = async (data) => {
    // NO-OP: upload_logs table has been deleted
    return;
};

/**
 * Track upload failure (NO-OP - table deleted)
 * @deprecated Use updateRequestMetrics from metrics.helper.js instead
 */
export const trackUploadFailed = async (data) => {
    // NO-OP: upload_logs table has been deleted
    return;
};
