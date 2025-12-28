/**
 * Supabase Storage Configuration
 * Provider-specific constants, limits, and settings
 */

// Bucket configuration
export const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'test';
export const PRIVATE_BUCKET = process.env.SUPABASE_PRIVATE_BUCKET || 'private';

// File size limits
export const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024; // 50MB default
export const MIN_FILE_SIZE = 1; // 1 byte minimum
export const MAX_FILES_PER_USER = parseInt(process.env.MAX_FILES_PER_USER) || 1000;
export const MAX_TOTAL_SIZE_PER_USER = parseInt(process.env.MAX_TOTAL_SIZE_PER_USER) || 1024 * 1024 * 1024; // 1GB

// Rate limiting
export const RATE_LIMIT_PER_MINUTE = parseInt(process.env.RATE_LIMIT_PER_MINUTE) || 60;
export const RATE_LIMIT_PER_HOUR = parseInt(process.env.RATE_LIMIT_PER_HOUR) || 1000;

// Allowed file types (Supabase-specific security rules)
export const ALLOWED_FILE_TYPES = [
    // Images
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'image/tiff',
    // Documents
    'application/pdf', 'text/plain', 'application/json', 'text/csv', 'application/xml', 'text/xml',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // Media
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-ms-wmv',
    'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/flac', 'audio/mpeg',
    // Archives
    'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed', 'application/x-tar',
    // Code files
    'text/javascript', 'text/css', 'text/html', 'application/javascript'
];

// Dangerous file types (security - never allow these)
export const DANGEROUS_FILE_TYPES = [
    'application/x-executable', 'application/x-dosexec', 'application/x-msdownload',
    'application/x-shockwave-flash', 'text/x-script', 'application/x-shellscript'
];

// Dangerous file extensions (security)
export const DANGEROUS_EXTENSIONS = ['exe', 'bat', 'cmd', 'com', 'pif', 'scr', 'vbs', 'js', 'jar', 'sh'];

// File size limits per type (Supabase-specific)
export const FILE_TYPE_LIMITS = {
    'image/': 20 * 1024 * 1024, // 20MB for images
    'video/': 500 * 1024 * 1024, // 500MB for videos
    'audio/': 100 * 1024 * 1024, // 100MB for audio
    'application/pdf': 50 * 1024 * 1024, // 50MB for PDFs
    'default': 25 * 1024 * 1024 // 25MB for everything else
};

// File signature validation (magic numbers)
export const VALID_FILE_SIGNATURES = {
    'FFD8FFE0': 'image/jpeg',
    'FFD8FFE1': 'image/jpeg',
    'FFD8FFDB': 'image/jpeg',
    '89504E47': 'image/png',
    '47494638': 'image/gif',
    '25504446': 'application/pdf',
    '504B0304': 'application/zip',
    '504B0506': 'application/zip',
    '504B0708': 'application/zip'
};

/**
 * Get Supabase configuration
 */
export const getSupabaseConfig = () => {
    return {
        buckets: {
            public: SUPABASE_BUCKET,
            private: PRIVATE_BUCKET
        },
        limits: {
            maxFileSize: MAX_FILE_SIZE,
            minFileSize: MIN_FILE_SIZE,
            maxFilesPerUser: MAX_FILES_PER_USER,
            maxTotalSizePerUser: MAX_TOTAL_SIZE_PER_USER,
            rateLimit: {
                perMinute: RATE_LIMIT_PER_MINUTE,
                perHour: RATE_LIMIT_PER_HOUR
            }
        },
        allowedTypes: ALLOWED_FILE_TYPES,
        dangerousTypes: DANGEROUS_FILE_TYPES
    };
};

/**
 * Format Supabase response
 */
export const formatSupabaseResponse = (data, bucket, filename, contentType) => {
    return {
        success: true,
        data: {
            url: data.path,
            fullPath: data.fullPath || `${bucket}/${filename}`,
            bucket,
            filename,
            contentType,
            uploadedAt: new Date().toISOString()
        },
        provider: 'supabase'
    };
};

/**
 * Get max allowed size for file type
 */
export const getMaxAllowedSize = (mimeType) => {
    if (!mimeType) return FILE_TYPE_LIMITS.default;

    for (const [typePrefix, limit] of Object.entries(FILE_TYPE_LIMITS)) {
        if (typePrefix !== 'default' && mimeType.startsWith(typePrefix)) {
            return limit;
        }
    }

    return FILE_TYPE_LIMITS.default;
};

/**
 * Check if file type is dangerous
 */
export const isDangerousFileType = (mimeType, extension) => {
    // Check MIME type
    if (DANGEROUS_FILE_TYPES.some(dangerous => mimeType?.includes(dangerous))) {
        return true;
    }

    // Check extension
    if (extension && DANGEROUS_EXTENSIONS.includes(extension.toLowerCase())) {
        return true;
    }

    return false;
};

/**
 * Validate file signature (magic numbers)
 */
export const validateFileSignature = (buffer, declaredType) => {
    if (!buffer || buffer.length < 4) {
        return { valid: false, warning: 'Buffer too small to validate' };
    }

    const fileSignature = buffer.slice(0, 4).toString('hex').toUpperCase();
    const detectedType = VALID_FILE_SIGNATURES[fileSignature];

    if (detectedType && detectedType !== declaredType) {
        return {
            valid: false,
            warning: `File signature suggests ${detectedType} but MIME type is ${declaredType}`
        };
    }

    return { valid: true };
};
