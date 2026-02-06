-- ============================================================================
-- Webhook System Database Migration (v2)
-- Created: 2026-02-04
-- Purpose: Upload completion webhooks with Redis queue and dead letter support
-- ============================================================================

-- Main webhook records table
CREATE TABLE IF NOT EXISTS upload_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- User info
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    
    -- Webhook configuration
    webhook_url TEXT NOT NULL,
    webhook_secret TEXT NOT NULL,
    trigger_mode VARCHAR(20) NOT NULL DEFAULT 'auto',
    -- 'auto' = server polls for file, 'manual' = client confirms upload
    
    -- Upload details
    provider VARCHAR(20) NOT NULL, -- 'S3', 'R2', 'SUPABASE', 'UPLOADCARE'
    bucket VARCHAR(255) NOT NULL,
    file_key VARCHAR(500) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(100),
    file_size BIGINT,
    etag TEXT, -- For verification via HEAD request
    
    -- Status tracking
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    -- pending | verifying | delivering | completed | failed | dead_letter
    
    -- Delivery tracking
    attempt_count INT DEFAULT 0,
    max_attempts INT DEFAULT 3,
    last_attempt_at TIMESTAMPTZ,
    next_retry_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    
    -- Response tracking
    webhook_response_status INT,
    webhook_response_body TEXT,
    error_message TEXT,
    
    -- Metadata (custom from client)
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_trigger_mode CHECK (trigger_mode IN ('auto', 'manual')),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'verifying', 'delivering', 'completed', 'failed', 'dead_letter')),
    CONSTRAINT valid_max_attempts CHECK (max_attempts BETWEEN 1 AND 10)
);

-- Dead letter queue table for failed webhooks
CREATE TABLE IF NOT EXISTS webhook_dead_letter (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID NOT NULL REFERENCES upload_webhooks(id) ON DELETE CASCADE,
    
    original_payload JSONB NOT NULL,
    failure_reason TEXT NOT NULL,
    attempt_count INT NOT NULL,
    last_attempt_at TIMESTAMPTZ NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    retry_after TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
    
    -- Manual intervention flag
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id)
);

-- ============================================================================
-- INDEXES (Performance Optimized)
-- ============================================================================

-- Primary status index for worker polling
CREATE INDEX IF NOT EXISTS idx_webhooks_status_created 
ON upload_webhooks(status, created_at DESC);

-- User's webhooks lookup
CREATE INDEX IF NOT EXISTS idx_webhooks_user 
ON upload_webhooks(user_id, created_at DESC);

-- Pending webhooks expiration checker
CREATE INDEX IF NOT EXISTS idx_webhooks_expires 
ON upload_webhooks(expires_at) 
WHERE status = 'pending';

-- Delivering webhooks (for monitoring)
CREATE INDEX IF NOT EXISTS idx_webhooks_delivering 
ON upload_webhooks(status) 
WHERE status = 'delivering';

-- Dead letter retry index
CREATE INDEX IF NOT EXISTS idx_dead_letter_retry 
ON webhook_dead_letter(retry_after) 
WHERE retry_after > NOW() AND resolved = FALSE;

-- Dead letter by webhook_id
CREATE INDEX IF NOT EXISTS idx_dead_letter_webhook 
ON webhook_dead_letter(webhook_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE upload_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_dead_letter ENABLE ROW LEVEL SECURITY;

-- Users can view/edit their own webhooks
CREATE POLICY "users_manage_own_webhooks"
ON upload_webhooks FOR ALL
TO authenticated
USING (auth.uid() = user_id);

-- Service role has full access
CREATE POLICY "service_role_all_webhooks"
ON upload_webhooks FOR ALL
TO service_role
USING (true);

-- Dead letter policies
CREATE POLICY "users_view_own_dead_letters"
ON webhook_dead_letter FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM upload_webhooks 
        WHERE upload_webhooks.id = webhook_dead_letter.webhook_id 
        AND upload_webhooks.user_id = auth.uid()
    )
);

CREATE POLICY "service_role_all_dead_letters"
ON webhook_dead_letter FOR ALL
TO service_role
USING (true);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to cleanup expired webhooks (run daily)
CREATE OR REPLACE FUNCTION cleanup_expired_webhooks()
RETURNS INT AS $$
DECLARE
    deleted_count INT;
BEGIN
    DELETE FROM upload_webhooks 
    WHERE expires_at < NOW() 
    AND status NOT IN ('completed', 'dead_letter');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get webhook statistics
CREATE OR REPLACE FUNCTION get_webhook_stats(p_user_id UUID)
RETURNS JSON AS $$
SELECT json_build_object(
    'total', (SELECT COUNT(*) FROM upload_webhooks WHERE user_id = p_user_id),
    'pending', (SELECT COUNT(*) FROM upload_webhooks WHERE user_id = p_user_id AND status = 'pending'),
    'completed', (SELECT COUNT(*) FROM upload_webhooks WHERE user_id = p_user_id AND status = 'completed'),
    'failed', (SELECT COUNT(*) FROM upload_webhooks WHERE user_id = p_user_id AND status = 'failed'),
    'dead_letter', (SELECT COUNT(*) FROM upload_webhooks WHERE user_id = p_user_id AND status = 'dead_letter')
);
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================================================
-- SAMPLE DATA (For testing)
-- ============================================================================

-- Note: This migration should be run with:
-- npx supabase db push
-- or
-- psql -f database/migrations/add_webhook_tables_v2.sql
