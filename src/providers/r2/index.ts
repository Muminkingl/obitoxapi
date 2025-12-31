/**
 * R2 Provider - Public Exports
 * 
 * Exports the R2 provider implementation and related types/utilities.
 * 
 * @module providers/r2
 */

export { R2Provider } from './r2.provider.js';
export * from './r2.utils.js';

// Re-export all R2 types from the types module
export type {
    R2UploadOptions,
    R2BatchUploadOptions,
    R2DeleteOptions,
    R2BatchDeleteOptions,
    R2DownloadOptions,
    R2AccessTokenOptions,
    R2TokenValidationResult,
    R2ListOptions,
    R2UploadResponse,
    R2BatchUploadResponse,
    R2DownloadResponse,
    R2AccessTokenResponse,
    R2ListResponse,
    R2BatchDeleteResponse,
    ExtractR2Options,
} from '../../types/r2.types.js';
