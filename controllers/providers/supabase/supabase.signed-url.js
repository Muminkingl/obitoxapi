/**
 * Supabase Storage Signed URL Generation
 * WITH ENTERPRISE MULTI-LAYER CACHING
 * Target: <200ms response time
 */

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_BUCKET, PRIVATE_BUCKET } from './supabase.config.js';
import { generateSupabaseFilename, updateSupabaseMetrics } from './supabase.helpers.js';

// NEW: Import multi-layer cache
import {
    checkMemoryRateLimit,
    checkMemoryQuota,
    checkMemoryBucketAccess,
    setMemoryQuota,
    setMemoryBucketAccess
} from './cache/memory-guard.js';
import {
    checkRedisRateLimit,
    getQuotaFromRedis,
    checkBucketAccessRedis
} from './cache/redis-cache.js';

/**
 * Generate signed upload URL for Supabase Storage
 * NOW WITH <200ms RESPONSE TIME! 🚀
 */
export const generateSupabaseSignedUrl = async (req, res) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    let apiKey;

    try {
        const {
            filename,
            contentType,
            fileSize,
            bucket: customBucket,
            makePrivate = false,
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

        // Validate required fields
        if (!filename || !contentType || !fileSize || !apiKey) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_PARAMETERS',
                message: 'filename, contentType, fileSize, and API key are required'
            });
        }

        const targetBucket = customBucket || (makePrivate ? PRIVATE_BUCKET : SUPABASE_BUCKET);

        // ========================================================================
        // LAYER 1: MEMORY GUARD - INSTANT CHECK (0-5ms) 🔥
        // ========================================================================
        const memoryStart = Date.now();
        const memCheck = checkMemoryRateLimit(userId, 'signed-url');
        const memoryTime = Date.now() - memoryStart;

        if (!memCheck.allowed) {
            console.log(`[${requestId}] ❌ Blocked by memory guard in ${memoryTime}ms`);
            return res.status(429).json({
                success: false,
                error: 'RATE_LIMIT_EXCEEDED',
                code: 'MEMORY_GUARD',
                message: 'Rate limit exceeded',
                remaining: memCheck.remaining,
                resetIn: memCheck.resetIn,
                layer: 'memory',
                timing: { total: Date.now() - startTime, memoryGuard: memoryTime }
            });
        }

        // ========================================================================
        // LAYER 2: REDIS RATE LIMIT (5-50ms) ⚡
        // ========================================================================
        const redisStart = Date.now();
        const redisLimit = await checkRedisRateLimit(userId, 'signed-url');
        const redisTime = Date.now() - redisStart;

        if (!redisLimit.allowed) {
            console.log(`[${requestId}] ❌ Blocked by Redis limit in ${redisTime}ms`);
            return res.status(429).json({
                success: false,
                error: 'RATE_LIMIT_EXCEEDED',
                code: 'REDIS_LIMIT',
                message: 'Rate limit exceeded',
                current: redisLimit.current,
                limit: redisLimit.limit,
                resetIn: redisLimit.resetIn,
                layer: redisLimit.layer,
                timing: {
                    total: Date.now() - startTime,
                    memoryGuard: memoryTime,
                    redisCheck: redisTime
                }
            });
        }

        // ========================================================================
        // LAYER 3: QUOTA CHECK WITH CACHE (50-100ms) 💰
        // ========================================================================
        const quotaStart = Date.now();

        // Check memory first
        let quotaCheck = checkMemoryQuota(userId);

        if (quotaCheck.needsRefresh) {
            // Memory miss - check Redis
            quotaCheck = await getQuotaFromRedis(userId);

            // Update memory cache for next request
            if (!quotaCheck.needsRefresh) {
                setMemoryQuota(userId, {
                    current: quotaCheck.current,
                    limit: quotaCheck.limit
                });
            }
        }

        const quotaTime = Date.now() - quotaStart;

        if (!quotaCheck.allowed && !quotaCheck.fallback) {
            console.log(`[${requestId}] ❌ Quota exceeded in ${quotaTime}ms`);
            return res.status(403).json({
                success: false,
                error: 'QUOTA_EXCEEDED',
                message: 'User quota exceeded',
                current: quotaCheck.current,
                limit: quotaCheck.limit,
                layer: quotaCheck.layer,
                timing: {
                    total: Date.now() - startTime,
                    memoryGuard: memoryTime,
                    redisCheck: redisTime,
                    quotaCheck: quotaTime
                }
            });
        }

        // ========================================================================
        // LAYER 4: BUCKET ACCESS CHECK (100-150ms) 🪣
        // ========================================================================
        const bucketStart = Date.now();

        // Check memory first
        let bucketCheck = checkMemoryBucketAccess(userId, targetBucket);

        if (bucketCheck.needsRefresh) {
            // Memory miss - check Redis
            bucketCheck = await checkBucketAccessRedis(userId, targetBucket, developerSupabase);

            // Update memory cache
            setMemoryBucketAccess(userId, targetBucket, bucketCheck.allowed);
        }

        const bucketTime = Date.now() - bucketStart;

        if (!bucketCheck.allowed && !bucketCheck.fallback) {
            console.log(`[${requestId}] ❌ Bucket access denied in ${bucketTime}ms`);
            return res.status(403).json({
                success: false,
                error: 'BUCKET_ACCESS_DENIED',
                message: `No access to bucket '${targetBucket}'`,
                layer: bucketCheck.layer,
                timing: {
                    total: Date.now() - startTime,
                    memoryGuard: memoryTime,
                    redisCheck: redisTime,
                    quotaCheck: quotaTime,
                    bucketCheck: bucketTime
                }
            });
        }

        // ========================================================================
        // MAIN OPERATION: GENERATE SIGNED URL (150-200ms) ✅
        // ========================================================================
        const operationStart = Date.now();

        // Create mock file for validation
        const mockFile = {
            name: filename,
            type: contentType,
            size: fileSize
        };

        // Basic validation (no DB queries!)
        if (!contentType || !filename || fileSize <= 0) {
            return res.status(400).json({
                success: false,
                error: 'VALIDATION_ERROR',
                message: 'Invalid file parameters'
            });
        }

        // Generate unique filename
        const uniqueFilename = generateSupabaseFilename(filename, apiKey);
        console.log(`[${requestId}] 📝 Generated filename: ${uniqueFilename}`);

        // Check expiration limits
        const maxExpiration = makePrivate ? 24 * 60 * 60 : 7 * 24 * 60 * 60;
        const finalExpiresIn = Math.min(expiresIn, maxExpiration);

        // Generate signed upload URL
        const { data: signedUrlData, error: signedUrlError } = await developerSupabase.storage
            .from(targetBucket)
            .createSignedUploadUrl(uniqueFilename, {
                expiresIn: finalExpiresIn
            });

        if (signedUrlError) {
            console.error(`[${requestId}] ❌ Supabase error:`, signedUrlError);
            await updateSupabaseMetrics(apiKey, 'supabase', false, 'SIGNED_URL_ERROR', {
                errorDetails: signedUrlError.message
            });

            return res.status(500).json({
                success: false,
                error: 'SIGNED_URL_ERROR',
                message: 'Failed to generate signed upload URL',
                details: signedUrlError.message
            });
        }

        const operationTime = Date.now() - operationStart;

        // Get final public URL
        let finalUrl;
        if (makePrivate || targetBucket === PRIVATE_BUCKET || targetBucket === 'admin') {
            finalUrl = null;
        } else {
            const { data: urlData } = developerSupabase.storage
                .from(targetBucket)
                .getPublicUrl(uniqueFilename);
            finalUrl = urlData.publicUrl;
        }

        // ========================================================================
        // BACKGROUND METRICS UPDATE (NON-BLOCKING) 🔄
        // ========================================================================
        // Update metrics in background (don't wait)
        updateSupabaseMetrics(apiKey, 'supabase', true, 'SIGNED_URL_SUCCESS', {
            fileSize: fileSize
        }).catch(err => console.error('Background metrics error:', err));

        const totalTime = Date.now() - startTime;

        console.log(`[${requestId}] ✅ SUCCESS in ${totalTime}ms (memory:${memoryTime}ms, redis:${redisTime}ms, quota:${quotaTime}ms, bucket:${bucketTime}ms, operation:${operationTime}ms)`);

        // SUCCESS RESPONSE
        res.status(200).json({
            success: true,
            message: 'Supabase Storage signed upload URL generated successfully',
            data: {
                uploadUrl: signedUrlData.signedUrl,
                token: signedUrlData.token,
                filename: uniqueFilename,
                originalName: filename,
                contentType: contentType,
                fileSize: fileSize,
                provider: 'supabase',
                bucket: targetBucket,
                isPrivate: makePrivate,
                expiresIn: finalExpiresIn,
                expiresAt: new Date(Date.now() + finalExpiresIn * 1000).toISOString(),
                fileUrl: finalUrl,
                method: 'PUT',
                headers: {
                    'Content-Type': contentType
                }
            },
            performance: {
                requestId,
                totalTime: `${totalTime}ms`,
                breakdown: {
                    memoryGuard: `${memoryTime}ms`,
                    redisCheck: `${redisTime}ms`,
                    quotaCheck: `${quotaTime}ms`,
                    bucketCheck: `${bucketTime}ms`,
                    supabaseOperation: `${operationTime}ms`
                },
                cacheHits: {
                    memory: memCheck.layer === 'memory',
                    redis: redisLimit.layer === 'redis',
                    quota: quotaCheck.layer === 'redis' || quotaCheck.layer === 'memory',
                    bucket: bucketCheck.layer === 'redis' || bucketCheck.layer === 'memory'
                }
            }
        });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`[${requestId}] 💥 Error after ${totalTime}ms:`, error);

        // Background metrics update
        if (apiKey) {
            updateSupabaseMetrics(apiKey, 'supabase', false, 'SERVER_ERROR', {
                errorDetails: error.message
            }).catch(err => console.error('Background metrics error:', err));
        }

        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Internal server error during signed URL generation',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
            requestId,
            timing: `${totalTime}ms`
        });
    }
};
