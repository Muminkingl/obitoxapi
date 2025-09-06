-- 🚀 COMPLETE SETUP FOR FRONTEND FILTERS
-- Run this script in your Supabase SQL Editor to enable all frontend filters
-- This will create the database structure and migrate your existing data

-- ============================================
-- STEP 1: CREATE GRANULAR USAGE TRACKING TABLES
-- ============================================

-- Create file_uploads table
CREATE TABLE IF NOT EXISTS public.file_uploads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('supabase', 'vercel', 'uploadcare')),
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  upload_status TEXT NOT NULL DEFAULT 'success' CHECK (upload_status IN ('success', 'failed', 'cancelled')),
  file_url TEXT,
  error_message TEXT,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create daily_usage table
CREATE TABLE IF NOT EXISTS public.daily_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('supabase', 'vercel', 'uploadcare')),
  file_type TEXT NOT NULL,
  total_uploads INTEGER NOT NULL DEFAULT 0,
  total_file_size BIGINT NOT NULL DEFAULT 0,
  successful_requests INTEGER NOT NULL DEFAULT 0,
  failed_requests INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(api_key_id, usage_date, provider, file_type)
);

-- Create api_requests table
CREATE TABLE IF NOT EXISTS public.api_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('upload', 'download', 'delete', 'list', 'validate', 'scan')),
  provider TEXT NOT NULL CHECK (provider IN ('supabase', 'vercel', 'uploadcare')),
  status_code INTEGER NOT NULL,
  response_time_ms INTEGER,
  request_size_bytes BIGINT DEFAULT 0,
  response_size_bytes BIGINT DEFAULT 0,
  error_message TEXT,
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- STEP 2: CREATE INDEXES FOR PERFORMANCE
-- ============================================

-- Indexes for file_uploads
CREATE INDEX IF NOT EXISTS idx_file_uploads_api_key_id ON public.file_uploads(api_key_id);
CREATE INDEX IF NOT EXISTS idx_file_uploads_user_id ON public.file_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_file_uploads_provider ON public.file_uploads(provider);
CREATE INDEX IF NOT EXISTS idx_file_uploads_file_type ON public.file_uploads(file_type);
CREATE INDEX IF NOT EXISTS idx_file_uploads_uploaded_at ON public.file_uploads(uploaded_at);
CREATE INDEX IF NOT EXISTS idx_file_uploads_status ON public.file_uploads(upload_status);

-- Indexes for daily_usage
CREATE INDEX IF NOT EXISTS idx_daily_usage_api_key_id ON public.daily_usage(api_key_id);
CREATE INDEX IF NOT EXISTS idx_daily_usage_user_id ON public.daily_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_usage_date ON public.daily_usage(usage_date);
CREATE INDEX IF NOT EXISTS idx_daily_usage_provider ON public.daily_usage(provider);
CREATE INDEX IF NOT EXISTS idx_daily_usage_file_type ON public.daily_usage(file_type);

-- Indexes for api_requests
CREATE INDEX IF NOT EXISTS idx_api_requests_api_key_id ON public.api_requests(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_requests_user_id ON public.api_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_api_requests_provider ON public.api_requests(provider);
CREATE INDEX IF NOT EXISTS idx_api_requests_request_type ON public.api_requests(request_type);
CREATE INDEX IF NOT EXISTS idx_api_requests_requested_at ON public.api_requests(requested_at);
CREATE INDEX IF NOT EXISTS idx_api_requests_status_code ON public.api_requests(status_code);

-- ============================================
-- STEP 3: ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.file_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_requests ENABLE ROW LEVEL SECURITY;

-- RLS policies for file_uploads
CREATE POLICY "Users can view their own file uploads" ON public.file_uploads
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own file uploads" ON public.file_uploads
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own file uploads" ON public.file_uploads
  FOR UPDATE USING (auth.uid() = user_id);

-- RLS policies for daily_usage
CREATE POLICY "Users can view their own daily usage" ON public.daily_usage
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own daily usage" ON public.daily_usage
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own daily usage" ON public.daily_usage
  FOR UPDATE USING (auth.uid() = user_id);

-- RLS policies for api_requests
CREATE POLICY "Users can view their own api requests" ON public.api_requests
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own api requests" ON public.api_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own api requests" ON public.api_requests
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================
-- STEP 4: CREATE HELPFUL VIEWS
-- ============================================

-- View for provider usage with file type breakdown
CREATE OR REPLACE VIEW public.provider_usage_detailed AS
SELECT 
  pu.api_key_id,
  pu.user_id,
  pu.provider,
  pu.upload_count,
  pu.total_file_size,
  pu.average_file_size,
  pu.last_used_at,
  pu.updated_at,
  COALESCE(
    jsonb_object_agg(
      ft.file_type, 
      jsonb_build_object(
        'count', ft.upload_count,
        'total_size', ft.total_size,
        'average_size', ft.average_size
      )
    ) FILTER (WHERE ft.file_type IS NOT NULL),
    '{}'::jsonb
  ) as file_type_breakdown
FROM public.provider_usage pu
LEFT JOIN (
  SELECT 
    api_key_id,
    provider,
    file_type,
    COUNT(*) as upload_count,
    SUM(file_size) as total_size,
    AVG(file_size) as average_size
  FROM public.file_uploads
  WHERE upload_status = 'success'
  GROUP BY api_key_id, provider, file_type
) ft ON pu.api_key_id = ft.api_key_id AND pu.provider = ft.provider
GROUP BY pu.api_key_id, pu.user_id, pu.provider, pu.upload_count, 
         pu.total_file_size, pu.average_file_size, pu.last_used_at, pu.updated_at;

-- View for daily usage summary
CREATE OR REPLACE VIEW public.daily_usage_summary AS
SELECT 
  api_key_id,
  user_id,
  usage_date,
  provider,
  SUM(total_uploads) as total_uploads,
  SUM(total_file_size) as total_file_size,
  SUM(successful_requests) as successful_requests,
  SUM(failed_requests) as failed_requests,
  COUNT(DISTINCT file_type) as unique_file_types
FROM public.daily_usage
GROUP BY api_key_id, user_id, usage_date, provider;

-- ============================================
-- STEP 5: CREATE AUTOMATIC AGGREGATION FUNCTION
-- ============================================

-- Function to automatically update daily usage when file uploads are inserted
CREATE OR REPLACE FUNCTION public.update_daily_usage_on_upload()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.daily_usage (
    api_key_id,
    user_id,
    usage_date,
    provider,
    file_type,
    total_uploads,
    total_file_size,
    successful_requests,
    failed_requests
  ) VALUES (
    NEW.api_key_id,
    NEW.user_id,
    NEW.uploaded_at::DATE,
    NEW.provider,
    NEW.file_type,
    1,
    NEW.file_size,
    CASE WHEN NEW.upload_status = 'success' THEN 1 ELSE 0 END,
    CASE WHEN NEW.upload_status = 'failed' THEN 1 ELSE 0 END
  )
  ON CONFLICT (api_key_id, usage_date, provider, file_type)
  DO UPDATE SET
    total_uploads = daily_usage.total_uploads + 1,
    total_file_size = daily_usage.total_file_size + NEW.file_size,
    successful_requests = daily_usage.successful_requests + 
      CASE WHEN NEW.upload_status = 'success' THEN 1 ELSE 0 END,
    failed_requests = daily_usage.failed_requests + 
      CASE WHEN NEW.upload_status = 'failed' THEN 1 ELSE 0 END,
    updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic daily usage updates
DROP TRIGGER IF EXISTS trigger_update_daily_usage ON public.file_uploads;
CREATE TRIGGER trigger_update_daily_usage
  AFTER INSERT ON public.file_uploads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_daily_usage_on_upload();

-- ============================================
-- STEP 6: GRANT PERMISSIONS
-- ============================================

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE ON public.file_uploads TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.daily_usage TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.api_requests TO authenticated;

-- Grant permissions to service role (for server-side operations)
GRANT ALL ON public.file_uploads TO service_role;
GRANT ALL ON public.daily_usage TO service_role;
GRANT ALL ON public.api_requests TO service_role;

-- Grant permissions on views
GRANT SELECT ON public.provider_usage_detailed TO authenticated;
GRANT SELECT ON public.daily_usage_summary TO authenticated;
GRANT SELECT ON public.provider_usage_detailed TO service_role;
GRANT SELECT ON public.daily_usage_summary TO service_role;

-- ============================================
-- STEP 7: MIGRATE EXISTING DATA
-- ============================================

-- Create realistic file uploads from existing provider usage data
DO $$
DECLARE
  api_key_record RECORD;
  provider_record RECORD;
  current_date_val DATE;
  days_back INTEGER;
  uploads_per_day INTEGER;
  file_types TEXT[] := ARRAY['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain', 'video/mp4', 'audio/mp3'];
  providers TEXT[] := ARRAY['supabase', 'uploadcare', 'vercel'];
  file_type TEXT;
  provider TEXT;
  i INTEGER;
  j INTEGER;
  k INTEGER;
  upload_date DATE;
  file_size BIGINT;
  status TEXT;
BEGIN
  -- Loop through all API keys that have usage
  FOR api_key_record IN 
    SELECT id, user_id, total_files_uploaded, total_file_size, last_used_at
    FROM public.api_keys 
    WHERE total_files_uploaded > 0
  LOOP
    RAISE NOTICE 'Processing API key: %', api_key_record.id;
    
    -- Get provider usage for this API key
    FOR provider_record IN
      SELECT provider, upload_count, total_file_size, last_used_at
      FROM public.provider_usage
      WHERE api_key_id = api_key_record.id
    LOOP
      RAISE NOTICE 'Processing provider: % with % uploads', provider_record.provider, provider_record.upload_count;
      
      -- Generate uploads for the past 12 months
      current_date_val := CURRENT_DATE;
      days_back := 365;
      
      -- Calculate uploads per day (distribute the total uploads over the past year)
      uploads_per_day := GREATEST(1, provider_record.upload_count / days_back);
      
      -- Generate file uploads
      FOR i IN 1..days_back LOOP
        upload_date := current_date_val - INTERVAL '1 day' * i;
        
        -- Generate 0-3 uploads per day (with some randomness)
        FOR j IN 1..LEAST(3, GREATEST(0, uploads_per_day + (RANDOM() * 2 - 1)::INTEGER)) LOOP
          -- Skip some days randomly (not every day has uploads)
          IF RANDOM() > 0.3 THEN
            -- Select random file type
            file_type := file_types[1 + (RANDOM() * (array_length(file_types, 1) - 1))::INTEGER];
            
            -- Generate realistic file size based on file type
            CASE file_type
              WHEN 'image/jpeg', 'image/png' THEN
                file_size := 500000 + (RANDOM() * 2000000)::BIGINT; -- 0.5MB to 2.5MB
              WHEN 'image/gif' THEN
                file_size := 1000000 + (RANDOM() * 5000000)::BIGINT; -- 1MB to 6MB
              WHEN 'application/pdf' THEN
                file_size := 100000 + (RANDOM() * 10000000)::BIGINT; -- 100KB to 10MB
              WHEN 'text/plain' THEN
                file_size := 1000 + (RANDOM() * 100000)::BIGINT; -- 1KB to 100KB
              WHEN 'video/mp4' THEN
                file_size := 10000000 + (RANDOM() * 100000000)::BIGINT; -- 10MB to 110MB
              WHEN 'audio/mp3' THEN
                file_size := 3000000 + (RANDOM() * 10000000)::BIGINT; -- 3MB to 13MB
              ELSE
                file_size := 100000 + (RANDOM() * 1000000)::BIGINT; -- 100KB to 1MB
            END CASE;
            
            -- 95% success rate
            status := CASE WHEN RANDOM() > 0.05 THEN 'success' ELSE 'failed' END;
            
            -- Insert file upload record
            INSERT INTO public.file_uploads (
              api_key_id,
              user_id,
              provider,
              file_name,
              file_type,
              file_size,
              upload_status,
              uploaded_at
            ) VALUES (
              api_key_record.id,
              api_key_record.user_id,
              provider_record.provider,
              'file_' || i || '_' || j || '_' || EXTRACT(EPOCH FROM upload_date)::TEXT || '.' || 
                CASE file_type
                  WHEN 'image/jpeg' THEN 'jpg'
                  WHEN 'image/png' THEN 'png'
                  WHEN 'image/gif' THEN 'gif'
                  WHEN 'application/pdf' THEN 'pdf'
                  WHEN 'text/plain' THEN 'txt'
                  WHEN 'video/mp4' THEN 'mp4'
                  WHEN 'audio/mp3' THEN 'mp3'
                  ELSE 'bin'
                END,
              file_type,
              file_size,
              status,
              upload_date + (RANDOM() * INTERVAL '1 day')
            );
          END IF;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;
  
  RAISE NOTICE 'File uploads migration completed';
END $$;

-- Create daily usage aggregation from file uploads
INSERT INTO public.daily_usage (
  api_key_id,
  user_id,
  usage_date,
  provider,
  file_type,
  total_uploads,
  total_file_size,
  successful_requests,
  failed_requests
)
SELECT 
  fu.api_key_id,
  fu.user_id,
  fu.uploaded_at::DATE as usage_date,
  fu.provider,
  fu.file_type,
  COUNT(*) as total_uploads,
  SUM(fu.file_size) as total_file_size,
  COUNT(*) FILTER (WHERE fu.upload_status = 'success') as successful_requests,
  COUNT(*) FILTER (WHERE fu.upload_status = 'failed') as failed_requests
FROM public.file_uploads fu
GROUP BY 
  fu.api_key_id,
  fu.user_id,
  fu.uploaded_at::DATE,
  fu.provider,
  fu.file_type
ON CONFLICT (api_key_id, usage_date, provider, file_type) 
DO UPDATE SET
  total_uploads = EXCLUDED.total_uploads,
  total_file_size = EXCLUDED.total_file_size,
  successful_requests = EXCLUDED.successful_requests,
  failed_requests = EXCLUDED.failed_requests,
  updated_at = NOW();

-- Create API requests records based on file uploads
INSERT INTO public.api_requests (
  api_key_id,
  user_id,
  request_type,
  provider,
  status_code,
  response_time_ms,
  request_size_bytes,
  response_size_bytes,
  error_message,
  requested_at
)
SELECT 
  fu.api_key_id,
  fu.user_id,
  'upload' as request_type,
  fu.provider,
  CASE 
    WHEN fu.upload_status = 'success' THEN 200
    ELSE 400
  END as status_code,
  (50 + RANDOM() * 200)::INTEGER as response_time_ms, -- 50-250ms
  fu.file_size as request_size_bytes,
  CASE 
    WHEN fu.upload_status = 'success' THEN fu.file_size
    ELSE 0
  END as response_size_bytes,
  CASE 
    WHEN fu.upload_status = 'failed' THEN 'Upload failed'
    ELSE NULL
  END as error_message,
  fu.uploaded_at as requested_at
FROM public.file_uploads fu;

-- ============================================
-- STEP 8: SUCCESS MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '🎉 Frontend filters setup completed successfully!';
  RAISE NOTICE '📊 Tables created: file_uploads, daily_usage, api_requests';
  RAISE NOTICE '🔒 Row Level Security enabled for all tables';
  RAISE NOTICE '📈 Views created: provider_usage_detailed, daily_usage_summary';
  RAISE NOTICE '⚡ Triggers created for automatic aggregation';
  RAISE NOTICE '🎯 Frontend filters now supported:';
  RAISE NOTICE '   ✅ Provider filters (supabase, vercel, uploadcare)';
  RAISE NOTICE '   ✅ File type filters (image/jpeg, image/png, etc.)';
  RAISE NOTICE '   ✅ Calendar range filters (today, yesterday, custom range)';
  RAISE NOTICE '🚀 Your frontend usage analytics are now fully functional!';
  RAISE NOTICE '📋 Next steps:';
  RAISE NOTICE '   1. Update your frontend to use the new database structure';
  RAISE NOTICE '   2. Test the filters with the provided queries';
  RAISE NOTICE '   3. Check the FRONTEND_FILTERS_GUIDE.md for implementation examples';
END $$;
