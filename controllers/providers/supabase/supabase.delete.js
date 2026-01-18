/**
 * Supabase Storage Delete Operation
 * WITH ENTERPRISE MULTI-LAYER CACHING
 */

import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../../config/supabase.js';
import { SUPABASE_BUCKET, PRIVATE_BUCKET } from './supabase.config.js';
import { updateSupabaseMetrics } from './supabase.helpers.js';

// Import multi-layer cache
import { checkMemoryRateLimit } from './cache/memory-guard.js';
import { checkRedisRateLimit } from './cache/redis-cache.js';


// NEW: Analytics & Quota
import { checkUserQuota, trackApiUsage } from '../shared/analytics.new.js';

/**
 * Delete file from Supabase Storage
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export const deleteSupabaseFile = async (req, res) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    let apiKey;

    try {
        console.log('🗑️ Deleting file from Supabase Storage...');

        const {
            fileUrl,
            filename,
            bucket: customBucket,
            force = false,
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
        const memCheck = checkMemoryRateLimit(userId, 'delete');
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
        const redisLimit = await checkRedisRateLimit(userId, 'delete');
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
        let targetBucket = customBucket || SUPABASE_BUCKET;

        // Extract filename from URL if provided
        if (fileUrl) {
            try {
                const url = new URL(fileUrl);
                const pathParts = url.pathname.split('/');
                targetFilename = pathParts[pathParts.length - 1];

                // Try to extract bucket from URL
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

        const operationStart = Date.now();

        // Delete from Supabase Storage
        const { data, error } = await developerSupabase.storage
            .from(targetBucket)
            .remove([targetFilename]);

        if (error) {
            console.error('❌ Supabase Storage delete error:', error);

            let errorType = 'DELETE_ERROR';
            let statusCode = 500;

            if (error.message?.includes('not found')) {
                errorType = 'FILE_NOT_FOUND';
                statusCode = 404;
            } else if (error.message?.includes('permission')) {
                errorType = 'DELETE_PERMISSION_DENIED';
                statusCode = 403;
            }

            updateSupabaseMetrics(apiKey, 'supabase', false, errorType).catch(() => { });

            return res.status(statusCode).json({
                success: false,
                error: errorType,
                message: 'Failed to delete file from Supabase Storage',
                details: error.message
            });
        }

        const operationTime = Date.now() - operationStart;
        const totalTime = Date.now() - startTime;

        console.log(`[${requestId}] ✅ File deleted in ${totalTime}ms`);

        // Background metrics update
        updateSupabaseMetrics(apiKey, 'supabase', true, 'DELETE_SUCCESS').catch(() => { });

        // New Usage Tracking
        trackApiUsage({
            userId,
            endpoint: '/api/v1/upload/supabase/delete',
            method: 'DELETE',
            provider: 'supabase',
            operation: 'delete',
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
            endpoint: '/api/v1/upload/supabase/delete',
            method: 'DELETE',
            provider: 'supabase',
            operation: 'delete',
            statusCode: 200,
            success: true,
            requestCount: 1,
            apiKeyId: apiKey,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        // Update upload log (non-blocking)
        supabaseAdmin
            .from('upload_logs')
            .update({ deleted_at: new Date().toISOString() })
            .eq('filename', targetFilename)
            .eq('bucket', targetBucket)
            .then(() => { })
            .catch(err => console.error('Upload log update error:', err));

        // Success response
        res.status(200).json({
            success: true,
            message: 'File deleted from Supabase Storage successfully',
            data: {
                filename: targetFilename,
                bucket: targetBucket,
                provider: 'supabase',
                deletedAt: new Date().toISOString()
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
        console.error(`[${requestId}] 💥 Supabase Storage delete error:`, error);

        if (apiKey) {
            updateSupabaseMetrics(apiKey, 'supabase', false, 'SERVER_ERROR', {
                errorDetails: error.message
            }).catch(() => { });

            // New Usage Tracking
            trackApiUsage({
                userId: req.userId || apiKey,
                endpoint: '/api/v1/upload/supabase/delete',
                method: 'DELETE',
                provider: 'supabase',
                operation: 'delete',
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
            message: 'Internal server error during Supabase Storage delete',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};
