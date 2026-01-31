/**
 * ObitoX SDK Types
 * 
 * Central export point for all SDK type definitions.
 * Import types from this file for cleaner imports.
 * 
 * @module types
 * 
 * @example
 * ```typescript
 * import { ObitoXConfig, UploadOptions, SupabaseUploadOptions } from '@obitox/sdk/types';
 * ```
 */

// ============================================================================
// Common Types
// ============================================================================

export * from './common';

// ============================================================================
// Provider-Specific Types
// ============================================================================

export * from './supabase.types';
export * from './uploadcare.types';
export * from './r2.types';
export * from './s3.types';

// ============================================================================
// Unified Upload Options
// ============================================================================

import type { SupabaseUploadOptions } from './supabase.types';
import type { UploadcareUploadOptions } from './uploadcare.types';
import type { R2UploadOptions } from './r2.types';
import type { S3UploadOptions } from './s3.types';
import type { BaseUploadOptions } from './common';

/**
 * Union type of all provider upload options
 * Use this for functions that accept uploads from any provider
 */
export type UploadOptions =
    | SupabaseUploadOptions
    | UploadcareUploadOptions
    | R2UploadOptions
    | S3UploadOptions;

// ============================================================================
// Unified Delete Options
// ============================================================================

import type { SupabaseDeleteOptions } from './supabase.types';
import type { UploadcareDeleteOptions } from './uploadcare.types';
import type { R2DeleteOptions } from './r2.types';
import type { S3DeleteOptions } from './s3.types';

/**
 * Union type of all provider delete options
 */
export type DeleteFileOptions =
    | SupabaseDeleteOptions
    | UploadcareDeleteOptions
    | R2DeleteOptions
    | S3DeleteOptions;

// ============================================================================
// Unified Download Options
// ============================================================================

import type { SupabaseDownloadOptions } from './supabase.types';
import type { UploadcareDownloadOptions } from './uploadcare.types';
import type { R2DownloadOptions } from './r2.types';
import type { S3DownloadOptions } from './s3.types';

/**
 * Union type of all provider download options
 */
export type DownloadFileOptions =
    | SupabaseDownloadOptions
    | UploadcareDownloadOptions
    | R2DownloadOptions
    | S3DownloadOptions;


// ============================================================================
// List Buckets Options
// ============================================================================

import type { SupabaseListBucketsOptions } from './supabase.types';

/**
 * Bucket listing options
 * Currently only Supabase supports bucket listing
 */
export type ListBucketsOptions = SupabaseListBucketsOptions;
