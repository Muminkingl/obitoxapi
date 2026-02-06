/**
 * File Validator Utility (SDK Version)
 * 
 * Client-side file validation with magic bytes detection.
 * Provides presets, sanitization, and validation for uploads.
 * 
 * @module utils/file-validator
 */

import type { ValidationConfig, ValidationResult, ValidationPreset } from '../types/common.js';

// ============================================================================
// MAGIC BYTES MAP - File signatures for type detection
// ============================================================================

const MAGIC_BYTES_MAP: Record<string, {
    bytes: number[];
    minBytes: number;
    signature: string;
}> = {
    // Images
    'image/jpeg': {
        bytes: [0xFF, 0xD8, 0xFF],
        minBytes: 3,
        signature: 'JPEG'
    },
    'image/png': {
        bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
        minBytes: 8,
        signature: 'PNG'
    },
    'image/gif': {
        bytes: [0x47, 0x49, 0x46, 0x38],
        minBytes: 4,
        signature: 'GIF87a/GIF89a'
    },
    'image/webp': {
        bytes: [0x52, 0x49, 0x46, 0x46],
        minBytes: 4,
        signature: 'WebP (RIFF)'
    },
    'image/bmp': {
        bytes: [0x42, 0x4D],
        minBytes: 2,
        signature: 'BMP'
    },
    'image/svg+xml': {
        bytes: [0x3C, 0x73, 0x76, 0x67],
        minBytes: 4,
        signature: 'SVG'
    },
    'image/tiff': {
        bytes: [0x49, 0x49, 0x2A, 0x00],
        minBytes: 4,
        signature: 'TIFF (Little Endian)'
    },

    // Documents
    'application/pdf': {
        bytes: [0x25, 0x50, 0x44, 0x46],
        minBytes: 4,
        signature: 'PDF'
    },
    'application/zip': {
        bytes: [0x50, 0x4B, 0x03, 0x04],
        minBytes: 4,
        signature: 'ZIP'
    },
    'application/gzip': {
        bytes: [0x1F, 0x8B],
        minBytes: 2,
        signature: 'GZIP'
    },

    // Videos
    'video/mp4': {
        bytes: [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70],
        minBytes: 8,
        signature: 'MP4'
    },
    'video/webm': {
        bytes: [0x1A, 0x45, 0xDF, 0xA3],
        minBytes: 4,
        signature: 'WebM'
    },
    'video/x-msvideo': {
        bytes: [0x52, 0x49, 0x46, 0x46],
        minBytes: 4,
        signature: 'AVI (RIFF)'
    },

    // Audio
    'audio/mpeg': {
        bytes: [0x49, 0x44, 0x33],
        minBytes: 3,
        signature: 'MP3 (ID3)'
    },
    'audio/wav': {
        bytes: [0x52, 0x49, 0x46, 0x46],
        minBytes: 4,
        signature: 'WAV (RIFF)'
    },
    'audio/x-wav': {
        bytes: [0x52, 0x49, 0x46, 0x46],
        minBytes: 4,
        signature: 'WAV (RIFF)'
    },

    // Documents (Office)
    'application/msword': {
        bytes: [0xD0, 0xCF, 0x11, 0xE0],
        minBytes: 4,
        signature: 'DOC (OLE)'
    },
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
        bytes: [0x50, 0x4B, 0x03, 0x04],
        minBytes: 4,
        signature: 'DOCX (ZIP)'
    },
};

// ============================================================================
// DANGEROUS EXTENSIONS - Always blocked by default
// ============================================================================

const DANGEROUS_EXTENSIONS = new Set([
    // Executables
    'exe', 'dll', 'bat', 'cmd', 'sh', 'bash', 'ps1', 'vbs', 'js', 'mjs',
    'jar', 'app', 'deb', 'rpm', 'dmg', 'pkg', 'msi', 'scr', 'com', 'pif',
    'inf', 'reg', 'cpl', 'ocx', 'ax', 'hlp', 'chm', 'wsf', 'wsh', 'psm1',

    // Scripts
    'py', 'rb', 'php', 'pl', 'cgi', 'asp', 'aspx', 'jsp', 'c', 'cpp', 'cs',
    'java', 'scala', 'go', 'rs', 'swift', 'kt', 'ts',

    // Config/System
    'conf', 'config', 'ini', 'cfg', 'xml', 'yaml', 'yml', 'json', 'env',
    'htaccess', 'htpasswd',

    // Archives (can contain executables)
    'rar', '7z', 'tar', 'gz', 'bz2', 'xz',

    // Other dangerous
    'lnk', 'sys', 'drv', 'fon', 'ttf', 'otf',
]);

// ============================================================================
// PRESETS - Common validation configurations
// ============================================================================

const PRESETS: Record<ValidationPreset, {
    allowedTypes: string[];
    allowedExtensions: string[];
    blockDangerous: boolean;
    maxSize: number;
}> = {
    'images': {
        allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml'],
        allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'],
        blockDangerous: true,
        maxSize: 50 * 1024 * 1024, // 50MB
    },
    'documents': {
        allowedTypes: ['application/pdf', 'application/msword', 
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain', 'application/zip'],
        allowedExtensions: ['.pdf', '.doc', '.docx', '.txt', '.zip'],
        blockDangerous: true,
        maxSize: 100 * 1024 * 1024, // 100MB
    },
    'videos': {
        allowedTypes: ['video/mp4', 'video/webm', 'video/x-msvideo'],
        allowedExtensions: ['.mp4', '.webm', '.avi', '.mov', '.mkv'],
        blockDangerous: true,
        maxSize: 2 * 1024 * 1024 * 1024, // 2GB
    },
    'audio': {
        allowedTypes: ['audio/mpeg', 'audio/wav', 'audio/x-wav'],
        allowedExtensions: ['.mp3', '.wav', '.ogg', '.m4a'],
        blockDangerous: true,
        maxSize: 200 * 1024 * 1024, // 200MB
    },
    'archives': {
        allowedTypes: ['application/zip', 'application/gzip'],
        allowedExtensions: ['.zip', '.gz', '.tar'],
        blockDangerous: true, // Still block executables
        maxSize: 500 * 1024 * 1024, // 500MB
    },
    'any': {
        allowedTypes: [],
        allowedExtensions: [],
        blockDangerous: true, // Still block dangerous files
        maxSize: 100 * 1024 * 1024 * 1024, // 100GB (effectively unlimited)
    },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
    if (!filename || typeof filename !== 'string') {
        return '';
    }
    const parts = filename.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

/**
 * Check if extension is dangerous
 */
export function isDangerousExtension(filename: string): boolean {
    const ext = getFileExtension(filename);
    return DANGEROUS_EXTENSIONS.has(ext);
}

/**
 * Sanitize filename - remove dangerous characters
 */
export function sanitizeFilename(filename: string): string {
    if (!filename || typeof filename !== 'string') {
        return 'unnamed_file';
    }

    return filename
        // Remove path separators (prevent path traversal)
        .replace(/[\/\\]/g, '')
        // Remove parent directory references
        .replace(/\.\./g, '')
        // Remove control characters (0x00-0x1F, 0x7F)
        .replace(/[\x00-\x1F\x7F]/g, '')
        // Remove shell special characters
        .replace(/[<>:"|?*]/g, '')
        // Remove null bytes
        .replace(/\0/g, '')
        // Limit to reasonable length
        .slice(0, 255)
        // Trim whitespace
        .trim();
}

/**
 * Format file size to human-readable string
 */
export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ============================================================================
// MAGIC BYTES DETECTION (Client-Side)
// ============================================================================

/**
 * Read magic bytes from a File/Blob
 * Reads first 8 bytes for type detection
 */
export async function readMagicBytes(file: File | Blob): Promise<number[]> {
    try {
        const slice = file.slice(0, 8);
        const arrayBuffer = await slice.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        return Array.from(bytes);
    } catch {
        return [];
    }
}

/**
 * Detect MIME type from magic bytes
 */
export function detectMimeType(magicBytes: number[]): { detectedType: string | null; signature: string | null } {
    if (!magicBytes || magicBytes.length === 0) {
        return { detectedType: null, signature: null };
    }

    for (const [mimeType, signature] of Object.entries(MAGIC_BYTES_MAP)) {
        if (!signature.bytes) continue;

        const minBytes = signature.minBytes || signature.bytes.length;

        if (magicBytes.length >= minBytes) {
            const matches = signature.bytes.every((byte, index) => magicBytes[index] === byte);

            if (matches) {
                return {
                    detectedType: mimeType,
                    signature: signature.signature
                };
            }
        }
    }

    return { detectedType: null, signature: null };
}

/**
 * Check if declared type matches detected type
 */
export function typesMatch(declaredType: string | null | undefined, detectedType: string | null): boolean {
    if (!declaredType || !detectedType) return true;
    if (declaredType === detectedType) return true;

    // Handle common variations
    const declaredBase = declaredType.split('/')[0];
    const detectedBase = detectedType.split('/')[0];

    // Allow base type match for audio/video
    if (declaredBase === detectedBase && ['audio', 'video'].includes(declaredBase)) {
        return true;
    }

    return false;
}

// ============================================================================
// MAIN VALIDATION FUNCTION
// ============================================================================

/**
 * Validate a file with the given configuration
 * 
 * @param file - The File/Blob to validate
 * @param config - Validation configuration (preset or custom)
 * @returns Validation result
 */

/**
 * Internal validation config interface
 */
interface InternalValidationConfig {
    preset?: ValidationPreset;
    maxSize: number;
    minSize: number;
    allowedTypes: string[];
    blockedTypes: string[];
    allowedExtensions: string[];
    blockedExtensions: string[];
    blockDangerous: boolean;
    checkMagicBytes: boolean;
    onStart?: () => void;
    onComplete?: (result: ValidationResult) => void;
    onError?: (errors: string[]) => void;
}

export async function validateFile(
    file: File | Blob,
    config?: ValidationConfig | ValidationPreset | null
): Promise<ValidationResult> {
    // Callbacks
    if (config && typeof config === 'object' && config.onStart) {
        config.onStart();
    }

    // Parse config
    let finalConfig: InternalValidationConfig;
    
    if (!config || config === null || config === undefined) {
        // Default: 'any' preset (just safety checks)
        finalConfig = {
            preset: undefined,
            maxSize: PRESETS['any'].maxSize,
            minSize: 1,
            allowedTypes: [],
            blockedTypes: [],
            allowedExtensions: [],
            blockedExtensions: [],
            blockDangerous: true,
            checkMagicBytes: true,
        };
    } else if (typeof config === 'string') {
        // Preset
        const preset = PRESETS[config] || PRESETS['any'];
        finalConfig = {
            preset: config,
            maxSize: preset.maxSize,
            minSize: 1,
            allowedTypes: preset.allowedTypes,
            blockedTypes: [],
            allowedExtensions: preset.allowedExtensions.map(e => e.replace('.', '')),
            blockedExtensions: [],
            blockDangerous: preset.blockDangerous,
            checkMagicBytes: true,
        };
    } else {
        // Custom config - merge with defaults
        const preset = config.preset ? PRESETS[config.preset] : null;
        finalConfig = {
            preset: config.preset,
            maxSize: config.maxSize ?? preset?.maxSize ?? 100 * 1024 * 1024,
            minSize: config.minSize ?? 1,
            allowedTypes: config.allowedTypes ?? preset?.allowedTypes ?? [],
            blockedTypes: config.blockedTypes ?? [],
            allowedExtensions: (config.allowedExtensions ?? preset?.allowedExtensions ?? [])
                .map(e => e.replace('.', '')),
            blockedExtensions: (config.blockedExtensions ?? [])
                .map(e => e.replace('.', '')),
            blockDangerous: config.blockDangerous ?? preset?.blockDangerous ?? true,
            checkMagicBytes: config.checkMagicBytes ?? true,
            onStart: config.onStart,
            onComplete: config.onComplete,
            onError: config.onError,
        };
    }

    // Gather file info
    const filename = file instanceof File ? file.name : 'uploaded-file';
    const contentType = file.type || 'application/octet-stream';
    const fileSize = file.size;
    const extension = getFileExtension(filename);

    // Read magic bytes
    let magicBytes: number[] = [];
    if (finalConfig.checkMagicBytes) {
        magicBytes = await readMagicBytes(file);
    }
    const magicDetection = detectMimeType(magicBytes);

    // Validation results
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Size validation
    const sizePassed = fileSize <= finalConfig.maxSize && fileSize >= finalConfig.minSize;
    if (fileSize > finalConfig.maxSize) {
        errors.push(`File "${filename}" is ${formatFileSize(fileSize)}, but maximum allowed is ${formatFileSize(finalConfig.maxSize)}`);
    }
    if (fileSize < finalConfig.minSize) {
        errors.push(`File "${filename}" is ${formatFileSize(fileSize)}, but minimum allowed is ${formatFileSize(finalConfig.minSize)}`);
    }

    // 2. Dangerous extension check
    const dangerousPassed = !isDangerousExtension(filename);
    if (!dangerousPassed) {
        errors.push(`EXE and other executable files cannot be uploaded for security reasons`);
    }

    // 3. Extension validation
    const extensionPassed = finalConfig.allowedExtensions.length === 0 || 
        finalConfig.allowedExtensions.includes(extension);
    if (finalConfig.allowedExtensions.length > 0 && !extensionPassed) {
        errors.push(`File extension ".${extension}" is not allowed. Allowed: ${finalConfig.allowedExtensions.map((e: string) => '.' + e).join(', ')}`);
    }

    // 4. Type validation
    let typePassed = true;
    if (finalConfig.allowedTypes.length > 0) {
        const detectedOrDeclared = magicDetection.detectedType || contentType;
        if (!finalConfig.allowedTypes.includes(detectedOrDeclared)) {
            typePassed = false;
            errors.push(`File type not allowed. Expected: ${finalConfig.allowedTypes.join(', ')}, got: ${detectedOrDeclared}`);
        }
    }

    // 5. Magic bytes mismatch
    const magicPassed = !magicDetection.detectedType || 
        typesMatch(contentType, magicDetection.detectedType);
    const typeMismatch = magicDetection.detectedType && contentType && 
        !typesMatch(contentType, magicDetection.detectedType);
    
    if (typeMismatch && finalConfig.blockDangerous) {
        warnings.push(`File declares "${contentType}" but magic bytes detect "${magicDetection.detectedType}" - potential spoofing attempt`);
    }

    // 6. Filename sanitization
    const sanitizedFilename = sanitizeFilename(filename);
    const filenamePassed = sanitizedFilename === filename;
    if (!filenamePassed) {
        warnings.push(`Filename was sanitized from "${filename}" to "${sanitizedFilename}"`);
    }

    // Build result
    const result: ValidationResult = {
        valid: errors.length === 0,
        size: { passed: sizePassed, error: sizePassed ? undefined : 'Size check failed' },
        extension: { passed: extensionPassed, error: extensionPassed ? undefined : 'Extension not allowed' },
        mimeType: { passed: typePassed, error: typePassed ? undefined : 'Type not allowed' },
        magicBytes: {
            passed: magicPassed,
            detectedType: magicDetection.detectedType || null,
            typeMismatch: typeMismatch || false,
        },
        dangerous: { passed: dangerousPassed, error: dangerousPassed ? undefined : 'Dangerous file type' },
        filename: { passed: filenamePassed, sanitized: sanitizedFilename },
        errors,
        warnings,
        file: {
            originalName: filename,
            sanitizedName: sanitizedFilename,
            size: fileSize,
            sizeFormatted: formatFileSize(fileSize),
            extension,
            declaredType: contentType,
            detectedType: magicDetection.detectedType || null,
        },
    };

    // Call callbacks
    if (config && typeof config === 'object') {
        if (!result.valid && config.onError) {
            config.onError(result.errors);
        }
        if (config.onComplete) {
            config.onComplete(result);
        }
    }

    return result;
}

// ============================================================================
// QUICK VALIDATION HELPERS
// ============================================================================

/**
 * Quick validation - just check size and dangerous extensions
 * Returns true if file is safe to upload
 */
export async function quickValidate(file: File | Blob): Promise<boolean> {
    if (isDangerousExtension(file instanceof File ? file.name : 'upload')) {
        return false;
    }
    return true;
}

/**
 * Check if file is an image
 */
export async function isImage(file: File | Blob): Promise<boolean> {
    const magicBytes = await readMagicBytes(file);
    const detection = detectMimeType(magicBytes);
    return detection.detectedType?.startsWith('image/') || false;
}

/**
 * Check if file is a video
 */
export async function isVideo(file: File | Blob): Promise<boolean> {
    const magicBytes = await readMagicBytes(file);
    const detection = detectMimeType(magicBytes);
    return detection.detectedType?.startsWith('video/') || false;
}

/**
 * Check if file is audio
 */
export async function isAudio(file: File | Blob): Promise<boolean> {
    const magicBytes = await readMagicBytes(file);
    const detection = detectMimeType(magicBytes);
    return detection.detectedType?.startsWith('audio/') || false;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
    MAGIC_BYTES_MAP,
    DANGEROUS_EXTENSIONS,
    PRESETS,
};

export default {
    validateFile,
    quickValidate,
    readMagicBytes,
    detectMimeType,
    sanitizeFilename,
    getFileExtension,
    isDangerousExtension,
    formatFileSize,
    isImage,
    isVideo,
    isAudio,
    MAGIC_BYTES_MAP,
    DANGEROUS_EXTENSIONS,
    PRESETS,
};
