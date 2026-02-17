/**
 * Supabase Upload Completion Tracker
 * Called after client-side direct upload to record metrics
 */

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_BUCKET } from './supabase.config.js';
import { updateSupabaseMetrics } from './supabase.helpers.js';
import { checkMemoryRateLimit } from './cache/memory-guard.js';
import { checkUserQuota } from '../shared/analytics.new.js';

/**
 * Complete Supabase upload (record metrics after client-side upload)
 */
export const completeSupabaseUpload = async (req, res) => {
    let apiKey;

    try {
        const {
            filename,
            originalFilename,
            fileSize,
            fileUrl,
            contentType,
            bucket = SUPABASE_BUCKET,
            supabaseToken,
            supabaseUrl
        } = req.body;

        apiKey = req.apiKeyId;
        const userId = req.userId || apiKey;

        // Validate developer's Supabase credentials
        if (!supabaseToken) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_SUPABASE_TOKEN',
                message: 'Supabase service key is required. Please provide your Supabase service role key.'
            });
        }

        if (!supabaseUrl) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_SUPABASE_URL',
                message: 'Supabase project URL is required. Please provide your Supabase project URL.'
            });
        }

        // Create Supabase client using developer's credentials
        const developerSupabase = createClient(supabaseUrl, supabaseToken);

        if (!apiKey) {
            return res.status(401).json({
                success: false,
                error: 'UNAUTHORIZED',
                message: 'API key is required'
            });
        }

        // LAYER 1: Memory guard
        const memCheck = checkMemoryRateLimit(userId, 'complete');
        if (!memCheck.allowed) {
            return res.status(429).json({
                success: false,
                error: 'RATE_LIMIT_EXCEEDED',
                message: 'Rate limit exceeded',
                layer: 'memory'
            });
        }

        // Quota check (OPT-2: use MW2 data if available, else fallback)
        const quotaCheck = req.quotaChecked || await checkUserQuota(userId);
        if (!quotaCheck.allowed) {
            return res.status(403).json({
                success: false,
                error: 'QUOTA_EXCEEDED',
                message: 'Monthly quota exceeded',
                limit: quotaCheck.limit,
                used: quotaCheck.current || quotaCheck.used
            });
        }

        // Validate required fields
        if (!filename || !fileSize || !fileUrl) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_PARAMETERS',
                message: 'filename, fileSize, and fileUrl are required'
            });
        }

        // Verify the file exists in Supabase storage
        const { data: fileExists, error: existsError } = await developerSupabase.storage
            .from(bucket)
            .download(filename);

        if (existsError || !fileExists) {
            await updateSupabaseMetrics(apiKey, 'supabase', false, 'FILE_NOT_FOUND', { fileSize });
            return res.status(404).json({
                success: false,
                error: 'FILE_NOT_FOUND',
                message: 'File not found in Supabase storage',
                details: existsError?.message
            });
        }

        // Get actual file size from Supabase (more accurate than client-provided size)
        const { data: fileList, error: listError } = await developerSupabase.storage
            .from(bucket)
            .list('', { search: filename });

        const storageFile = fileList?.find(f => f.name === filename);
        const actualFileSize = storageFile?.metadata?.size || fileSize;


        // Update metrics with real file size
        await updateSupabaseMetrics(apiKey, 'supabase', true, 'UPLOAD_COMPLETED', {
            fileSize: actualFileSize
        });

        // Note: File upload logging is handled in updateSupabaseMetrics

        res.status(200).json({
            success: true,
            message: 'Supabase upload completion recorded successfully',
            data: {
                filename: filename,
                originalFilename: originalFilename || filename,
                fileSize: actualFileSize,
                fileUrl: fileUrl,
                bucket: bucket,
                provider: 'supabase',
                completedAt: new Date().toISOString(),
                metricsUpdated: true
            }
        });

    } catch (error) {
        console.error('💥 Supabase upload completion error:', error);

        if (apiKey) {
            await updateSupabaseMetrics(apiKey, 'supabase', false, 'COMPLETION_ERROR', {
                errorDetails: error.message
            });
        }

        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Internal server error during upload completion',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};
