/**
 * Uploadcare Provider Module
 * Enterprise-grade file management with multi-layer caching
 */

// Core operations (✅ Phase 1-4)
import { generateUploadcareSignedUrl } from './uploadcare.signed-url.js';
import { deleteUploadcareFile } from './uploadcare.delete.js';
import { downloadUploadcareFile } from './uploadcare.download.js';
import { listUploadcareFiles } from './uploadcare.list.js';

// Advanced operations
import { cancelUploadcareUpload } from './uploadcare.cancel.js';

// Malware scanning (✅ Phase 5)
import {
    scanUploadcareFileForMalware,
    checkUploadcareMalwareScanStatus,
    getUploadcareMalwareScanResults,
    removeUploadcareInfectedFile
} from './uploadcare.malware.js';

// Validation (✅ Phase 6)
import {
    validateUploadcareFile,
    validateUploadcareSvg,
    getUploadcareProjectSettings
} from './uploadcare.validation.js';

// Tracking (✅ Phase 8 - Uses NEW Redis metrics system)
import { trackUploadEvent as trackUploadcareEvent } from './uploadcare.track.js';

// Health check (✅ Phase 7)
import { uploadcareHealthCheck } from './uploadcare.health.js';

// Export all operations
export {
    // Core operations
    generateUploadcareSignedUrl,
    deleteUploadcareFile,
    downloadUploadcareFile,
    listUploadcareFiles,

    // Advanced operations
    cancelUploadcareUpload,

    // Malware scanning
    scanUploadcareFileForMalware,
    checkUploadcareMalwareScanStatus,
    getUploadcareMalwareScanResults,
    removeUploadcareInfectedFile,

    // Validation
    validateUploadcareFile,
    validateUploadcareSvg,
    getUploadcareProjectSettings,

    // Tracking (Redis metrics - NO deprecated tables)
    trackUploadcareEvent,

    // Health check
    uploadcareHealthCheck
};
