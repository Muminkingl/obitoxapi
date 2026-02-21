/**
 * Error formatting helper
 * Format consistent error responses for all providers
 */

import logger from '../../../utils/logger.js';

/**
 * Format standard error response
 * @param {string} message - Error message
 * @param {string} code - Error code
 * @param {Object} details - Additional error details
 * @returns {Object} formatted error
 */
export const formatErrorResponse = (message, code = 'UNKNOWN_ERROR', details = null) => {
    const error = {
        success: false,
        error: message,
        code,
        timestamp: new Date().toISOString()
    };

    if (details) {
        error.details = details;
    }

    return error;
};

/**
 * Handle provider-specific errors
 * @param {Error} error 
 * @param {string} provider 
 * @returns {Object} formatted error response
 */
export const handleProviderError = (error, provider = 'unknown') => {
    logger.error(`${provider} error:`, { error });

    const errorMessage = error.message?.toLowerCase() || '';

    // Network errors
    if (errorMessage.includes('network') || errorMessage.includes('timeout') || errorMessage.includes('econnrefused')) {
        return formatErrorResponse(
            'Network error. Please check connection and try again.',
            'NETWORK_ERROR',
            { provider }
        );
    }

    // Authentication errors
    if (errorMessage.includes('unauthorized') || errorMessage.includes('invalid token') || errorMessage.includes('401')) {
        return formatErrorResponse(
            'Invalid or expired token',
            'UNAUTHORIZED',
            { provider, hint: 'Check your API credentials' }
        );
    }

    // Permission errors
    if (errorMessage.includes('forbidden') || errorMessage.includes('permission') || errorMessage.includes('403')) {
        return formatErrorResponse(
            'Insufficient permissions',
            'FORBIDDEN',
            { provider, hint: 'Token needs read-write access' }
        );
    }

    // Quota/Storage errors
    if (errorMessage.includes('quota') || errorMessage.includes('limit') || errorMessage.includes('storage')) {
        return formatErrorResponse(
            'Storage quota exceeded or rate limit reached',
            'QUOTA_EXCEEDED',
            { provider }
        );
    }

    // File too large
    if (errorMessage.includes('payload too large') || errorMessage.includes('413') || errorMessage.includes('entity too large')) {
        return formatErrorResponse(
            'File size exceeds provider limit',
            'FILE_TOO_LARGE',
            { provider }
        );
    }

    // Not found
    if (errorMessage.includes('not found') || errorMessage.includes('404')) {
        return formatErrorResponse(
            'Resource not found',
            'NOT_FOUND',
            { provider }
        );
    }

    // Generic error
    return formatErrorResponse(
        'An error occurred',
        'PROVIDER_ERROR',
        {
            provider,
            message: error.message,
            hint: 'Please try again or contact support'
        }
    );
};

/**
 * Format validation error
 * @param {Array} errors - Array of validation errors
 * @returns {Object} formatted error
 */
export const formatValidationError = (errors) => {
    return formatErrorResponse(
        'Validation failed',
        'VALIDATION_ERROR',
        { errors }
    );
};

/**
 * Format missing fields error
 * @param {Array} missingFields 
 * @returns {Object} formatted error
 */
export const formatMissingFieldsError = (missingFields) => {
    return formatErrorResponse(
        'Missing required fields',
        'MISSING_FIELDS',
        { missingFields }
    );
};
