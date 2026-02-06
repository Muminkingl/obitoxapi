# 🚀 RESUMABLE MULTIPART UPLOADS - FULL IMPLEMENTATION

Let's build the **FINAL BOSS** of TIER 2! This will be **LEGENDARY**! 🔥

---

# 📁 PART 1: Backend Implementation

## Step 1: Database Migration

```sql
-- migrations/add_multipart_uploads_table.sql

CREATE TABLE IF NOT EXISTS multipart_uploads (
    -- Primary
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- User tracking
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    
    -- S3/R2 multipart upload details
    upload_id VARCHAR(255) NOT NULL,        -- S3 multipart upload ID
    provider VARCHAR(20) NOT NULL,          -- 'S3', 'R2'
    bucket VARCHAR(255) NOT NULL,
    file_key VARCHAR(500) NOT NULL,
    
    -- File details
    filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(100),
    file_size BIGINT NOT NULL,
    
    -- Multipart configuration
    part_size INT NOT NULL,                 -- Bytes per part (e.g., 5MB)
    total_parts INT NOT NULL,               -- Total number of parts
    
    -- Progress tracking
    completed_parts JSONB DEFAULT '[]'::jsonb,
    -- Format: [{ "partNumber": 1, "etag": "abc123", "size": 5242880, "uploadedAt": "2026-02-06..." }]
    
    uploaded_bytes BIGINT DEFAULT 0,
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    -- active | paused | completing | completed | failed | aborted
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
    
    -- Metadata
    metadata JSONB,
    error_message TEXT,
    
    -- Indexes
    CONSTRAINT valid_status CHECK (status IN ('active', 'paused', 'completing', 'completed', 'failed', 'aborted'))
);

-- Indexes for performance
CREATE INDEX idx_multipart_user ON multipart_uploads(user_id, status, created_at DESC);
CREATE INDEX idx_multipart_upload_id ON multipart_uploads(upload_id);
CREATE INDEX idx_multipart_expires ON multipart_uploads(expires_at) WHERE status = 'active';
CREATE INDEX idx_multipart_status ON multipart_uploads(status);

-- RLS Policies
ALTER TABLE multipart_uploads ENABLE ROW LEVEL SECURITY;

-- Users can manage their own uploads
CREATE POLICY "users_manage_own_uploads"
ON multipart_uploads
FOR ALL
TO authenticated
USING (auth.uid() = user_id);

-- Service role can do everything
CREATE POLICY "service_all_uploads"
ON multipart_uploads
FOR ALL
TO service_role
USING (true);

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_multipart_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_multipart_updated_at
BEFORE UPDATE ON multipart_uploads
FOR EACH ROW
EXECUTE FUNCTION update_multipart_updated_at();

-- Function to calculate upload progress
CREATE OR REPLACE FUNCTION get_upload_progress(upload_uuid UUID)
RETURNS TABLE(
    uploaded_parts INT,
    total_parts INT,
    percentage NUMERIC,
    uploaded_bytes BIGINT,
    total_bytes BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM jsonb_array_elements(completed_parts))::INT as uploaded_parts,
        m.total_parts,
        ROUND((SELECT COUNT(*) FROM jsonb_array_elements(completed_parts))::NUMERIC / m.total_parts * 100, 2) as percentage,
        m.uploaded_bytes,
        m.file_size as total_bytes
    FROM multipart_uploads m
    WHERE m.id = upload_uuid;
END;
$$ LANGUAGE plpgsql;
```

---

## Step 2: Multipart Helpers Utility

```javascript
// utils/multipart-helpers.js

/**
 * Calculate optimal part size based on file size
 * S3/R2 limits: 
 * - Minimum part size: 5MB (except last part)
 * - Maximum parts: 10,000
 * - Maximum file size: 5TB
 */
export function calculateOptimalPartSize(fileSize) {
    const MIN_PART_SIZE = 5 * 1024 * 1024;      // 5MB
    const MAX_PART_SIZE = 100 * 1024 * 1024;    // 100MB
    const MAX_PARTS = 10000;
    
    // Calculate minimum part size needed to stay under 10,000 parts
    const minRequiredPartSize = Math.ceil(fileSize / MAX_PARTS);
    
    // Use the larger of minimum part size or required part size
    let partSize = Math.max(MIN_PART_SIZE, minRequiredPartSize);
    
    // Round up to nearest MB for cleaner parts
    partSize = Math.ceil(partSize / (1024 * 1024)) * (1024 * 1024);
    
    // Cap at maximum part size
    partSize = Math.min(partSize, MAX_PART_SIZE);
    
    return partSize;
}

/**
 * Calculate total number of parts
 */
export function calculateTotalParts(fileSize, partSize) {
    return Math.ceil(fileSize / partSize);
}

/**
 * Get size of a specific part
 */
export function getPartSize(partNumber, totalParts, fileSize, partSize) {
    if (partNumber === totalParts) {
        // Last part may be smaller
        const remainder = fileSize % partSize;
        return remainder || partSize;
    }
    return partSize;
}

/**
 * Validate part upload constraints
 */
export function validatePartUpload(fileSize, partSize) {
    const MIN_PART_SIZE = 5 * 1024 * 1024;
    const MAX_PARTS = 10000;
    
    const errors = [];
    
    if (partSize < MIN_PART_SIZE) {
        errors.push(`Part size must be at least 5MB (got ${(partSize / 1024 / 1024).toFixed(2)}MB)`);
    }
    
    const totalParts = Math.ceil(fileSize / partSize);
    if (totalParts > MAX_PARTS) {
        errors.push(`File would require ${totalParts} parts, but maximum is ${MAX_PARTS}`);
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Format bytes for display
 */
export function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Estimate upload time based on network speed
 */
export function estimateUploadTime(fileSize, networkSpeed) {
    // networkSpeed in bytes per second
    const seconds = fileSize / networkSpeed;
    
    if (seconds < 60) {
        return `${Math.ceil(seconds)}s`;
    } else if (seconds < 3600) {
        return `${Math.ceil(seconds / 60)}m`;
    } else {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.ceil((seconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
    }
}

/**
 * Generate part range header
 */
export function getPartRange(partNumber, partSize, fileSize) {
    const start = (partNumber - 1) * partSize;
    const end = Math.min(start + partSize - 1, fileSize - 1);
    return { start, end, size: end - start + 1 };
}
```

---

## Step 3: Initialize Multipart Upload Controller

```javascript
// controllers/multipart/init.controller.js

import { CreateMultipartUploadCommand, UploadPartCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { supabaseAdmin } from '../../config/supabase.js';
import { getR2Client } from '../providers/r2/r2.config.js';
import { getS3Client } from '../providers/s3/s3.config.js';
import { 
    calculateOptimalPartSize, 
    calculateTotalParts,
    validatePartUpload,
    formatBytes
} from '../../utils/multipart-helpers.js';

/**
 * POST /api/v1/upload/multipart/init
 * Initialize a multipart upload
 */
export async function initMultipartUpload(req, res) {
    const startTime = Date.now();
    
    try {
        const {
            filename,
            fileSize,
            contentType,
            provider,
            r2AccessKey,
            r2SecretKey,
            r2AccountId,
            r2Bucket,
            s3AccessKey,
            s3SecretKey,
            s3Bucket,
            s3Region,
            partSize: customPartSize,
            metadata = {}
        } = req.body;

        const userId = req.userId;
        const apiKeyId = req.apiKeyId;

        // Validate required fields
        if (!filename || !fileSize || !contentType) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_REQUIRED_FIELDS',
                message: 'filename, fileSize, and contentType are required'
            });
        }

        // Calculate optimal part size
        const partSize = customPartSize || calculateOptimalPartSize(fileSize);
        const totalParts = calculateTotalParts(fileSize, partSize);

        // Validate part upload constraints
        const validation = validatePartUpload(fileSize, partSize);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                error: 'INVALID_PART_SIZE',
                message: validation.errors.join(', ')
            });
        }

        console.log(`[Multipart Init] Starting multipart upload:`);
        console.log(`  - File: ${filename} (${formatBytes(fileSize)})`);
        console.log(`  - Parts: ${totalParts} x ${formatBytes(partSize)}`);
        console.log(`  - Provider: ${provider}`);

        // Get storage client
        let client, bucket, region, accountId;
        
        if (provider === 'R2') {
            if (!r2AccessKey || !r2SecretKey || !r2AccountId || !r2Bucket) {
                return res.status(400).json({
                    success: false,
                    error: 'MISSING_R2_CREDENTIALS',
                    message: 'R2 credentials are required'
                });
            }
            client = getR2Client(r2AccessKey, r2SecretKey, r2AccountId);
            bucket = r2Bucket;
            accountId = r2AccountId;
        } else if (provider === 'S3') {
            if (!s3AccessKey || !s3SecretKey || !s3Bucket) {
                return res.status(400).json({
                    success: false,
                    error: 'MISSING_S3_CREDENTIALS',
                    message: 'S3 credentials are required'
                });
            }
            client = getS3Client(s3AccessKey, s3SecretKey, s3Region || 'us-east-1');
            bucket = s3Bucket;
            region = s3Region || 'us-east-1';
        } else {
            return res.status(400).json({
                success: false,
                error: 'INVALID_PROVIDER',
                message: 'Provider must be S3 or R2'
            });
        }

        // Generate unique file key
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 8);
        const fileKey = `multipart/${userId.substring(0, 8)}_${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}_${timestamp}_${randomId}`;

        // Initialize multipart upload
        const createCommand = new CreateMultipartUploadCommand({
            Bucket: bucket,
            Key: fileKey,
            ContentType: contentType,
            Metadata: {
                'original-filename': filename,
                'upload-started': new Date().toISOString(),
                'user-id': userId,
                ...metadata
            }
        });

        const multipartUpload = await client.send(createCommand);
        const uploadId = multipartUpload.UploadId;

        console.log(`[Multipart Init] ✅ Multipart upload created: ${uploadId}`);

        // Generate presigned URLs for each part
        console.log(`[Multipart Init] 🔗 Generating ${totalParts} presigned URLs...`);
        
        const partUrls = [];
        const urlGenerationStart = Date.now();

        for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
            const uploadPartCommand = new UploadPartCommand({
                Bucket: bucket,
                Key: fileKey,
                PartNumber: partNumber,
                UploadId: uploadId
            });

            const url = await getSignedUrl(client, uploadPartCommand, {
                expiresIn: 7 * 24 * 3600 // 7 days
            });

            const isLastPart = partNumber === totalParts;
            const currentPartSize = isLastPart 
                ? (fileSize % partSize || partSize)
                : partSize;

            partUrls.push({
                partNumber,
                url,
                size: currentPartSize,
                start: (partNumber - 1) * partSize,
                end: (partNumber - 1) * partSize + currentPartSize - 1
            });
        }

        const urlGenerationTime = Date.now() - urlGenerationStart;
        console.log(`[Multipart Init] ✅ Generated URLs in ${urlGenerationTime}ms`);

        // Create resume token and save to database
        const resumeToken = `mpu_${crypto.randomUUID()}`;

        const { error: dbError } = await supabaseAdmin
            .from('multipart_uploads')
            .insert({
                id: resumeToken,
                user_id: userId,
                api_key_id: apiKeyId,
                upload_id: uploadId,
                provider,
                bucket,
                file_key: fileKey,
                filename,
                content_type: contentType,
                file_size: fileSize,
                part_size: partSize,
                total_parts: totalParts,
                status: 'active',
                metadata: {
                    ...metadata,
                    region: provider === 'S3' ? region : undefined,
                    accountId: provider === 'R2' ? accountId : undefined
                }
            });

        if (dbError) {
            console.error('[Multipart Init] Database error:', dbError);
            throw new Error('Failed to save upload to database');
        }

        const totalTime = Date.now() - startTime;
        console.log(`[Multipart Init] 🎉 Initialization complete in ${totalTime}ms`);

        res.json({
            success: true,
            resumeToken,
            uploadId,
            fileKey,
            partUrls,
            totalParts,
            partSize,
            fileSize,
            expiresIn: 7 * 24 * 3600,
            initializationTime: totalTime,
            message: `Ready to upload ${totalParts} parts of ${formatBytes(partSize)} each`
        });

    } catch (error) {
        console.error('[Multipart Init] ❌ Error:', error);
        res.status(500).json({
            success: false,
            error: 'MULTIPART_INIT_FAILED',
            message: error.message
        });
    }
}
```

---

## Step 4: Resume Multipart Upload Controller

```javascript
// controllers/multipart/resume.controller.js

import { ListPartsCommand, UploadPartCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { supabaseAdmin } from '../../config/supabase.js';
import { getR2Client } from '../providers/r2/r2.config.js';
import { getS3Client } from '../providers/s3/s3.config.js';
import { formatBytes } from '../../utils/multipart-helpers.js';

/**
 * POST /api/v1/upload/multipart/resume
 * Resume a paused/interrupted multipart upload
 */
export async function resumeMultipartUpload(req, res) {
    const startTime = Date.now();
    
    try {
        const { resumeToken } = req.body;
        const userId = req.userId;

        if (!resumeToken) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_RESUME_TOKEN',
                message: 'resumeToken is required'
            });
        }

        console.log(`[Multipart Resume] 🔄 Resuming upload: ${resumeToken}`);

        // Get upload from database
        const { data: upload, error } = await supabaseAdmin
            .from('multipart_uploads')
            .select('*')
            .eq('id', resumeToken)
            .eq('user_id', userId)
            .single();

        if (error || !upload) {
            return res.status(404).json({
                success: false,
                error: 'UPLOAD_NOT_FOUND',
                message: 'Upload not found or access denied'
            });
        }

        // Check status
        if (upload.status === 'completed') {
            return res.status(400).json({
                success: false,
                error: 'UPLOAD_ALREADY_COMPLETED',
                message: 'This upload has already been completed'
            });
        }

        if (upload.status === 'aborted') {
            return res.status(400).json({
                success: false,
                error: 'UPLOAD_ABORTED',
                message: 'This upload has been aborted'
            });
        }

        // Check expiration
        if (new Date(upload.expires_at) < new Date()) {
            await supabaseAdmin
                .from('multipart_uploads')
                .update({ status: 'failed', error_message: 'Upload expired' })
                .eq('id', resumeToken);

            return res.status(410).json({
                success: false,
                error: 'UPLOAD_EXPIRED',
                message: 'Upload has expired (7 days limit)'
            });
        }

        // Get storage client
        let client;
        if (upload.provider === 'R2') {
            const { accountId } = upload.metadata;
            client = getR2Client(
                process.env.R2_ACCESS_KEY,  // Store credentials in env
                process.env.R2_SECRET_KEY,
                accountId
            );
        } else if (upload.provider === 'S3') {
            const { region } = upload.metadata;
            client = getS3Client(
                process.env.S3_ACCESS_KEY,
                process.env.S3_SECRET_KEY,
                region
            );
        }

        // List uploaded parts from S3/R2
        console.log(`[Multipart Resume] 🔍 Checking uploaded parts...`);
        
        const listPartsCommand = new ListPartsCommand({
            Bucket: upload.bucket,
            Key: upload.file_key,
            UploadId: upload.upload_id
        });

        const partsResponse = await client.send(listPartsCommand);
        const uploadedParts = partsResponse.Parts?.map(p => ({
            partNumber: p.PartNumber,
            etag: p.ETag?.replace(/"/g, ''),
            size: p.Size,
            lastModified: p.LastModified
        })) || [];

        console.log(`[Multipart Resume] ✅ Found ${uploadedParts.length}/${upload.total_parts} uploaded parts`);

        // Calculate progress
        const uploadedBytes = uploadedParts.reduce((sum, p) => sum + p.size, 0);
        const progress = {
            uploaded: uploadedParts.length,
            total: upload.total_parts,
            percentage: ((uploadedParts.length / upload.total_parts) * 100).toFixed(2),
            uploadedBytes,
            totalBytes: upload.file_size,
            bytesPercentage: ((uploadedBytes / upload.file_size) * 100).toFixed(2)
        };

        // Determine remaining parts
        const uploadedPartNumbers = new Set(uploadedParts.map(p => p.partNumber));
        const remainingPartNumbers = [];
        
        for (let i = 1; i <= upload.total_parts; i++) {
            if (!uploadedPartNumbers.has(i)) {
                remainingPartNumbers.push(i);
            }
        }

        console.log(`[Multipart Resume] 📊 Progress: ${progress.percentage}% (${formatBytes(uploadedBytes)}/${formatBytes(upload.file_size)})`);
        console.log(`[Multipart Resume] 🔗 Generating URLs for ${remainingPartNumbers.length} remaining parts...`);

        // Generate presigned URLs for remaining parts
        const partUrls = [];
        for (const partNumber of remainingPartNumbers) {
            const uploadPartCommand = new UploadPartCommand({
                Bucket: upload.bucket,
                Key: upload.file_key,
                PartNumber: partNumber,
                UploadId: upload.upload_id
            });

            const url = await getSignedUrl(client, uploadPartCommand, {
                expiresIn: 7 * 24 * 3600 // 7 days
            });

            const isLastPart = partNumber === upload.total_parts;
            const partSize = isLastPart
                ? (upload.file_size % upload.part_size || upload.part_size)
                : upload.part_size;

            partUrls.push({
                partNumber,
                url,
                size: partSize,
                start: (partNumber - 1) * upload.part_size,
                end: (partNumber - 1) * upload.part_size + partSize - 1
            });
        }

        // Update database with current progress
        await supabaseAdmin
            .from('multipart_uploads')
            .update({
                completed_parts: uploadedParts,
                uploaded_bytes: uploadedBytes,
                status: 'active'
            })
            .eq('id', resumeToken);

        const totalTime = Date.now() - startTime;
        console.log(`[Multipart Resume] 🎉 Resume data prepared in ${totalTime}ms`);

        res.json({
            success: true,
            resumeToken,
            uploadId: upload.upload_id,
            fileKey: upload.file_key,
            filename: upload.filename,
            totalParts: upload.total_parts,
            partSize: upload.part_size,
            uploadedParts,
            remainingParts: partUrls,
            progress,
            resumeTime: totalTime,
            message: remainingPartNumbers.length === 0
                ? 'All parts uploaded! Ready to complete.'
                : `Resume from ${progress.percentage}% - ${remainingPartNumbers.length} parts remaining`
        });

    } catch (error) {
        console.error('[Multipart Resume] ❌ Error:', error);
        res.status(500).json({
            success: false,
            error: 'MULTIPART_RESUME_FAILED',
            message: error.message
        });
    }
}
```

---

## Step 5: Complete Multipart Upload Controller

```javascript
// controllers/multipart/complete.controller.js

import { CompleteMultipartUploadCommand } from '@aws-sdk/client-s3';
import { supabaseAdmin } from '../../config/supabase.js';
import { getR2Client } from '../providers/r2/r2.config.js';
import { getS3Client } from '../providers/s3/s3.config.js';
import { formatBytes } from '../../utils/multipart-helpers.js';

/**
 * POST /api/v1/upload/multipart/complete
 * Complete a multipart upload (combine all parts)
 */
export async function completeMultipartUpload(req, res) {
    const startTime = Date.now();
    
    try {
        const { resumeToken, parts } = req.body;
        const userId = req.userId;

        if (!resumeToken) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_RESUME_TOKEN',
                message: 'resumeToken is required'
            });
        }

        if (!parts || !Array.isArray(parts) || parts.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_PARTS',
                message: 'parts array is required'
            });
        }

        console.log(`[Multipart Complete] 🏁 Completing upload: ${resumeToken}`);
        console.log(`[Multipart Complete] 📦 Combining ${parts.length} parts...`);

        // Get upload from database
        const { data: upload, error } = await supabaseAdmin
            .from('multipart_uploads')
            .select('*')
            .eq('id', resumeToken)
            .eq('user_id', userId)
            .single();

        if (error || !upload) {
            return res.status(404).json({
                success: false,
                error: 'UPLOAD_NOT_FOUND',
                message: 'Upload not found or access denied'
            });
        }

        // Validate all parts are provided
        if (parts.length !== upload.total_parts) {
            return res.status(400).json({
                success: false,
                error: 'INCOMPLETE_PARTS',
                message: `Expected ${upload.total_parts} parts, got ${parts.length}`
            });
        }

        // Update status to completing
        await supabaseAdmin
            .from('multipart_uploads')
            .update({ status: 'completing' })
            .eq('id', resumeToken);

        // Get storage client
        let client;
        if (upload.provider === 'R2') {
            const { accountId } = upload.metadata;
            client = getR2Client(
                process.env.R2_ACCESS_KEY,
                process.env.R2_SECRET_KEY,
                accountId
            );
        } else if (upload.provider === 'S3') {
            const { region } = upload.metadata;
            client = getS3Client(
                process.env.S3_ACCESS_KEY,
                process.env.S3_SECRET_KEY,
                region
            );
        }

        // Sort parts by part number (S3/R2 requires this)
        const sortedParts = parts
            .map(p => ({
                PartNumber: p.partNumber,
                ETag: p.etag.replace(/"/g, '') // Remove quotes if present
            }))
            .sort((a, b) => a.PartNumber - b.PartNumber);

        // Complete multipart upload on S3/R2
        const completeCommand = new CompleteMultipartUploadCommand({
            Bucket: upload.bucket,
            Key: upload.file_key,
            UploadId: upload.upload_id,
            MultipartUpload: {
                Parts: sortedParts
            }
        });

        console.log(`[Multipart Complete] 🔧 Sending complete command to ${upload.provider}...`);
        const result = await client.send(completeCommand);

        // Generate public URL
        let publicUrl;
        if (upload.provider === 'R2') {
            const { accountId } = upload.metadata;
            publicUrl = `https://pub-${accountId}.r2.dev/${upload.file_key}`;
        } else if (upload.provider === 'S3') {
            const { region } = upload.metadata;
            publicUrl = `https://${upload.bucket}.s3.${region}.amazonaws.com/${upload.file_key}`;
        }

        // Update database
        await supabaseAdmin
            .from('multipart_uploads')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                completed_parts: parts,
                uploaded_bytes: upload.file_size
            })
            .eq('id', resumeToken);

        const totalTime = Date.now() - startTime;
        console.log(`[Multipart Complete] ✅ Upload completed in ${totalTime}ms`);
        console.log(`[Multipart Complete] 📁 File: ${upload.filename} (${formatBytes(upload.file_size)})`);
        console.log(`[Multipart Complete] 🔗 URL: ${publicUrl}`);

        res.json({
            success: true,
            url: publicUrl,
            fileKey: upload.file_key,
            filename: upload.filename,
            fileSize: upload.file_size,
            etag: result.ETag?.replace(/"/g, ''),
            location: result.Location,
            provider: upload.provider,
            bucket: upload.bucket,
            totalParts: upload.total_parts,
            completionTime: totalTime,
            message: `Successfully uploaded ${formatBytes(upload.file_size)} in ${upload.total_parts} parts`
        });

    } catch (error) {
        console.error('[Multipart Complete] ❌ Error:', error);
        
        // Update status to failed
        if (req.body.resumeToken) {
            await supabaseAdmin
                .from('multipart_uploads')
                .update({
                    status: 'failed',
                    error_message: error.message
                })
                .eq('id', req.body.resumeToken);
        }

        res.status(500).json({
            success: false,
            error: 'MULTIPART_COMPLETE_FAILED',
            message: error.message
        });
    }
}
```

---

## Step 6: Abort Multipart Upload Controller

```javascript
// controllers/multipart/abort.controller.js

import { AbortMultipartUploadCommand } from '@aws-sdk/client-s3';
import { supabaseAdmin } from '../../config/supabase.js';
import { getR2Client } from '../providers/r2/r2.config.js';
import { getS3Client } from '../providers/s3/s3.config.js';

/**
 * POST /api/v1/upload/multipart/abort
 * Abort a multipart upload (cleanup)
 */
export async function abortMultipartUpload(req, res) {
    try {
        const { resumeToken } = req.body;
        const userId = req.userId;

        if (!resumeToken) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_RESUME_TOKEN',
                message: 'resumeToken is required'
            });
        }

        console.log(`[Multipart Abort] 🛑 Aborting upload: ${resumeToken}`);

        // Get upload from database
        const { data: upload, error } = await supabaseAdmin
            .from('multipart_uploads')
            .select('*')
            .eq('id', resumeToken)
            .eq('user_id', userId)
            .single();

        if (error || !upload) {
            return res.status(404).json({
                success: false,
                error: 'UPLOAD_NOT_FOUND',
                message: 'Upload not found or access denied'
            });
        }

        if (upload.status === 'completed') {
            return res.status(400).json({
                success: false,
                error: 'UPLOAD_ALREADY_COMPLETED',
                message: 'Cannot abort a completed upload'
            });
        }

        // Get storage client
        let client;
        if (upload.provider === 'R2') {
            const { accountId } = upload.metadata;
            client = getR2Client(
                process.env.R2_ACCESS_KEY,
                process.env.R2_SECRET_KEY,
                accountId
            );
        } else if (upload.provider === 'S3') {
            const { region } = upload.metadata;
            client = getS3Client(
                process.env.S3_ACCESS_KEY,
                process.env.S3_SECRET_KEY,
                region
            );
        }

        // Abort multipart upload on S3/R2
        const abortCommand = new AbortMultipartUploadCommand({
            Bucket: upload.bucket,
            Key: upload.file_key,
            UploadId: upload.upload_id
        });

        await client.send(abortCommand);

        // Update database
        await supabaseAdmin
            .from('multipart_uploads')
            .update({
                status: 'aborted',
                error_message: 'Upload aborted by user'
            })
            .eq('id', resumeToken);

        console.log(`[Multipart Abort] ✅ Upload aborted: ${resumeToken}`);

        res.json({
            success: true,
            message: 'Upload aborted and cleaned up',
            resumeToken
        });

    } catch (error) {
        console.error('[Multipart Abort] ❌ Error:', error);
        res.status(500).json({
            success: false,
            error: 'MULTIPART_ABORT_FAILED',
            message: error.message
        });
    }
}
```

---

## Step 7: Multipart Routes

```javascript
// routes/multipart.routes.js

import express from 'express';
import validateApiKey from '../middlewares/apikey.middleware.js';
import { initMultipartUpload } from '../controllers/multipart/init.controller.js';
import { resumeMultipartUpload } from '../controllers/multipart/resume.controller.js';
import { completeMultipartUpload } from '../controllers/multipart/complete.controller.js';
import { abortMultipartUpload } from '../controllers/multipart/abort.controller.js';

const router = express.Router();

// All multipart routes require API key authentication
router.use(validateApiKey);

/**
 * POST /api/v1/upload/multipart/init
 * Initialize a multipart upload
 */
router.post('/init', initMultipartUpload);

/**
 * POST /api/v1/upload/multipart/resume
 * Resume an interrupted multipart upload
 */
router.post('/resume', resumeMultipartUpload);

/**
 * POST /api/v1/upload/multipart/complete
 * Complete a multipart upload (combine parts)
 */
router.post('/complete', completeMultipartUpload);

/**
 * POST /api/v1/upload/multipart/abort
 * Abort a multipart upload (cleanup)
 */
router.post('/abort', abortMultipartUpload);

export default router;
```

---
