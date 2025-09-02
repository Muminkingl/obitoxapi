-- SUPABASE DATABASE SETUP FOR FILE UPLOAD API

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- ======= TABLES =======

-- API Keys table (for developer authentication)
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  key_value TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT unique_user_key_name UNIQUE(user_id, name)
);

-- Storage Provider Configurations
CREATE TABLE IF NOT EXISTS public.storage_providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  provider_name TEXT NOT NULL, -- 'aws', 'vercel', 'cloudinary', etc.
  provider_config JSONB NOT NULL, -- Store provider-specific credentials
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT unique_user_provider UNIQUE(user_id, provider_name)
);

-- Upload Logs (for analytics and billing)
CREATE TABLE IF NOT EXISTS public.upload_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  api_key_id UUID REFERENCES public.api_keys(id),
  provider_id UUID REFERENCES public.storage_providers(id),
  file_name TEXT NOT NULL,
  file_size BIGINT,
  file_type TEXT,
  file_url TEXT,
  status TEXT NOT NULL, -- 'completed', 'failed'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Domains for custom domains to serve files
CREATE TABLE IF NOT EXISTS public.domains (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  domain_name TEXT NOT NULL,
  status TEXT NOT NULL, -- 'pending', 'verified', 'active'
  verification_code TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT unique_user_domain UNIQUE(user_id, domain_name)
);

-- Subscription Tiers (Free, Pro, Enterprise)
CREATE TABLE IF NOT EXISTS public.subscription_tiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  monthly_price INTEGER NOT NULL,
  yearly_price INTEGER NOT NULL,
  upload_limit BIGINT NOT NULL, -- bytes per month
  custom_domain BOOLEAN DEFAULT FALSE,
  priority_support BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Subscriptions
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL UNIQUE,
  tier_id UUID REFERENCES public.subscription_tiers(id) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  current_usage BIGINT DEFAULT 0, -- bytes used this month
  billing_period_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  billing_period_end TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ======= ROW LEVEL SECURITY =======

-- Enable RLS on all tables
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

-- API Keys policies
CREATE POLICY "Users can view their own API keys" ON public.api_keys
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own API keys" ON public.api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own API keys" ON public.api_keys
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own API keys" ON public.api_keys
  FOR DELETE USING (auth.uid() = user_id);

-- Storage Providers policies
CREATE POLICY "Users can view their own storage providers" ON public.storage_providers
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own storage providers" ON public.storage_providers
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own storage providers" ON public.storage_providers
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own storage providers" ON public.storage_providers
  FOR DELETE USING (auth.uid() = user_id);

-- Upload Logs policies
CREATE POLICY "Users can view their own upload logs" ON public.upload_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own upload logs" ON public.upload_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Domains policies
CREATE POLICY "Users can view their own domains" ON public.domains
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own domains" ON public.domains
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own domains" ON public.domains
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own domains" ON public.domains
  FOR DELETE USING (auth.uid() = user_id);

-- Subscription Tiers policies
CREATE POLICY "Anyone can view subscription tiers" ON public.subscription_tiers
  FOR SELECT USING (true);

CREATE POLICY "Only service_role can manage subscription tiers" ON public.subscription_tiers
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- User Subscriptions policies
CREATE POLICY "Users can view their own subscription" ON public.user_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Only service_role can manage subscriptions" ON public.user_subscriptions
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ======= FUNCTIONS =======

-- Function to initialize a new user with free subscription
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  free_tier_id UUID;
BEGIN
  -- Get the ID of the free tier
  SELECT id INTO free_tier_id FROM public.subscription_tiers WHERE name = 'Free' LIMIT 1;
  
  -- If no free tier exists, insert it
  IF free_tier_id IS NULL THEN
    INSERT INTO public.subscription_tiers (name, monthly_price, yearly_price, upload_limit, custom_domain, priority_support)
    VALUES ('Free', 0, 0, 100000000, false, false) -- 100MB free tier
    RETURNING id INTO free_tier_id;
  END IF;

  -- Create user subscription
  INSERT INTO public.user_subscriptions (user_id, tier_id, billing_period_end)
  VALUES (NEW.id, free_tier_id, (NOW() + INTERVAL '1 month'));
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to run handle_new_user function on user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to validate API key
CREATE OR REPLACE FUNCTION public.validate_api_key(key_to_validate TEXT)
RETURNS TABLE (
  is_valid BOOLEAN,
  user_id UUID,
  api_key_id UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    TRUE as is_valid,
    api_keys.user_id,
    api_keys.id as api_key_id
  FROM public.api_keys
  WHERE api_keys.key_value = key_to_validate
    AND api_keys.is_active = TRUE;
  
  -- Update last used timestamp
  UPDATE public.api_keys
  SET last_used_at = NOW()
  WHERE key_value = key_to_validate;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has available upload quota
CREATE OR REPLACE FUNCTION public.check_upload_quota(user_id_param UUID, file_size_param BIGINT)
RETURNS BOOLEAN AS $$
DECLARE
  subscription_record RECORD;
BEGIN
  -- Get the user's subscription details
  SELECT 
    us.current_usage,
    st.upload_limit
  INTO subscription_record
  FROM public.user_subscriptions us
  JOIN public.subscription_tiers st ON us.tier_id = st.id
  WHERE us.user_id = user_id_param AND us.is_active = TRUE;
  
  -- Check if adding this file would exceed the limit
  IF subscription_record.current_usage + file_size_param <= subscription_record.upload_limit THEN
    RETURN TRUE;
  ELSE
    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update usage when a file is uploaded
CREATE OR REPLACE FUNCTION public.update_upload_usage()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the user's current usage
  UPDATE public.user_subscriptions
  SET current_usage = current_usage + NEW.file_size
  WHERE user_id = NEW.user_id AND is_active = TRUE;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update usage when a file is uploaded
CREATE TRIGGER on_upload_created
  AFTER INSERT ON public.upload_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_upload_usage();

-- ======= INITIAL DATA =======

-- Insert subscription tiers
INSERT INTO public.subscription_tiers (name, monthly_price, yearly_price, upload_limit, custom_domain, priority_support)
VALUES 
  ('Free', 0, 0, 100000000, false, false), -- 100MB
  ('Pro', 400, 4000, 10000000000, true, false), -- 10GB, $4/month
  ('Enterprise', 1000, 10000, 100000000000, true, true) -- 100GB, $10/month
ON CONFLICT (name) DO NOTHING;
