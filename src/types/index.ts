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
 * import { ObitoXConfig, UploadOptions, VercelUploadOptions } from '@obitox/sdk/types';
 * ```
 */

// ============================================================================
// Common Types
// ============================================================================

export * from './common';

// ============================================================================
// Provider-Specific Types
// ============================================================================

export * from './vercel.types';
export * from './supabase.types';
export * from './uploadcare.types';

// ============================================================================
// Unified Upload Options
// ============================================================================

import type { VercelUploadOptions } from './vercel.types';
import type { SupabaseUploadOptions } from './supabase.types';
import type { UploadcareUploadOptions } from './uploadcare.types';
import type { BaseUploadOptions } from './common';

/**
 * Union type of all provider upload options
 * Use this for functions that accept uploads from any provider
 */
export type UploadOptions =
    | VercelUploadOptions
    | SupabaseUploadOptions
    | UploadcareUploadOptions;

// ============================================================================
// Unified Delete Options
// ============================================================================

import type { VercelDeleteOptions } from './vercel.types';
import type { SupabaseDeleteOptions } from './supabase.types';
import type { UploadcareDeleteOptions } from './uploadcare.types';

/**
 * Union type of all provider delete options
 */
export type DeleteFileOptions =
    | VercelDeleteOptions
    | SupabaseDeleteOptions
    | UploadcareDeleteOptions;

// ============================================================================
// Unified Download Options
// ============================================================================

import type { VercelDownloadOptions } from './vercel.types';
import type { SupabaseDownloadOptions } from './supabase.types';
import type { UploadcareDownloadOptions } from './uploadcare.types';

/**
 * Union type of all provider download options
 */
export type DownloadFileOptions =
    | VercelDownloadOptions
    | SupabaseDownloadOptions
    | UploadcareDownloadOptions;

// ============================================================================
// Unified Cancel Options
// ============================================================================

import type { VercelCancelOptions } from './vercel.types';
import type { SupabaseCancelOptions } from './supabase.types';
import type { UploadcareCancelOptions } from './uploadcare.types';

/**
 * Union type of all provider cancel options
 */
export type CancelUploadOptions =
    | VercelCancelOptions
    | SupabaseCancelOptions
    | UploadcareCancelOptions;

// ============================================================================
// List Buckets Options
// ============================================================================

import type { SupabaseListBucketsOptions } from './supabase.types';

/**
 * Bucket listing options
 * Currently only Supabase supports bucket listing
 */
export type ListBucketsOptions = SupabaseListBucketsOptions;
