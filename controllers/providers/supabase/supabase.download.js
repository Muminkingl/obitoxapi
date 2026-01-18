/**
 * Supabase Storage Download Operation
 * WITH ENTERPRISE MULTI-LAYER CACHING
 */

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_BUCKET, PRIVATE_BUCKET } from './supabase.config.js';
import { updateSupabaseMetrics } from './supabase.helpers.js';

// Import multi-layer cache
import { checkMemoryRateLimit } from './cache/memory-guard.js';
import { checkRedisRateLimit } from './cache/redis-cache.js';

// NEW: Analytics & Quota
import { checkUserQuota, trackApiUsage } from '../shared/analytics.new.js';


/**
 * Download file from Supabase Storage
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export const downloadSupabaseFile = async (req, res) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    let apiKey;

    try {
        console.log('📥 Downloading from Supabase Storage...');

        const {
            fileUrl,
            filename,
            bucket = SUPABASE_BUCKET,
            expiresIn = 3600,
            supabaseToken,
            supabaseUrl
        } = req.body;

        apiKey = req.apiKeyId;
        const userId = req.userId || apiKey;

        // Validate credentials
        if (!supabaseToken) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_SUPABASE_TOKEN',
                message: 'Supabase service key is required'
            });
        }

        if (!supabaseUrl) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_SUPABASE_URL',
                message: 'Supabase project URL is required'
            });
        }

        const developerSupabase = createClient(supabaseUrl, supabaseToken);

        if (!apiKey) {
            return res.status(401).json({
                success: false,
                error: 'UNAUTHORIZED',
                message: 'API key is required'
            });
        }

        // LAYER 1: Memory guard
        const memoryStart = Date.now();
        const memCheck = checkMemoryRateLimit(userId, 'download');
        const memoryTime = Date.now() - memoryStart;

        if (!memCheck.allowed) {
            console.log(`[${requestId}] ❌ Blocked by memory guard in ${memoryTime}ms`);
            return res.status(429).json({
                success: false,
                error: 'RATE_LIMIT_EXCEEDED',
                message: 'Rate limit exceeded',
                layer: 'memory'
            });
        }

        // LAYER 2: Redis rate limit
        const redisStart = Date.now();
        const redisLimit = await checkRedisRateLimit(userId, 'download');
        const redisTime = Date.now() - redisStart;

        if (!redisLimit.allowed) {
            console.log(`[${requestId}] ❌ Blocked by Redis in ${redisTime}ms`);
            return res.status(429).json({
                success: false,
                error: 'RATE_LIMIT_EXCEEDED',
                message: 'Rate limit exceeded',
                layer: redisLimit.layer
            });
        }

        if (!fileUrl && !filename) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_PARAMETERS',
                message: 'Either fileUrl or filename is required'
            });
        }

        let targetFilename;
        let targetBucket = bucket;

        // Extract filename and bucket from URL
        if (fileUrl) {
            try {
                const url = new URL(fileUrl);
                const pathParts = url.pathname.split('/');
                targetFilename = pathParts[pathParts.length - 1];

                // Extract bucket from URL
                const bucketMatch = url.pathname.match(/\/storage\/v1\/object\/public\/([^\/]+)\//);
                if (bucketMatch) {
                    targetBucket = bucketMatch[1];
                }
            } catch (error) {
                return res.status(400).json({
                    success: false,
                    error: 'INVALID_URL',
                    message: 'Invalid file URL provided'
                });
            }
        } else {
            targetFilename = filename;
        }

        if (!targetFilename) {
            return res.status(400).json({
                success: false,
                error: 'INVALID_FILENAME',
                message: 'Could not determine filename'
            });
        }

        // Determine if private bucket
        const isPublicBucket = targetBucket === SUPABASE_BUCKET;
        const isPrivateBucket = targetBucket === PRIVATE_BUCKET || targetBucket === 'admin' || !isPublicBucket;

        let downloadUrl;
        let downloadMethod = 'direct';
        let expiresAt = null;

        const operationStart = Date.now();

        if (isPrivateBucket) {
            // Generate signed download URL for private files
            const { data: signedUrlData, error: signedUrlError } = await developerSupabase.storage
                .from(targetBucket)
                .createSignedUrl(targetFilename, expiresIn);

            if (signedUrlError) {
                updateSupabaseMetrics(apiKey, 'supabase', false, 'SIGNED_URL_ERROR').catch(() => { });
                return res.status(500).json({
                    success: false,
                    error: 'SIGNED_URL_ERROR',
                    message: 'Failed to generate signed download URL',
                    details: signedUrlError.message
                });
            }

            downloadUrl = signedUrlData.signedUrl;
            downloadMethod = 'signed';
            expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
        } else {
            // Get public URL for public files
            const { data: urlData } = developerSupabase.storage
                .from(targetBucket)
                .getPublicUrl(targetFilename);

            downloadUrl = urlData.publicUrl;
            downloadMethod = 'public';
        }

        const operationTime = Date.now() - operationStart;
        const totalTime = Date.now() - startTime;

        // Background metrics update
        updateSupabaseMetrics(apiKey, 'supabase', true, 'DOWNLOAD_SUCCESS').catch(() => { });

        // New Usage Tracking
        trackApiUsage({
            userId,
            endpoint: '/api/v1/upload/supabase/download',
            method: 'POST',
            provider: 'supabase',
            operation: 'download',
            statusCode: 200,
            success: true,
            requestCount: 1,
            apiKeyId: apiKey,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        // New Usage Tracking
        trackApiUsage({
            userId,
            endpoint: '/api/v1/upload/supabase/download',
            method: 'POST',
            provider: 'supabase',
            operation: 'download',
            statusCode: 200,
            success: true,
            requestCount: 1,
            apiKeyId: apiKey,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        console.log(`[${requestId}] ✅ SUCCESS in ${totalTime}ms`);

        // Success response
        res.status(200).json({
            success: true,
            message: 'Download URL generated successfully',
                data: {
                    downloadUrl,
                    filename: targetFilename,
                    bucket: targetBucket,
                    provider: 'supabase',
                    downloadMethod,
                    isPrivate: isPrivateBucket,
                    expiresAt,
                    expiresIn: isPrivateBucket ? expiresIn : null
                },
                performance: {
                    requestId,
                    totalTime: `${totalTime}ms`,
                    breakdown: {
                        memoryGuard: `${memoryTime}ms`,
                        redisCheck: `${redisTime}ms`,
                        supabaseOperation: `${operationTime}ms`
                    }
                }
            });

        } catch (error) {
            const totalTime = Date.now() - startTime;
            console.error(`[${requestId}] 💥 Error after ${totalTime}ms:`, error);

            if (apiKey) {
                updateSupabaseMetrics(apiKey, 'supabase', false, 'SERVER_ERROR', {
                    errorDetails: error.message
                }).catch(() => { });

                trackApiUsage({
                    userId: req.userId || apiKey,
                    endpoint: '/api/v1/upload/supabase/download',
                    method: 'POST',
                    provider: 'supabase',
                    operation: 'download',
                    statusCode: 500,
                    success: false,
                    apiKeyId: apiKey,
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent']
                });
            }

            res.status(500).json({
                success: false,
                error: 'SERVER_ERROR',
                message: 'Internal server error during Supabase Storage download',
                details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
            });
        }
    };
