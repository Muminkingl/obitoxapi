/**
 * File Validator Utility
 * 
 * Magic bytes detection and file validation for server-side validation.
 * CRITICAL: Files never hit the backend - client reads first 8 bytes and sends them!
 * 
 * @module file-validator
 */

// ============================================================================
// MAGIC BYTES MAP - File signatures for type detection
// ============================================================================

const MAGIC_BYTES_MAP = {
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
    'application/x-zip-compressed': {
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
    'audio/mp3': {
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

    // Documents
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
    'application/vnd.ms-excel': {
        bytes: [0xD0, 0xCF, 0x11, 0xE0],
        minBytes: 4,
        signature: 'XLS (OLE)'
    },
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
        bytes: [0x50, 0x4B, 0x03, 0x04],
        minBytes: 4,
        signature: 'XLSX (ZIP)'
    },

    // Text
    'text/plain': {
        bytes: null, // No magic bytes - always allow if no other match
        minBytes: 0,
        signature: 'Plain Text'
    },
    'text/html': {
        bytes: [0x3C, 0x68, 0x74, 0x6D],
        minBytes: 4,
        signature: 'HTML'
    },
    'application/json': {
        bytes: [0x7B, 0x0A, 0x09], // {\n\t
        minBytes: 3,
        signature: 'JSON'
    },
};

// ============================================================================
// DANGEROUS EXTENSIONS - Always blocked
// ============================================================================

const DANGEROUS_EXTENSIONS = [
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
    'lnk', 'ini', 'sys', 'drv', 'fon', 'ttf', 'otf',
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get file extension from filename
 * @param {string} filename - The filename
 * @returns {string} The extension (lowercase, without dot)
 */
function getFileExtension(filename) {
    if (!filename || typeof filename !== 'string') {
        return '';
    }
    const parts = filename.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

/**
 * Check if extension is dangerous
 * @param {string} filename - The filename
 * @returns {boolean} True if extension is dangerous
 */
function isDangerousExtension(filename) {
    const ext = getFileExtension(filename);
    return DANGEROUS_EXTENSIONS.includes(ext);
}

/**
 * Sanitize filename - remove dangerous characters
 * @param {string} filename - The filename to sanitize
 * @returns {string} Sanitized filename
 */
function sanitizeFilename(filename) {
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
 * Check for suspicious filename patterns
 * @param {string} filename - The filename to check
 * @returns {Object} { isSuspicious: boolean, reason?: string }
 */
function checkSuspiciousFilename(filename) {
    if (!filename || typeof filename !== 'string') {
        return { isSuspicious: true, reason: 'Invalid filename' };
    }

    // Double extensions (common trick)
    const ext = getFileExtension(filename);
    if (ext && filename.split('.').length > 2) {
        const baseWithoutExt = filename.replace(/\.[^.]+$/, '');
        const secondExt = getFileExtension(baseWithoutExt);
        if (secondExt) {
            // Check if double extension is suspicious
            const suspiciousDoubles = ['jpg', 'jpeg', 'png', 'gif', 'pdf'];
            if (suspiciousDoubles.includes(ext) && DANGEROUS_EXTENSIONS.includes(secondExt)) {
                return { isSuspicious: true, reason: 'Double extension detected' };
            }
        }
    }

    // Path traversal patterns
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return { isSuspicious: true, reason: 'Path traversal pattern detected' };
    }

    // Null bytes
    if (filename.includes('\0')) {
        return { isSuspicious: true, reason: 'Null byte detected' };
    }

    return { isSuspicious: false };
}

// ============================================================================
// MAGIC BYTES DETECTION
// ============================================================================

/**
 * Detect MIME type from magic bytes
 * @param {number[]} magicBytes - Array of bytes (e.g., [0xFF, 0xD8, 0xFF])
 * @returns {Object} { detectedType: string|null, signature: string|null }
 */
function detectMimeType(magicBytes) {
    if (!magicBytes || !Array.isArray(magicBytes) || magicBytes.length === 0) {
        return { detectedType: null, signature: null };
    }

    // Normalize bytes (handle both numbers and hex strings)
    const bytes = magicBytes.map(b => {
        if (typeof b === 'number') return b;
        if (typeof b === 'string' && b.startsWith('0x')) {
            return parseInt(b, 16);
        }
        return b;
    });

    // Check each signature
    for (const [mimeType, signature] of Object.entries(MAGIC_BYTES_MAP)) {
        if (!signature.bytes) continue; // Skip types without magic bytes

        const minBytes = signature.minBytes || signature.bytes.length;

        if (bytes.length >= minBytes) {
            // Check if magic bytes match
            const matches = signature.bytes.every((byte, index) => bytes[index] === byte);

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
 * @param {string} declaredType - The declared MIME type from client
 * @param {string} detectedType - The detected MIME type from magic bytes
 * @returns {boolean} True if types match or detected is more specific
 */
function typesMatch(declaredType, detectedType) {
    if (!declaredType || !detectedType) return true;
    if (declaredType === detectedType) return true;

    // Handle common variations
    const declaredBase = declaredType.split('/')[0];
    const detectedBase = detectedType.split('/')[0];

    // Allow base type match for audio/video
    if (declaredBase === detectedBase &&
        ['audio', 'video'].includes(declaredBase)) {
        return true;
    }

    return false;
}

// ============================================================================
// MAIN VALIDATION FUNCTION
// ============================================================================

/**
 * Validate file metadata (with optional magic bytes from client)
 * 
 * @param {Object} options - Validation options
 * @param {string} options.filename - The filename
 * @param {string} options.contentType - The declared content type
 * @param {number} options.fileSize - The file size in bytes
 * @param {number[]} [options.magicBytes] - Optional first bytes from client (Array)
 * @param {Object} [options.validation] - Validation rules
 * @param {number} [options.validation.maxSizeMB] - Maximum file size in MB
 * @param {number} [options.validation.minSizeKB] - Minimum file size in KB
 * @param {string[]} [options.validation.allowedTypes] - Allowed MIME types
 * @param {string[]} [options.validation.allowedExtensions] - Allowed extensions
 * @param {boolean} [options.validation.blockExecutables] - Block dangerous files
 * @param {boolean} [options.validation.sanitizeFilename] - Sanitize filename
 * @param {boolean} [options.validation.strictMagicBytes] - Require type match
 * @returns {Object} Validation result
 */
function validateFileMetadata(options) {
    const {
        filename,
        contentType,
        fileSize,
        magicBytes = null,
        validation = {}
    } = options;

    // Parse validation options with defaults
    const {
        maxSizeMB = null,
        minSizeKB = 0,
        allowedTypes = [],
        allowedExtensions = [],
        blockExecutables = true,
        sanitizeFilename: shouldSanitize = true,
        strictMagicBytes = false
    } = validation;

    const errors = [];
    const warnings = [];

    // =========================================================================
    // 1. VALIDATE REQUIRED FIELDS
    // =========================================================================

    if (!filename) {
        errors.push({
            code: 'MISSING_FILENAME',
            message: 'Filename is required'
        });
    }

    if (!contentType) {
        errors.push({
            code: 'MISSING_CONTENT_TYPE',
            message: 'Content type is required'
        });
    }

    if (fileSize === undefined || fileSize === null) {
        errors.push({
            code: 'MISSING_FILE_SIZE',
            message: 'File size is required'
        });
    }

    if (errors.length > 0) {
        return {
            valid: false,
            errors,
            checks: { basic: { passed: false } }
        };
    }

    // =========================================================================
    // 2. FILE SIZE VALIDATION
    // =========================================================================

    const fileSizeMB = fileSize / (1024 * 1024);
    const fileSizeKB = fileSize / 1024;

    // Maximum size check
    if (maxSizeMB !== null && fileSize > maxSizeMB * 1024 * 1024) {
        errors.push({
            code: 'FILE_TOO_LARGE',
            message: `File too large: ${fileSizeMB.toFixed(2)}MB. Maximum allowed: ${maxSizeMB}MB`,
            actualSizeMB: parseFloat(fileSizeMB.toFixed(2)),
            maxSizeMB
        });
    }

    // Minimum size check
    if (minSizeKB > 0 && fileSize < minSizeKB * 1024) {
        errors.push({
            code: 'FILE_TOO_SMALL',
            message: `File too small: ${fileSizeKB.toFixed(2)}KB. Minimum allowed: ${minSizeKB}KB`,
            actualSizeKB: parseFloat(fileSizeKB.toFixed(2)),
            minSizeKB
        });
    }

    // =========================================================================
    // 3. DANGEROUS EXTENSIONS CHECK
    // =========================================================================

    if (blockExecutables && isDangerousExtension(filename)) {
        const ext = getFileExtension(filename);
        errors.push({
            code: 'DANGEROUS_FILE_TYPE',
            message: `Dangerous file type detected: .${ext} files are not allowed`,
            extension: ext,
            suggestion: 'Upload a different file format'
        });
    }

    // =========================================================================
    // 4. MAGIC BYTES VALIDATION (if provided)
    // =========================================================================

    let detectedMimeType = null;
    let detectedSignature = null;
    let magicBytesProvided = false;

    if (magicBytes && Array.isArray(magicBytes) && magicBytes.length > 0) {
        magicBytesProvided = true;
        const detection = detectMimeType(magicBytes);
        detectedMimeType = detection.detectedType;
        detectedSignature = detection.signature;

        if (detectedMimeType) {
            // Check if detected type is allowed
            if (allowedTypes.length > 0 && !allowedTypes.includes(detectedMimeType)) {
                errors.push({
                    code: 'INVALID_MIME_TYPE',
                    message: `File type not allowed. Detected: "${detectedMimeType}"`,
                    detectedMimeType,
                    declaredType: contentType,
                    allowedTypes
                });
            }

            // Check for type mismatch
            if (strictMagicBytes && !typesMatch(contentType, detectedMimeType)) {
                errors.push({
                    code: 'TYPE_MISMATCH',
                    message: `Declared type "${contentType}" doesn't match detected type "${detectedMimeType}"`,
                    detectedMimeType,
                    declaredType: contentType,
                    signature: detectedSignature
                });
            }
        } else {
            // Magic bytes didn't match known type
            if (strictMagicBytes) {
                errors.push({
                    code: 'UNKNOWN_FILE_TYPE',
                    message: 'File type could not be detected from magic bytes',
                    declaredType: contentType,
                    suggestion: 'Upload a standard file format'
                });
            } else {
                warnings.push({
                    code: 'UNKNOWN_DETECTED_TYPE',
                    message: 'Could not verify file type from magic bytes',
                    declaredType: contentType
                });
            }
        }
    } else {
        // No magic bytes provided - validate declared type only
        if (allowedTypes.length > 0 && !allowedTypes.includes(contentType)) {
            errors.push({
                code: 'INVALID_CONTENT_TYPE',
                message: `Declared content type "${contentType}" not allowed`,
                declaredType: contentType,
                allowedTypes,
                suggestion: 'Add magic bytes for better type detection'
            });
        }
    }

    // =========================================================================
    // 5. EXTENSION VALIDATION
    // =========================================================================

    const extension = getFileExtension(filename);

    if (allowedExtensions.length > 0 && extension && !allowedExtensions.includes(extension)) {
        errors.push({
            code: 'INVALID_EXTENSION',
            message: `File extension ".${extension}" not allowed`,
            extension,
            allowedExtensions
        });
    }

    // =========================================================================
    // 6. FILENAME SANITIZATION & VALIDATION
    // =========================================================================

    let sanitizedFilename = filename;
    const suspicious = checkSuspiciousFilename(filename);

    if (shouldSanitize) {
        sanitizedFilename = sanitizeFilename(filename);

        if (sanitizedFilename !== filename) {
            warnings.push({
                code: 'FILENAME_SANITIZED',
                message: 'Filename was sanitized',
                originalFilename: filename,
                sanitizedFilename
            });
        }
    }

    if (suspicious.isSuspicious && blockExecutables) {
        errors.push({
            code: 'SUSPICIOUS_FILENAME',
            message: `Filename contains suspicious patterns: ${suspicious.reason}`,
            originalFilename: filename,
            suggestion: 'Rename the file and try again'
        });
    }

    // =========================================================================
    // 7. RETURN RESULT
    // =========================================================================

    const typeCheckPassed = !errors.some(e =>
        e.code === 'INVALID_MIME_TYPE' ||
        e.code === 'TYPE_MISMATCH' ||
        e.code === 'INVALID_CONTENT_TYPE' ||
        e.code === 'UNKNOWN_FILE_TYPE'
    );

    const sizeCheckPassed = !errors.some(e =>
        e.code === 'FILE_TOO_LARGE' ||
        e.code === 'FILE_TOO_SMALL'
    );

    const dangerousCheckPassed = !errors.some(e =>
        e.code === 'DANGEROUS_FILE_TYPE'
    );

    const filenameCheckPassed = !errors.some(e =>
        e.code === 'SUSPICIOUS_FILENAME'
    );

    return {
        valid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        detectedMimeType,
        detectedSignature,
        sanitizedFilename: shouldSanitize ? sanitizedFilename : undefined,
        checks: {
            size: { passed: sizeCheckPassed },
            type: { passed: typeCheckPassed },
            dangerous: { passed: dangerousCheckPassed },
            filename: { passed: filenameCheckPassed },
            magicBytes: {
                provided: magicBytesProvided,
                detected: detectedMimeType !== null,
                signature: detectedSignature
            }
        },
        metadata: {
            filename,
            extension,
            contentType,
            fileSize,
            fileSizeMB: parseFloat(fileSizeMB.toFixed(2))
        }
    };
}

// ============================================================================
// EXPORTS (ESM)
// ============================================================================

export {
    // Core functions
    validateFileMetadata,
    detectMimeType,
    sanitizeFilename,
    getFileExtension,
    isDangerousExtension,
    checkSuspiciousFilename,

    // Constants (for external use)
    MAGIC_BYTES_MAP,
    DANGEROUS_EXTENSIONS
};
