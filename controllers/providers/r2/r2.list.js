/**
 * List Files in Cloudflare R2 Bucket
 * Uses AWS SDK ListObjectsV2Command with pagination support
 * 
 * OPTIMIZED: Uses only updateRequestMetrics (Redis-backed)
 */

import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getR2Client, formatR2Error } from './r2.config.js';
import logger from '../../../utils/logger.js';

// Quota check
import { checkUserQuota } from '../shared/analytics.new.js';

// Import memory guard
import { checkMemoryRateLimit } from './cache/memory-guard.js';

import { updateRequestMetrics } from '../shared/metrics.helper.js';

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
            prefix = '',
            maxKeys = 1000,
            continuationToken
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
        const memCheck = checkMemoryRateLimit(userId, 'r2-list');
        if (!memCheck.allowed) {
            return res.status(429).json(formatR2Error(
                'RATE_LIMIT_EXCEEDED',
                'Rate limit exceeded - too many list requests',
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
        if (!r2AccessKey || !r2SecretKey || !r2AccountId || !r2Bucket) {
            return res.status(400).json(formatR2Error(
                'MISSING_PARAMETERS',
                'r2AccessKey, r2SecretKey, r2AccountId, and r2Bucket are required'
            ));
        }

        // Get S3Client
        const s3Client = getR2Client(r2AccountId, r2AccessKey, r2SecretKey);

        // List objects via fetch to avoid DOMParser crash in CF Workers
        const command = new ListObjectsV2Command({
            Bucket: r2Bucket,
            Prefix: prefix,
            MaxKeys: Math.min(maxKeys, 1000),
            ContinuationToken: continuationToken
        });

        // Use presigned URL + manual fetch to handle the XML manually
        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });
        const listResponse = await fetch(signedUrl);

        if (!listResponse.ok) {
            throw new Error(`R2 HTTP ${listResponse.status}: ${await listResponse.text()}`);
        }

        const xmlText = await listResponse.text();

        // Very lightweight Regex-based XML parsing (CF edge compatible)
        const files = [];
        const contentsRegex = /<Contents>[\s\S]*?<\/Contents>/g;
        let match;
        while ((match = contentsRegex.exec(xmlText)) !== null) {
            const item = match[0];
            const key = item.match(/<Key>(.*?)<\/Key>/)?.[1] || '';
            const size = parseInt(item.match(/<Size>(.*?)<\/Size>/)?.[1] || '0', 10);
            const lastModified = new Date(item.match(/<LastModified>(.*?)<\/LastModified>/)?.[1] || new Date().toISOString());
            const etag = item.match(/<ETag>(.*?)<\/ETag>/)?.[1]?.replace(/"/g, '') || '';

            if (key) files.push({ key, size, lastModified, etag });
        }

        const isTruncated = xmlText.includes('<IsTruncated>true</IsTruncated>');
        const nextContinuationTokenMatch = xmlText.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/);
        const nextContinuationToken = nextContinuationTokenMatch ? nextContinuationTokenMatch[1] : null;

        const totalTime = Date.now() - startTime;

        // 🚀 SINGLE METRICS CALL (Redis-backed)
        updateRequestMetrics(apiKeyId, userId, 'r2', true)
            .catch(() => { });

        return res.status(200).json({
            success: true,
            provider: 'r2',
            data: {
                bucket: r2Bucket,
                prefix,
                files: files,
                count: files.length,
                isTruncated,
                nextContinuationToken
            },
            performance: {
                totalTime: `${totalTime}ms`
            }
        });

    } catch (error) {
        logger.error(`r2 error:`, { error });

        if (req.apiKeyId) {
            updateRequestMetrics(req.apiKeyId, req.userId || req.apiKeyId, 'r2', false)
                .catch(() => { });
        }

        return res.status(500).json(formatR2Error(
            'LIST_FAILED',
            'Failed to list files from R2',
            process.env.NODE_ENV === 'development' ? error.message : null
        ));
    }
};
