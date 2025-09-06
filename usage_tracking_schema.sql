-- Enhanced Usage Tracking Schema
-- This adds granular tracking for calendar range and file type filtering

-- 1. Create a table to track individual file uploads with timestamps
CREATE TABLE IF NOT EXISTS public.file_uploads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  api_key_id UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('supabase', 'uploadcare', 'vercel')),
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL, -- e.g., 'image/jpeg', 'application/pdf', 'video/mp4'
  file_size BIGINT NOT NULL,
  upload_status TEXT NOT NULL DEFAULT 'success' CHECK (upload_status IN ('success', 'failed')),
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Indexes for performance
  CONSTRAINT file_uploads_api_key_id_idx UNIQUE(id, api_key_id)
);

-- 2. Create a table to track API requests with timestamps
CREATE TABLE IF NOT EXISTS public.api_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  api_key_id UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('upload', 'download', 'delete', 'list')),
  provider TEXT NOT NULL CHECK (provider IN ('supabase', 'uploadcare', 'vercel')),
  status_code INTEGER NOT NULL,
  response_time_ms INTEGER,
  request_size_bytes BIGINT,
  response_size_bytes BIGINT,
  error_message TEXT,
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create a table for daily usage aggregation (for better performance)
CREATE TABLE IF NOT EXISTS public.daily_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  api_key_id UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('supabase', 'uploadcare', 'vercel')),
  file_type TEXT NOT NULL,
  total_uploads INTEGER DEFAULT 0,
  total_file_size BIGINT DEFAULT 0,
  successful_requests INTEGER DEFAULT 0,
  failed_requests INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one record per day per api_key per provider per file_type
  CONSTRAINT daily_usage_unique UNIQUE (api_key_id, usage_date, provider, file_type)
);

-- 4. Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_file_uploads_api_key_uploaded_at ON public.file_uploads(api_key_id, uploaded_at);
CREATE INDEX IF NOT EXISTS idx_file_uploads_provider_uploaded_at ON public.file_uploads(provider, uploaded_at);
CREATE INDEX IF NOT EXISTS idx_file_uploads_file_type_uploaded_at ON public.file_uploads(file_type, uploaded_at);
CREATE INDEX IF NOT EXISTS idx_file_uploads_user_uploaded_at ON public.file_uploads(user_id, uploaded_at);

CREATE INDEX IF NOT EXISTS idx_api_requests_api_key_requested_at ON public.api_requests(api_key_id, requested_at);
CREATE INDEX IF NOT EXISTS idx_api_requests_provider_requested_at ON public.api_requests(provider, requested_at);
CREATE INDEX IF NOT EXISTS idx_api_requests_user_requested_at ON public.api_requests(user_id, requested_at);

CREATE INDEX IF NOT EXISTS idx_daily_usage_api_key_date ON public.daily_usage(api_key_id, usage_date);
CREATE INDEX IF NOT EXISTS idx_daily_usage_provider_date ON public.daily_usage(provider, usage_date);
CREATE INDEX IF NOT EXISTS idx_daily_usage_file_type_date ON public.daily_usage(file_type, usage_date);

-- 5. Set up Row Level Security
ALTER TABLE public.file_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_usage ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS policies
-- File uploads policies
CREATE POLICY "Users can view their own file uploads" ON public.file_uploads
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own file uploads" ON public.file_uploads
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own file uploads" ON public.file_uploads
  FOR UPDATE USING (auth.uid() = user_id);

-- API requests policies
CREATE POLICY "Users can view their own API requests" ON public.api_requests
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own API requests" ON public.api_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Daily usage policies
CREATE POLICY "Users can view their own daily usage" ON public.daily_usage
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own daily usage" ON public.daily_usage
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own daily usage" ON public.daily_usage
  FOR UPDATE USING (auth.uid() = user_id);

-- 7. Create functions to aggregate data
CREATE OR REPLACE FUNCTION public.get_usage_by_date_range(
  p_api_key_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_providers TEXT[] DEFAULT NULL,
  p_file_types TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  usage_date DATE,
  provider TEXT,
  file_type TEXT,
  total_uploads INTEGER,
  total_file_size BIGINT,
  successful_requests INTEGER,
  failed_requests INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    du.usage_date,
    du.provider,
    du.file_type,
    du.total_uploads,
    du.total_file_size,
    du.successful_requests,
    du.failed_requests
  FROM public.daily_usage du
  WHERE du.api_key_id = p_api_key_id
    AND du.usage_date >= p_start_date
    AND du.usage_date <= p_end_date
    AND (p_providers IS NULL OR du.provider = ANY(p_providers))
    AND (p_file_types IS NULL OR du.file_type = ANY(p_file_types))
  ORDER BY du.usage_date, du.provider, du.file_type;
END;
$$;

-- 8. Create function to get file type breakdown
CREATE OR REPLACE FUNCTION public.get_file_type_breakdown(
  p_api_key_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  file_type TEXT,
  total_uploads INTEGER,
  total_file_size BIGINT,
  percentage NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  total_uploads_all INTEGER;
BEGIN
  -- Get total uploads for percentage calculation
  SELECT COALESCE(SUM(total_uploads), 0) INTO total_uploads_all
  FROM public.daily_usage
  WHERE api_key_id = p_api_key_id
    AND (p_start_date IS NULL OR usage_date >= p_start_date)
    AND (p_end_date IS NULL OR usage_date <= p_end_date);
  
  RETURN QUERY
  SELECT 
    du.file_type,
    SUM(du.total_uploads)::INTEGER as total_uploads,
    SUM(du.total_file_size) as total_file_size,
    CASE 
      WHEN total_uploads_all > 0 THEN 
        ROUND((SUM(du.total_uploads)::NUMERIC / total_uploads_all * 100), 1)
      ELSE 0
    END as percentage
  FROM public.daily_usage du
  WHERE du.api_key_id = p_api_key_id
    AND (p_start_date IS NULL OR du.usage_date >= p_start_date)
    AND (p_end_date IS NULL OR du.usage_date <= p_end_date)
  GROUP BY du.file_type
  ORDER BY SUM(du.total_uploads) DESC;
END;
$$;

-- 9. Create function to get provider breakdown with date filtering
CREATE OR REPLACE FUNCTION public.get_provider_breakdown(
  p_api_key_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  provider TEXT,
  total_uploads INTEGER,
  total_file_size BIGINT,
  percentage NUMERIC,
  last_used_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  total_uploads_all INTEGER;
BEGIN
  -- Get total uploads for percentage calculation
  SELECT COALESCE(SUM(total_uploads), 0) INTO total_uploads_all
  FROM public.daily_usage
  WHERE api_key_id = p_api_key_id
    AND (p_start_date IS NULL OR usage_date >= p_start_date)
    AND (p_end_date IS NULL OR usage_date <= p_end_date);
  
  RETURN QUERY
  SELECT 
    du.provider,
    SUM(du.total_uploads)::INTEGER as total_uploads,
    SUM(du.total_file_size) as total_file_size,
    CASE 
      WHEN total_uploads_all > 0 THEN 
        ROUND((SUM(du.total_uploads)::NUMERIC / total_uploads_all * 100), 1)
      ELSE 0
    END as percentage,
    MAX(du.updated_at) as last_used_at
  FROM public.daily_usage du
  WHERE du.api_key_id = p_api_key_id
    AND (p_start_date IS NULL OR du.usage_date >= p_start_date)
    AND (p_end_date IS NULL OR du.usage_date <= p_end_date)
  GROUP BY du.provider
  ORDER BY SUM(du.total_uploads) DESC;
END;
$$;

-- 10. Grant permissions
GRANT EXECUTE ON FUNCTION public.get_usage_by_date_range(UUID, DATE, DATE, TEXT[], TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_file_type_breakdown(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_provider_breakdown(UUID, DATE, DATE) TO authenticated;
