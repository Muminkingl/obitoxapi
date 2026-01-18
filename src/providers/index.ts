/**
 * Storage Providers Module
 * 
 * Central export point for all storage provider implementations.
 * 
 * @module providers
 */

// Base provider
export { BaseProvider, ProviderRegistry } from './base.provider';
export type { IStorageProvider, IProviderRegistry, ProviderFactory } from './base.provider';

// Vercel provider
export { VercelProvider } from './vercel';
export type {
    VercelUploadOptions,
    VercelDeleteOptions,
    VercelDownloadOptions,
} from './vercel';

// Supabase provider
export { SupabaseProvider } from './supabase';
export type {
    SupabaseUploadOptions,
    SupabaseDeleteOptions,
    SupabaseDownloadOptions,
    SupabaseListBucketsOptions,
    SupabaseBucketInfo,
} from './supabase';

// Uploadcare provider
export { UploadcareProvider, buildOptimizedUploadcareUrl, isImageFile } from './uploadcare';
export type {
    UploadcareUploadOptions,
    UploadcareDeleteOptions,
    UploadcareDownloadOptions,
    ImageOptimizationOptions,
    MalwareScanOptions,
    MalwareScanResults,
} from './uploadcare';

// R2 provider
export { R2Provider } from './r2';
export type {
    R2UploadOptions,
    R2BatchUploadOptions,
    R2DeleteOptions,
    R2BatchDeleteOptions,
    R2DownloadOptions,
    R2AccessTokenOptions,
    R2ListOptions,
    R2UploadResponse,
    R2BatchUploadResponse,
    R2DownloadResponse,
    R2AccessTokenResponse,
    R2ListResponse,
    R2BatchDeleteResponse,
} from './r2';

// S3 provider
export { S3Provider } from './s3';
export type {
    S3UploadOptions,
    S3MultipartUploadOptions,
    S3DeleteOptions,
    S3BatchDeleteOptions,
    S3DownloadOptions,
    S3ListOptions,
    S3MetadataOptions,
    S3UploadResponse,
    S3MultipartInitResponse,
    S3DownloadResponse,
    S3DeleteResponse,
    S3BatchDeleteResponse,
    S3ListResponse,
    S3MetadataResponse,
} from './s3';
