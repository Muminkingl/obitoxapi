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
