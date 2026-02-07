-- ============================================================================
-- Add Storage Credentials Columns to upload_webhooks
-- Created: 2026-02-07
-- Purpose: Add columns for provider-specific credentials needed for file verification
-- ============================================================================

-- Add region column (for S3)
ALTER TABLE upload_webhooks
ADD COLUMN IF NOT EXISTS region VARCHAR(50);

-- Add account_id column (for R2)
ALTER TABLE upload_webhooks
ADD COLUMN IF NOT EXISTS account_id VARCHAR(100);

-- Add access_key_id column (for S3/R2)
ALTER TABLE upload_webhooks
ADD COLUMN IF NOT EXISTS access_key_id TEXT;

-- Add secret_access_key column (for S3/R2)
ALTER TABLE upload_webhooks
ADD COLUMN IF NOT EXISTS secret_access_key TEXT;

-- Add endpoint column (for custom S3-compatible endpoints like MinIO)
ALTER TABLE upload_webhooks
ADD COLUMN IF NOT EXISTS endpoint TEXT;

-- Comment on columns
COMMENT ON COLUMN upload_webhooks.region IS 'AWS region for S3/R2 (e.g., us-east-1)';
COMMENT ON COLUMN upload_webhooks.account_id IS 'Cloudflare account ID for R2';
COMMENT ON COLUMN upload_webhooks.access_key_id IS 'Storage provider access key for verification';
COMMENT ON COLUMN upload_webhooks.secret_access_key IS 'Storage provider secret key for verification (encrypted)';
COMMENT ON COLUMN upload_webhooks.endpoint IS 'Custom S3-compatible endpoint URL (MinIO, LocalStack, etc.)';
