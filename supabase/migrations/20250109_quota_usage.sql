-- Layer 3: Monthly Quota Usage Tracking
-- Stores synced quota data from Redis for billing accuracy and analytics

CREATE TABLE IF NOT EXISTS quota_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    month VARCHAR(7) NOT NULL, -- Format: YYYY-MM (e.g., "2025-01")
    request_count INTEGER NOT NULL DEFAULT 0,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint: one row per user per month
    CONSTRAINT unique_user_month UNIQUE(user_id, month)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_quota_usage_user_month ON quota_usage(user_id, month);
CREATE INDEX IF NOT EXISTS idx_quota_usage_month ON quota_usage(month);
CREATE INDEX IF NOT EXISTS idx_quota_usage_synced_at ON quota_usage(synced_at);
CREATE INDEX IF NOT EXISTS idx_quota_usage_created_at ON quota_usage(created_at);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_quota_usage_updated_at
    BEFORE UPDATE ON quota_usage
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE quota_usage ENABLE ROW LEVEL SECURITY;

-- Users can view their own quota usage
CREATE POLICY "Users can view own quota usage"
    ON quota_usage FOR SELECT
    USING (auth.uid() = user_id);

-- Only service role can insert/update (background job)
CREATE POLICY "Service role can manage quota usage"
    ON quota_usage FOR ALL
    USING (auth.role() = 'service_role');

-- Comments for documentation
COMMENT ON TABLE quota_usage IS 'Monthly API quota usage tracking, synced hourly from Redis';
COMMENT ON COLUMN quota_usage.month IS 'Month in YYYY-MM format (e.g., 2025-01)';
COMMENT ON COLUMN quota_usage.request_count IS 'Total API requests made this month';
COMMENT ON COLUMN quota_usage.synced_at IS 'Last sync time from Redis';
