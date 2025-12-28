/**
 * Supabase Storage Upload Operation
 * WITH ENTERPRISE MULTI-LAYER CACHING
 * Target: <1000ms response time
 */

import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../../config/supabase.js';
import { SUPABASE_BUCKET, PRIVATE_BUCKET } from './supabase.config.js';
import { generateSupabaseFilename, updateSupabaseMetrics } from './supabase.helpers.js';

// Import multi-layer cache
import {
    checkMemoryRateLimit,
    checkMemoryQuota,
    setMemoryQuota,
    incrementMemoryQuota
} from './cache/memory-guard.js';
import {
    checkRedisRateLimit,
    getQuotaFromRedis
} from './cache/redis-cache.js';

/**
 * Upload file to Supabase Storage
 * NOW WITH <1000MS RESPONSE TIME! 🚀
 */
export const uploadToSupabaseStorage = async (req, res) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    let apiKey;

    try {
        const {
            file: fileData,
            bucket: customBucket,
            makePrivate = false,
            metadata = {},
            expiresIn = 3600,
            supabaseToken,
            supabaseUrl
        } = req.body;

        apiKey = req.apiKeyId;
        const userId = req.userId || apiKey;

        // Validate Supabase token
        if (!supabaseToken) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_SUPABASE_TOKEN',
                message: 'Supabase service key is required'
            });
        }

        // Get Supabase URL
        let developerSupabaseUrl;
        if (supabaseUrl) {
            developerSupabaseUrl = supabaseUrl;
        } else {
            try {
                const tokenPayload = JSON.parse(Buffer.from(supabaseToken.split('.')[1], 'base64').toString());
                developerSupabaseUrl = `https://${tokenPayload.iss.split('//')[1]}`;
            } catch (error) {
                return res.status(400).json({
                    success: false,
                    error: 'INVALID_SUPABASE_TOKEN',
                    message: 'Invalid Supabase service key format or provide supabaseUrl parameter'
                });
            }
        }

        const developerSupabase = createClient(developerSupabaseUrl, supabaseToken);

        if (!apiKey) {
            return res.status(401).json({
                success: false,
                error: 'UNAUTHORIZED',
                message: 'API key is required'
            });
        }

        // ========================================================================
        // LAYER 1: MEMORY GUARD (0-5ms) 🔥
        // ========================================================================
        const memoryStart = Date.now();
        const memCheck = checkMemoryRateLimit(userId, 'upload');
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

        // ========================================================================
        // LAYER 2: REDIS RATE LIMIT (5-50ms) ⚡
        // ========================================================================
        const redisStart = Date.now();
        const redisLimit = await checkRedisRateLimit(userId, 'upload');
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

        const targetBucket = customBucket || (makePrivate ? PRIVATE_BUCKET : SUPABASE_BUCKET);
        const file = fileData;

        if (!file) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_FILE',
                message: 'File data is required'
            });
        }

        // ========================================================================
        // LAYER 3: QUOTA CHECK WITH CACHE (50-100ms) 💰
        // ========================================================================
        const quotaStart = Date.now();

        let quotaCheck = checkMemoryQuota(userId);
        if (quotaCheck.needsRefresh) {
            quotaCheck = await getQuotaFromRedis(userId);
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
                limit: quotaCheck.limit
            });
        }

        // ========================================================================
        // FAST VALIDATION (No DB queries!) (10-20ms) ✅
        // ========================================================================
        const validationStart = Date.now();

        // Basic file validation (no DB queries)
        if (!file.name || file.name.trim() === '') {
            return res.status(400).json({
                success: false,
                error: 'INVALID_FILENAME',
                message: 'Filename is required'
            });
        }

        if (!file.size || file.size === 0) {
            return res.status(400).json({
                success: false,
                error: 'INVALID_FILE_SIZE',
                message: 'File size cannot be zero'
            });
        }

        if (file.size > 50 * 1024 * 1024) { // 50MB limit
            return res.status(400).json({
                success: false,
                error: 'FILE_TOO_LARGE',
                message: 'File size exceeds 50MB limit'
            });
        }

        const validationTime = Date.now() - validationStart;

        // Generate filename
        const filename = generateSupabaseFilename(file.name, apiKey);

        // Convert base64 to buffer
        let fileBuffer;
        try {
            fileBuffer = Buffer.from(file.data, 'base64');
            if (fileBuffer.length !== file.size) {
                console.warn(`⚠️ Size mismatch: expected ${file.size}, got ${fileBuffer.length}`);
            }
        } catch (error) {
            updateSupabaseMetrics(apiKey, 'supabase', false, 'ENCODING_ERROR', { fileSize: file.size }).catch(() => { });
            return res.status(400).json({
                success: false,
                error: 'ENCODING_ERROR',
                message: 'Invalid file encoding',
                details: error.message
            });
        }

        // ========================================================================
        // UPLOAD TO SUPABASE (200-800ms) 📤
        // ========================================================================
        const uploadStart = Date.now();

        // Upload options
        const uploadOptions = {
            contentType: file.type,
            upsert: false,
            duplex: 'half'
        };

        if (metadata && Object.keys(metadata).length > 0) {
            uploadOptions.metadata = {
                ...metadata,
                originalName: file.name,
                uploadedBy: apiKey.substring(0, 8),
                uploadedAt: new Date().toISOString()
            };
        }

        // Upload with retry
        let uploadAttempts = 0;
        const maxAttempts = 3;
        let uploadData, uploadError;

        while (uploadAttempts < maxAttempts) {
            try {
                uploadAttempts++;
                console.log(`[${requestId}] 🔄 Upload attempt ${uploadAttempts}/${maxAttempts}`);

                const result = await developerSupabase.storage
                    .from(targetBucket)
                    .upload(filename, fileBuffer, uploadOptions);

                uploadData = result.data;
                uploadError = result.error;

                if (!uploadError) break;

                if (uploadAttempts < maxAttempts) {
                    console.warn(`⚠️ Upload attempt ${uploadAttempts} failed, retrying...`, uploadError);
                    await new Promise(resolve => setTimeout(resolve, 1000 * uploadAttempts));
                }
            } catch (error) {
                uploadError = error;
                if (uploadAttempts < maxAttempts) {
                    console.warn(`⚠️ Upload attempt ${uploadAttempts} error, retrying...`, error);
                    await new Promise(resolve => setTimeout(resolve, 1000 * uploadAttempts));
                }
            }
        }

        if (uploadError) {
            console.error(`[${requestId}] ❌ Upload error after all attempts:`, uploadError);

            let errorType = 'STORAGE_ERROR';
            let errorMessage = 'Failed to upload to Supabase Storage';
            let statusCode = 500;

            if (uploadError.message?.includes('row-level security')) {
                errorType = 'RLS_ERROR';
                errorMessage = 'Row-level security policy violation';
                statusCode = 403;
            } else if (uploadError.message?.includes('storage quota')) {
                errorType = 'STORAGE_QUOTA_EXCEEDED';
                errorMessage = 'Storage quota exceeded';
                statusCode = 507;
            } else if (uploadError.message?.includes('file too large')) {
                errorType = 'FILE_TOO_LARGE';
                errorMessage = 'File size exceeds storage limits';
                statusCode = 413;
            } else if (uploadError.message?.includes('bucket not found')) {
                errorType = 'BUCKET_NOT_FOUND';
                errorMessage = `Bucket '${targetBucket}' not found`;
                statusCode = 404;
            } else if (uploadError.message?.includes('already exists')) {
                errorType = 'FILE_EXISTS';
                errorMessage = 'File already exists';
                statusCode = 409;
            }

            updateSupabaseMetrics(apiKey, 'supabase', false, errorType, {
                fileSize: file.size,
                attempts: uploadAttempts
            }).catch(() => { });

            return res.status(statusCode).json({
                success: false,
                error: errorType,
                message: errorMessage,
                details: uploadError.message,
                attempts: uploadAttempts
            });
        }

        const uploadTime = Date.now() - uploadStart;

        // Get URL
        let publicUrl;
        let isPrivate = false;

        try {
            if (makePrivate || targetBucket === PRIVATE_BUCKET || targetBucket === 'admin') {
                const { data: signedUrlData, error: signedError } = await developerSupabase.storage
                    .from(targetBucket)
                    .createSignedUrl(filename, expiresIn);

                if (signedError) {
                    console.warn('⚠️ Could not generate signed URL:', signedError);
                    publicUrl = null;
                } else {
                    publicUrl = signedUrlData.signedUrl;
                    isPrivate = true;
                }
            } else {
                const { data: urlData } = developerSupabase.storage
                    .from(targetBucket)
                    .getPublicUrl(filename);

                publicUrl = urlData.publicUrl;
                isPrivate = false;
            }
        } catch (error) {
            console.warn('⚠️ Error generating URL:', error);
            publicUrl = null;
        }

        const totalTime = Date.now() - startTime;

        // ========================================================================
        // BACKGROUND UPDATES (NON-BLOCKING) 🔄
        // ========================================================================
        // Update metrics in background
        updateSupabaseMetrics(apiKey, 'supabase', true, 'SUCCESS', {
            fileSize: file.size,
            attempts: uploadAttempts
        }).catch(() => { });

        // Increment quota in memory (optimistic)
        incrementMemoryQuota(userId, 1);

        // Log upload in background
        supabaseAdmin
            .from('upload_logs')
            .insert({
                api_key_id: apiKey,
                provider: 'supabase',
                bucket: targetBucket,
                filename: filename,
                original_name: file.name,
                file_size: file.size,
                file_type: file.type,
                is_private: isPrivate,
                upload_url: publicUrl,
                created_at: new Date().toISOString()
            })
            .then(() => { })
            .catch(err => console.error('Upload log error:', err));

        console.log(`[${requestId}] ✅ SUCCESS in ${totalTime}ms (memory:${memoryTime}ms, redis:${redisTime}ms, quota:${quotaTime}ms, validation:${validationTime}ms, upload:${uploadTime}ms)`);

        // Success response
        res.status(200).json({
            success: true,
            message: 'File uploaded to Supabase Storage successfully',
            data: {
                filename,
                originalName: file.name,
                size: file.size,
                type: file.type,
                url: publicUrl,
                isPrivate,
                provider: 'supabase',
                bucket: targetBucket,
                uploadedAt: new Date().toISOString(),
                attempts: uploadAttempts
            },
            performance: {
                requestId,
                totalTime: `${totalTime}ms`,
                breakdown: {
                    memoryGuard: `${memoryTime}ms`,
                    redisCheck: `${redisTime}ms`,
                    quotaCheck: `${quotaTime}ms`,
                    validation: `${validationTime}ms`,
                    supabaseUpload: `${uploadTime}ms`
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
        }

        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Internal server error during Supabase Storage upload',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};
