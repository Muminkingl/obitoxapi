/**
 * AWS S3 Metadata Controller
 * Get object metadata without downloading the file
 * 
 * OPTIMIZED: Uses only updateRequestMetrics (Redis-backed)
 */

import { HeadObjectCommand } from '@aws-sdk/client-s3';
import {
    validateS3Credentials,
    getS3Client,
    formatS3Error
} from './s3.config.js';
import { isValidRegion, getInvalidRegionError } from '../../../utils/aws/s3-regions.js';
import { checkUserQuota } from '../shared/analytics.new.js';
import { incrementQuota } from '../../../utils/quota-manager.js';

// � REDIS METRICS: Single source of truth
import { updateRequestMetrics } from '../shared/metrics.helper.js';

/**
 * Get S3 object metadata
 */
export const getS3Metadata = async (req, res) => {
    const requestId = `meta_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    let apiKeyId;

    try {
        const {
            key,
            s3AccessKey,
            s3SecretKey,
            s3Bucket,
            s3Region = 'us-east-1',
            versionId
        } = req.body;

        apiKeyId = req.apiKeyId;
        const userId = req.userId || apiKeyId;

        if (!apiKeyId) {
            return res.status(401).json(formatS3Error(
                'UNAUTHORIZED',
                'API key is required'
            ));
        }

        // VALIDATION
        if (!key) {
            return res.status(400).json(formatS3Error(
                'MISSING_KEY',
                'S3 object key is required',
                'Provide the key parameter (e.g., "upl123_photo.jpg")'
            ));
        }

        if (!s3AccessKey || !s3SecretKey || !s3Bucket) {
            return res.status(400).json(formatS3Error(
                'MISSING_S3_CREDENTIALS',
                'S3 credentials are required: s3AccessKey, s3SecretKey, s3Bucket'
            ));
        }

        const credValidation = validateS3Credentials(s3AccessKey, s3SecretKey, s3Bucket, s3Region);
        if (!credValidation.valid) {
            return res.status(400).json({
                success: false,
                provider: 's3',
                ...credValidation
            });
        }

        if (!isValidRegion(s3Region)) {
            const regionError = getInvalidRegionError(s3Region);
            return res.status(400).json({
                success: false,
                provider: 's3',
                ...regionError
            });
        }

        // QUOTA CHECK
        const quotaCheck = await checkUserQuota(userId);
        if (!quotaCheck.allowed) {
            return res.status(429).json(formatS3Error(
                'QUOTA_EXCEEDED',
                'Monthly quota exceeded'
            ));
        }

        // AWS API CALL
        const apiCallStart = Date.now();
        const s3Client = getS3Client(s3Region, s3AccessKey, s3SecretKey);

        const commandParams = {
            Bucket: s3Bucket,
            Key: key
        };

        if (versionId) {
            commandParams.VersionId = versionId;
        }

        const command = new HeadObjectCommand(commandParams);
        const result = await s3Client.send(command);

        const apiCallTime = Date.now() - apiCallStart;
        const totalTime = Date.now() - startTime;

        // FORMAT METADATA
        const metadata = {
            key,
            size: result.ContentLength,
            sizeFormatted: formatBytes(result.ContentLength),
            contentType: result.ContentType,
            lastModified: result.LastModified.toISOString(),
            etag: result.ETag,
            versionId: result.VersionId || null,
            storageClass: result.StorageClass || 'STANDARD',
            encryption: {
                serverSideEncryption: result.ServerSideEncryption || 'NONE',
                kmsKeyId: result.SSEKMSKeyId || null,
                bucketKeyEnabled: result.BucketKeyEnabled || false
            },
            expiration: result.Expiration || null,
            expirationDate: result.Expiration ? parseExpirationDate(result.Expiration) : null,
            cacheControl: result.CacheControl || null,
            contentDisposition: result.ContentDisposition || null,
            contentEncoding: result.ContentEncoding || null,
            contentLanguage: result.ContentLanguage || null,
            customMetadata: result.Metadata || {},
            objectLock: {
                mode: result.ObjectLockMode || null,
                retainUntilDate: result.ObjectLockRetainUntilDate?.toISOString() || null,
                legalHoldStatus: result.ObjectLockLegalHoldStatus || null
            },
            checksums: {
                crc32: result.ChecksumCRC32 || null,
                crc32c: result.ChecksumCRC32C || null,
                sha1: result.ChecksumSHA1 || null,
                sha256: result.ChecksumSHA256 || null
            },
            partsCount: result.PartsCount || null,
            websiteRedirectLocation: result.WebsiteRedirectLocation || null,
            restore: result.Restore || null
        };

        // 🚀 SINGLE METRICS CALL (Redis-backed)
        updateRequestMetrics(apiKeyId, userId, 's3', true)
            .catch(() => { });

        console.log(`[${requestId}] ✅ S3 metadata: ${key} (${result.ContentLength} bytes) in ${totalTime}ms`);

        const response = {
            success: true,
            metadata,
            provider: 's3',
            region: s3Region,
            hint: 'File metadata retrieved without downloading the file',
            savings: {
                dataTransfer: `Saved ${formatBytes(result.ContentLength)} of data transfer`,
                speedImprovement: `~${Math.round(result.ContentLength / 1024 / 1024 / 10)}× faster than downloading`
            },
            performance: {
                requestId,
                totalTime: `${totalTime}ms`,
                apiCallTime: `${apiCallTime}ms`
            }
        };

        res.status(200).json(response);
        incrementQuota(userId, 1).catch(() => { });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`[${requestId}] 💥 S3 metadata error after ${totalTime}ms:`, error);

        if (error.name === 'NotFound' || error.name === 'NoSuchKey' || error.message.includes('NotFound')) {
            return res.status(404).json(formatS3Error(
                'FILE_NOT_FOUND',
                `File not found: ${req.body.key}`,
                'Check the key parameter and ensure the file exists'
            ));
        }

        if (error.name === 'AccessDenied' || error.message.includes('AccessDenied')) {
            return res.status(403).json(formatS3Error(
                'ACCESS_DENIED',
                'No permission to read file metadata',
                'Check your IAM permissions (need s3:GetObject)'
            ));
        }

        if (apiKeyId) {
            updateRequestMetrics(apiKeyId, req.userId || apiKeyId, 's3', false)
                .catch(() => { });
        }

        return res.status(500).json(formatS3Error(
            'S3_METADATA_ERROR',
            'Failed to get file metadata',
            process.env.NODE_ENV === 'development' ? error.message : null
        ));
    }
};

/**
 * Parse S3 expiration header
 */
function parseExpirationDate(expirationHeader) {
    try {
        const match = expirationHeader.match(/expiry-date="([^"]+)"/);
        return match ? new Date(match[1]).toISOString() : null;
    } catch {
        return null;
    }
}

/**
 * Format bytes to human-readable format
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
