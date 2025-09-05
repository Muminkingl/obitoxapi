-- 🔧 FIX FILE SIZES IN DATABASE
-- Run this in your Supabase SQL Editor to fix existing data

-- ============================================
-- 1. FIX SUPABASE PROVIDER USAGE
-- ============================================

-- Update Supabase provider usage to set proper timestamps
UPDATE provider_usage 
SET 
  last_used_at = COALESCE(last_used_at, updated_at, created_at)
WHERE provider = 'supabase' 
AND last_used_at IS NULL;

-- ============================================
-- 2. FIX UPLOADCARE PROVIDER USAGE
-- ============================================

-- For Uploadcare, we need to estimate file sizes based on upload count
-- Since we can't get exact sizes from the API without file UUIDs,
-- we'll set a reasonable average file size
UPDATE provider_usage 
SET 
  total_file_size = upload_count * 1024 * 1024, -- Assume 1MB average per file
  average_file_size = 1024 * 1024, -- 1MB average
  last_used_at = COALESCE(last_used_at, updated_at, created_at)
WHERE provider = 'uploadcare' 
AND (total_file_size = 0 OR total_file_size IS NULL);

-- ============================================
-- 3. UPDATE API KEYS TOTAL FILE SIZE
-- ============================================

-- Update the main api_keys table with correct total file size
UPDATE api_keys 
SET 
  total_file_size = (
    SELECT COALESCE(SUM(total_file_size), 0)
    FROM provider_usage 
    WHERE api_key_id = api_keys.id
  ),
  updated_at = NOW()
WHERE id = '7b552349-b647-4928-b3fb-2b5f1790a415';

-- ============================================
-- 4. VERIFY THE FIXES
-- ============================================

-- Check the updated data
SELECT 
  provider,
  upload_count,
  total_file_size,
  average_file_size,
  last_used_at,
  updated_at
FROM provider_usage 
WHERE api_key_id = '7b552349-b647-4928-b3fb-2b5f1790a415'
ORDER BY provider;

-- Check main API key data
SELECT 
  total_requests,
  successful_requests,
  failed_requests,
  total_file_size,
  total_files_uploaded,
  last_used_at
FROM api_keys 
WHERE id = '7b552349-b647-4928-b3fb-2b5f1790a415';

-- ============================================
-- 5. ADDITIONAL FIXES FOR SUPABASE
-- ============================================

-- For Supabase, estimate file sizes based on upload count
-- Since Supabase uploads were working, we can estimate reasonable file sizes
UPDATE provider_usage 
SET 
  total_file_size = upload_count * 512 * 1024, -- Assume 512KB average per file
  average_file_size = 512 * 1024 -- 512KB average
WHERE provider = 'supabase' 
AND (total_file_size = 0 OR total_file_size IS NULL);
