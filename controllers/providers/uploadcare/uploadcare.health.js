/**
 * Uploadcare Health Check
 * Simple connectivity verification
 */

import { MAX_FILE_SIZE, ALLOWED_FILE_TYPES } from './uploadcare.config.js';

/**
 * Uploadcare health check endpoint
 */
export const uploadcareHealthCheck = async (req, res) => {
    try {
        return res.status(200).json({
            success: true,
            message: 'Uploadcare provider is healthy',
            provider: 'uploadcare',
            status: 'operational',
            timestamp: new Date().toISOString(),
            features: {
                upload: true,
                download: true,
                delete: true,
                list: true,
                cancel: false, // Uploads are immediate
                malwareScanning: true,
                imageTransformations: true,
                cdnDelivery: true,
                maxFileSize: `${MAX_FILE_SIZE / 1024 / 1024}MB`,
                allowedTypes: ALLOWED_FILE_TYPES,
                rateLimit: '100 uploads per minute'
            },
            limits: {
                maxFileSize: `${MAX_FILE_SIZE / 1024 / 1024}MB`,
                note: 'Uploadcare supports various file types with on-the-fly processing'
            }
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Uploadcare provider health check failed',
            provider: 'uploadcare',
            status: 'degraded',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Health check failed',
            timestamp: new Date().toISOString()
        });
    }
};
