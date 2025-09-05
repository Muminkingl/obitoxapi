-- 🔍 SUPABASE DATABASE VERIFICATION QUERIES
-- Use these queries in your Supabase SQL Editor to verify API key data

-- ============================================
-- 1. CHECK API KEY METRICS (Main Table)
-- ============================================

-- Get your specific API key data
SELECT 
    id,
    name,
    key_value,
    user_id,
    created_at,
    last_used_at,
    total_requests,
    successful_requests,
    failed_requests,
    total_file_size,
    total_files_uploaded,
    file_type_counts,
    updated_at
FROM api_keys 
WHERE key_value = 'ox_0516ef51ef63677a449cebcf099de3f9f0b36ddb1e5af0fd6a830772c1fe5544';

-- Alternative: Get by API key ID
SELECT 
    id,
    name,
    key_value,
    user_id,
    created_at,
    last_used_at,
    total_requests,
    successful_requests,
    failed_requests,
    total_file_size,
    total_files_uploaded,
    file_type_counts,
    updated_at
FROM api_keys 
WHERE id = '7b552349-b647-4928-b3fb-2b5f1790a415';

-- ============================================
-- 2. CHECK PROVIDER USAGE STATISTICS
-- ============================================

-- Get provider usage for your API key
SELECT 
    provider,
    upload_count,
    total_file_size,
    average_file_size,
    file_type_counts,
    last_used_at,
    created_at,
    updated_at
FROM provider_usage 
WHERE api_key_id = '7b552349-b647-4928-b3fb-2b5f1790a415'
ORDER BY provider;

-- Get all provider usage data
SELECT 
    pu.provider,
    pu.upload_count,
    pu.total_file_size,
    pu.average_file_size,
    pu.file_type_counts,
    pu.last_used_at,
    ak.name as api_key_name
FROM provider_usage pu
JOIN api_keys ak ON pu.api_key_id = ak.id
WHERE ak.id = '7b552349-b647-4928-b3fb-2b5f1790a415'
ORDER BY pu.provider;

-- ============================================
-- 3. CHECK USER PROFILE DATA
-- ============================================

-- Get user profile information
SELECT 
    id,
    first_name,
    last_name,
    avatar_url,
    subscription_plan,
    subscription_start_date,
    trial_ends_at,
    created_at,
    updated_at
FROM profiles 
WHERE id = '0cf5972f-2f32-4b41-afc2-3a5ca5973cd8';

-- ============================================
-- 4. COMPREHENSIVE DATA VERIFICATION
-- ============================================

-- Complete data verification query (matches your API response)
SELECT 
    -- API Key Data
    ak.id as api_key_id,
    ak.name as api_key_name,
    ak.created_at as api_key_created_at,
    ak.last_used_at as api_key_last_used,
    ak.total_requests,
    ak.successful_requests,
    ak.failed_requests,
    ROUND((ak.successful_requests::float / NULLIF(ak.total_requests, 0)) * 100, 2) as success_rate_percent,
    ak.total_file_size,
    ak.total_files_uploaded,
    ak.file_type_counts,
    
    -- User Data
    u.email,
    u.id as user_id,
    
    -- Profile Data
    p.subscription_plan,
    p.first_name,
    p.last_name,
    p.avatar_url,
    p.subscription_start_date,
    p.trial_ends_at,
    
    -- Provider Usage Summary
    COALESCE(
        json_object_agg(
            pu.provider, 
            json_build_object(
                'uploads', pu.upload_count,
                'totalSize', pu.total_file_size
            )
        ) FILTER (WHERE pu.provider IS NOT NULL),
        '{}'::json
    ) as provider_usage_summary

FROM api_keys ak
LEFT JOIN auth.users u ON ak.user_id = u.id
LEFT JOIN profiles p ON ak.user_id = p.id
LEFT JOIN provider_usage pu ON ak.id = pu.api_key_id
WHERE ak.id = '7b552349-b647-4928-b3fb-2b5f1790a415'
GROUP BY ak.id, ak.name, ak.created_at, ak.last_used_at, ak.total_requests, 
         ak.successful_requests, ak.failed_requests, ak.total_file_size, 
         ak.total_files_uploaded, ak.file_type_counts, u.email, u.id, 
         p.subscription_plan, p.first_name, p.last_name, p.avatar_url, 
         p.subscription_start_date, p.trial_ends_at;

-- ============================================
-- 5. REAL-TIME METRICS VERIFICATION
-- ============================================

-- Check if metrics are being updated in real-time
SELECT 
    'API Key Metrics' as table_name,
    total_requests,
    successful_requests,
    failed_requests,
    last_used_at,
    updated_at
FROM api_keys 
WHERE id = '7b552349-b647-4928-b3fb-2b5f1790a415'

UNION ALL

SELECT 
    'Provider Usage' as table_name,
    upload_count as total_requests,
    upload_count as successful_requests,
    0 as failed_requests,
    last_used_at,
    updated_at
FROM provider_usage 
WHERE api_key_id = '7b552349-b647-4928-b3fb-2b5f1790a415'
ORDER BY table_name, updated_at DESC;

-- ============================================
-- 6. FILE TYPE BREAKDOWN
-- ============================================

-- Get detailed file type statistics
SELECT 
    provider,
    file_type_counts,
    upload_count,
    total_file_size
FROM provider_usage 
WHERE api_key_id = '7b552349-b647-4928-b3fb-2b5f1790a415'
AND file_type_counts IS NOT NULL;

-- ============================================
-- 7. RECENT ACTIVITY CHECK
-- ============================================

-- Check recent activity (last 24 hours)
SELECT 
    'Recent Activity' as check_type,
    COUNT(*) as total_requests,
    MAX(last_used_at) as last_activity,
    MIN(last_used_at) as first_activity_today
FROM api_keys 
WHERE id = '7b552349-b647-4928-b3fb-2b5f1790a415'
AND last_used_at >= NOW() - INTERVAL '24 hours';

-- ============================================
-- 8. DATA CONSISTENCY CHECK
-- ============================================

-- Verify data consistency between tables
SELECT 
    'Data Consistency Check' as check_name,
    ak.total_requests as api_key_total,
    COALESCE(SUM(pu.upload_count), 0) as provider_total,
    CASE 
        WHEN ak.total_requests = COALESCE(SUM(pu.upload_count), 0) 
        THEN '✅ CONSISTENT' 
        ELSE '❌ INCONSISTENT' 
    END as status
FROM api_keys ak
LEFT JOIN provider_usage pu ON ak.id = pu.api_key_id
WHERE ak.id = '7b552349-b647-4928-b3fb-2b5f1790a415'
GROUP BY ak.total_requests;

-- ============================================
-- 9. QUICK HEALTH CHECK
-- ============================================

-- Quick health check for your API key
SELECT 
    'Health Check' as check_type,
    CASE 
        WHEN last_used_at > NOW() - INTERVAL '1 hour' THEN '🟢 ACTIVE'
        WHEN last_used_at > NOW() - INTERVAL '24 hours' THEN '🟡 RECENT'
        ELSE '🔴 INACTIVE'
    END as status,
    total_requests,
    successful_requests,
    failed_requests,
    last_used_at
FROM api_keys 
WHERE id = '7b552349-b647-4928-b3fb-2b5f1790a415';

-- ============================================
-- 10. FOR FRONTEND ANALYTICS QUERY
-- ============================================

-- This query gives you everything you need for your frontend analytics
SELECT 
    -- API Key Stats
    ak.id,
    ak.name,
    ak.total_requests,
    ak.successful_requests,
    ak.failed_requests,
    ROUND((ak.successful_requests::float / NULLIF(ak.total_requests, 0)) * 100, 2) as success_rate,
    ak.total_file_size,
    ak.total_files_uploaded,
    ak.file_type_counts,
    ak.last_used_at,
    
    -- User Info
    u.email,
    
    -- Profile Info
    p.subscription_plan,
    p.first_name,
    p.last_name,
    p.avatar_url,
    
    -- Provider Breakdown
    pu.provider,
    pu.upload_count as provider_uploads,
    pu.total_file_size as provider_total_size,
    pu.file_type_counts as provider_file_types
    
FROM api_keys ak
LEFT JOIN auth.users u ON ak.user_id = u.id
LEFT JOIN profiles p ON ak.user_id = p.id
LEFT JOIN provider_usage pu ON ak.id = pu.api_key_id
WHERE ak.id = '7b552349-b647-4928-b3fb-2b5f1790a415'
ORDER BY pu.provider;
