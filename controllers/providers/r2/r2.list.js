/**
 * List Files in Cloudflare R2 Bucket
 * Uses AWS SDK ListObjectsV2Command with pagination support
 */

import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getR2Client, formatR2Error } from './r2.config.js';
import { updateR2Metrics } from './r2.helpers.js';

// NEW: Analytics & Quota
import { checkUserQuota, trackApiUsage } from '../shared/analytics.new.js';

/**
 * List files in R2 bucket
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export const listR2Files = async (req, res) => {
    const startTime = Date.now();

    try {
        const {
            r2AccessKey,
            r2SecretKey,
            r2AccountId,
            r2Bucket,
            prefix = '',          // Optional prefix to filter files
            maxKeys = 1000,       // Max files to return
            continuationToken     // For pagination
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
                endpoint: '/api/v1/upload/r2/list',
                method: 'POST',
                provider: 'r2',
                operation: 'list',
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
        if (!r2AccessKey || !r2SecretKey || !r2AccountId || !r2Bucket) {
            return res.status(400).json(formatR2Error(
                'MISSING_PARAMETERS',
                'r2AccessKey, r2SecretKey, r2AccountId, and r2Bucket are required'
            ));
        }

        // Get S3Client
        const s3Client = getR2Client(r2AccountId, r2AccessKey, r2SecretKey);

        // List objects
        const command = new ListObjectsV2Command({
            Bucket: r2Bucket,
            Prefix: prefix,
            MaxKeys: Math.min(maxKeys, 1000), // AWS S3 max is 1000
            ContinuationToken: continuationToken
        });

        const response = await s3Client.send(command);

        const totalTime = Date.now() - startTime;

        // Update metrics (non-blocking)
        updateR2Metrics(apiKeyId, userId, 'r2', 'success', 0).catch(() => { });

        // New Usage Tracking
        trackApiUsage({
            userId,
            endpoint: '/api/v1/upload/r2/list',
            method: 'POST',
            provider: 'r2',
            operation: 'list',
            statusCode: 200,
            success: true,
            requestCount: 1,
            apiKeyId,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        return res.status(200).json({
            success: true,
            provider: 'r2',
            data: {
                bucket: r2Bucket,
                prefix,
                files: response.Contents?.map(file => ({
                    key: file.Key,
                    size: file.Size,
                    lastModified: file.LastModified,
                    etag: file.ETag
                })) || [],
                count: response.KeyCount || 0,
                isTruncated: response.IsTruncated || false,
                nextContinuationToken: response.NextContinuationToken || null
            },
            performance: {
                totalTime: `${totalTime}ms`
            }
        });

    } catch (error) {
        console.error('R2 list error:', error);

        if (req.apiKeyId) {
            updateR2Metrics(req.apiKeyId, req.userId, 'r2', 'failed', 0).catch(() => { });
        }

        trackApiUsage({
            userId: req.userId || req.apiKeyId,
            endpoint: '/api/v1/upload/r2/list',
            method: 'POST',
            provider: 'r2',
            operation: 'list',
            statusCode: 500,
            success: false,
            apiKeyId: req.apiKeyId,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        return res.status(500).json(formatR2Error(
            'LIST_FAILED',
            'Failed to list files from R2',
            error.message
        ));
    }
};
