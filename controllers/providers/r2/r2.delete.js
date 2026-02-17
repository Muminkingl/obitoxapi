/**
 * Delete File from Cloudflare R2
 * Uses AWS SDK DeleteObjectCommand (pure operation, fast)
 * 
 * OPTIMIZED: Uses only updateRequestMetrics (Redis-backed)
 */

import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getR2Client, formatR2Error } from './r2.config.js';

// Quota check
import { checkUserQuota } from '../shared/analytics.new.js';

// Import memory guard
import { checkMemoryRateLimit } from './cache/memory-guard.js';

import { updateRequestMetrics } from '../shared/metrics.helper.js';

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
            fileKey,
            r2AccessKey,
            r2SecretKey,
            r2AccountId,
            r2Bucket
        } = req.body;

        const apiKeyId = req.apiKeyId;
        const userId = req.userId || apiKeyId;

        if (!apiKeyId) {
            return res.status(401).json(formatR2Error(
                'UNAUTHORIZED',
                'API key is required'
            ));
        }

        // LAYER 1: Memory Guard (fastest possible)
        const memCheck = checkMemoryRateLimit(userId, 'r2-delete');
        if (!memCheck.allowed) {
            return res.status(429).json(formatR2Error(
                'RATE_LIMIT_EXCEEDED',
                'Rate limit exceeded - too many delete requests',
                'Wait a moment before trying again'
            ));
        }

        // QUOTA CHECK (OPT-2: use MW2 data if available, else fallback)
        const quotaCheck = req.quotaChecked || await checkUserQuota(userId);
        if (!quotaCheck.allowed) {
            return res.status(403).json(formatR2Error(
                'QUOTA_EXCEEDED',
                'Monthly quota exceeded',
                `Used: ${quotaCheck.current || quotaCheck.used}, Limit: ${quotaCheck.limit}`
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

        // 🚀 SINGLE METRICS CALL (Redis-backed)
        updateRequestMetrics(apiKeyId, userId, 'r2', true)
            .catch(() => { });

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
            updateRequestMetrics(req.apiKeyId, req.userId || req.apiKeyId, 'r2', false)
                .catch(() => { });
        }

        return res.status(500).json(formatR2Error(
            'DELETE_FAILED',
            'Failed to delete file from R2',
            process.env.NODE_ENV === 'development' ? error.message : null
        ));
    }
};
