/**
 * Supabase Bucket List
 * Get all available storage buckets
 */

import { createClient } from '@supabase/supabase-js';
import { updateSupabaseMetrics } from './supabase.helpers.js';

/**
 * List available buckets for Supabase Storage
 */
export const listSupabaseBuckets = async (req, res) => {
    let apiKey;

    try {

        const { supabaseToken, supabaseUrl } = req.body;
        apiKey = req.apiKeyId;

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

        // List all buckets
        const { data: buckets, error: bucketsError } = await developerSupabase.storage.listBuckets();

        if (bucketsError) {
            console.error('❌ Failed to list buckets:', bucketsError);
            return res.status(500).json({
                success: false,
                error: 'BUCKETS_LIST_ERROR',
                message: 'Failed to list buckets',
                details: bucketsError.message
            });
        }

        // Get additional info for each bucket
        const bucketInfos = await Promise.all(
            buckets.map(async (bucket) => {
                try {
                    // Get file count and total size
                    const { data: files, error: filesError } = await developerSupabase.storage
                        .from(bucket.name)
                        .list('', { limit: 1000 }); // Get up to 1000 files for stats

                    let fileCount = 0;
                    let totalSize = 0;

                    if (!filesError && files) {
                        fileCount = files.length;
                        // Calculate total size (approximate)
                        totalSize = files.reduce((sum, file) => sum + (file.metadata?.size || 0), 0);
                    }

                    return {
                        name: bucket.name,
                        public: bucket.public,
                        fileCount,
                        totalSize,
                        createdAt: bucket.created_at
                    };
                } catch (error) {
                    console.warn(`⚠️ Could not get stats for bucket ${bucket.name}:`, error.message);
                    return {
                        name: bucket.name,
                        public: bucket.public,
                        fileCount: 0,
                        totalSize: 0,
                        createdAt: bucket.created_at
                    };
                }
            })
        );


        // Update metrics
        await updateSupabaseMetrics(apiKey, 'supabase', true, null, {
            operation: 'list_buckets',
            bucketCount: bucketInfos.length
        });

        res.json({
            success: true,
            data: bucketInfos,
            message: `Found ${bucketInfos.length} buckets`
        });

    } catch (error) {
        console.error('❌ Error listing buckets:', error);

        await updateSupabaseMetrics(apiKey, 'supabase', false, 'GENERAL_ERROR', {
            operation: 'list_buckets',
            error: error.message
        });

        res.status(500).json({
            success: false,
            error: 'GENERAL_ERROR',
            message: 'Failed to list buckets',
            details: error.message
        });
    }
};
