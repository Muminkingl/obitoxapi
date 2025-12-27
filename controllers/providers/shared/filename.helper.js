/**
 * Filename generation helper
 * Generates unique, sanitized filenames with timestamps and random suffixes
 */

/**
 * Generate unique filename with timestamp and random suffix
 * @param {string} originalFilename 
 * @param {string} folder - Optional folder prefix
 * @returns {string} unique filename
 */
export const generateUniqueFilename = (originalFilename, folder = '') => {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const fileExtension = originalFilename.split('.').pop();
    const baseName = originalFilename
        .replace(/\.[^/.]+$/, '') // Remove extension
        .replace(/[^a-zA-Z0-9._-]/g, '_'); // Sanitize

    const filename = `upl${timestamp}_${randomSuffix}.${baseName}.${fileExtension}`;

    return folder ? `${folder}/${filename}` : filename;
};

/**
 * Sanitize filename (remove special characters)
 * @param {string} filename 
 * @returns {string} sanitized filename
 */
export const sanitizeFilename = (filename) => {
    return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
};

/**
 * Extract file extension
 * @param {string} filename 
 * @returns {string} file extension
 */
export const getFileExtension = (filename) => {
    return filename.split('.').pop();
};

/**
 * Get base name without extension
 * @param {string} filename 
 * @returns {string} base name
 */
export const getBaseName = (filename) => {
    return filename.replace(/\.[^/.]+$/, '');
};
