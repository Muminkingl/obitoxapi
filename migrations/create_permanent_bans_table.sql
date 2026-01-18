-- Migration: Create permanent_bans table
-- Purpose: Track users who repeatedly violate rate limits despite escalating temporary bans
-- Escalation: 5min → 1 day → 7 days → PERMANENT

CREATE TABLE IF NOT EXISTS permanent_bans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    banned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reason TEXT NOT NULL,
    ban_history JSONB NOT NULL DEFAULT '[]'::jsonb, -- Track all previous bans
    total_violations INTEGER NOT NULL DEFAULT 0,
    admin_notes TEXT,
    can_appeal BOOLEAN DEFAULT false,
    appeal_submitted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one permanent ban per user
    UNIQUE(user_id)
);

-- Index for fast lookups during request validation
CREATE INDEX IF NOT EXISTS idx_permanent_bans_user_id ON permanent_bans(user_id);

-- Add table comment
COMMENT ON TABLE permanent_bans IS 'Permanently banned users who repeatedly violated rate limits: 5min → 1day → 7days → PERMANENT';

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_permanent_bans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER set_permanent_bans_updated_at
    BEFORE UPDATE ON permanent_bans
    FOR EACH ROW
    EXECUTE FUNCTION update_permanent_bans_updated_at();
