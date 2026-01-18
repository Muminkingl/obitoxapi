/**
 * Delete File from Cloudflare R2
 * Uses AWS SDK DeleteObjectCommand (pure operation, fast)
 */

import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getR2Client, formatR2Response, formatR2Error } from './r2.config.js';
import { updateR2Metrics } from './r2.helpers.js';

// NEW: Analytics & Quota
import { checkUserQuota, trackApiUsage } from '../shared/analytics.new.js';

/**
 * Delete file from R2 bucket
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export const deleteR2File = async (req, res) => {
    const startTime = Date.now();

    try {
        const {
            fileKey,        // Object key (filename) to delete
            r2AccessKey,
            r2SecretKey,
            r2AccountId,
            r2Bucket
        } = req.body;

        const apiKeyId = req.apiKeyId;
        const userId = req.userId || apiKeyId;

        // ========================================================================
        // QUOTA CHECK (Database RPC) 💰
        // ========================================================================
        const quotaCheck = await checkUserQuota(userId);
        if (!quotaCheck.allowed) {
            trackApiUsage({
                userId,
                endpoint: '/api/v1/upload/r2/delete',
                method: 'DELETE',
                provider: 'r2',
                operation: 'delete',
                statusCode: 403,
                success: false,
                apiKeyId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
            return res.status(403).json(formatR2Error(
                'QUOTA_EXCEEDED',
                'Monthly quota exceeded',
                `Used: ${quotaCheck.used}, Limit: ${quotaCheck.limit}`
            ));
        }

        // Validate required fields
        if (!fileKey || !r2AccessKey || !r2SecretKey || !r2AccountId || !r2Bucket) {
            return res.status(400).json(formatR2Error(
                'MISSING_PARAMETERS',
                'fileKey, r2AccessKey, r2SecretKey, r2AccountId, and r2Bucket are required'
            ));
        }

        // Get S3Client
        const s3Client = getR2Client(r2AccountId, r2AccessKey, r2SecretKey);

        // Delete object
        const command = new DeleteObjectCommand({
            Bucket: r2Bucket,
            Key: fileKey
        });

        await s3Client.send(command);

        const totalTime = Date.now() - startTime;

        // Update metrics (non-blocking)
        updateR2Metrics(apiKeyId, userId, 'r2', 'success', 0).catch(() => { });

        // New Usage Tracking
        trackApiUsage({
            userId,
            endpoint: '/api/v1/upload/r2/delete',
            method: 'DELETE',
            provider: 'r2',
            operation: 'delete',
            statusCode: 200,
            success: true,
            requestCount: 1,
            apiKeyId,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        return res.status(200).json({
            success: true,
            message: 'File deleted successfully',
            provider: 'r2',
            data: {
                fileKey,
                bucket: r2Bucket,
                deletedAt: new Date().toISOString()
            },
            performance: {
                totalTime: `${totalTime}ms`
            }
        });

    } catch (error) {
        console.error('R2 delete error:', error);

        if (req.apiKeyId) {
            updateR2Metrics(req.apiKeyId, req.userId, 'r2', 'failed', 0).catch(() => { });
        }

        trackApiUsage({
            userId: req.userId || req.apiKeyId,
            endpoint: '/api/v1/upload/r2/delete',
            method: 'DELETE',
            provider: 'r2',
            operation: 'delete',
            statusCode: 500,
            success: false,
            apiKeyId: req.apiKeyId,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        return res.status(500).json(formatR2Error(
            'DELETE_FAILED',
            'Failed to delete file from R2',
            error.message
        ));
    }
};
