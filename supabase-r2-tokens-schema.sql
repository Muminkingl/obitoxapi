-- R2 Tokens Table
-- Stores JWT access tokens for R2 resources with revocation support
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS public.r2_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    token_id VARCHAR(255) UNIQUE NOT NULL,  -- Last 16 chars of JWT
    user_id VARCHAR(255) NOT NULL,
    api_key_id VARCHAR(255) NOT NULL,
    bucket VARCHAR(255) NOT NULL,
    file_key TEXT,  -- NULL for bucket-level access
    permissions TEXT[] NOT NULL,  -- Array of 'read', 'write', 'delete'
    metadata JSONB DEFAULT '{}'::jsonb,
    revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_r2_tokens_token_id ON public.r2_tokens(token_id);
CREATE INDEX IF NOT EXISTS idx_r2_tokens_user_id ON public.r2_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_r2_tokens_revoked ON public.r2_tokens(revoked) WHERE NOT revoked;
CREATE INDEX IF NOT EXISTS idx_r2_tokens_expires_at ON public.r2_tokens(expires_at);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_r2_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER r2_tokens_updated_at
    BEFORE UPDATE ON public.r2_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_r2_tokens_updated_at();

-- Cleanup expired tokens (run periodically)
-- DELETE FROM public.r2_tokens WHERE expires_at < NOW();

-- Row Level Security (optional - uncomment if using RLS)
-- ALTER TABLE public.r2_tokens ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can view own tokens" ON public.r2_tokens FOR SELECT USING (auth.uid()::text = user_id);
-- CREATE POLICY "Users can update own tokens" ON public.r2_tokens FOR UPDATE USING (auth.uid()::text = user_id);
