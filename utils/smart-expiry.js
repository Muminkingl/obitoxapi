/**
 * Smart Presigned URL Expiry Calculator
 * 
 * Calculates optimal presigned URL expiry based on file size + network speed.
 * Prevents URLs from expiring mid-upload while maintaining security.
 * 
 * @module smart-expiry
 */

// ============================================================================
// NETWORK SPEED ESTIMATES (Conservative - real-world conditions)
// ============================================================================

const NETWORK_SPEEDS = {
    'slow-2g': 50 * 1024,        // 50 KB/s
    '2g': 150 * 1024,            // 150 KB/s
    '3g': 750 * 1024,            // 750 KB/s
    '4g': 5 * 1024 * 1024,       // 5 MB/s
    'wifi': 15 * 1024 * 1024,    // 15 MB/s
    'unknown': 500 * 1024         // 500 KB/s (safe default)
};

// ============================================================================
// CONSTRAINTS
// ============================================================================

const DEFAULT_CONFIG = {
    bufferMultiplier: 1.5,           // 50% buffer
    minExpirySeconds: 60,            // Minimum 1 minute
    maxExpirySeconds: 7 * 24 * 60 * 60  // Maximum 7 days (AWS S3/R2 max)
};

// ============================================================================
// FORMATTERS
// ============================================================================

/**
 * Format bytes to human-readable string
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted string (e.g., "5.0 MB")
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Format duration to human-readable string
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted string (e.g., "2m 30s" or "1h 30m")
 */
function formatDuration(seconds) {
    if (seconds < 0) return '0s';
    if (seconds < 60) return `${seconds}s`;

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    let result = '';
    if (hours > 0) {
        result += `${hours}h `;
    }
    if (minutes > 0) {
        result += `${minutes}m `;
    }
    if (secs > 0) {
        result += `${secs}s`;
    }

    return result.trim();
}

// ============================================================================
// SMART EXPIRY CALCULATOR
// ============================================================================

/**
 * Calculate optimal presigned URL expiry time
 * 
 * @param {Object} options - Calculation options
 * @param {number} options.fileSize - File size in bytes
 * @param {Object} [options.networkInfo] - Network information from client
 * @param {string} [options.networkInfo.effectiveType] - Network type (2g, 3g, 4g, wifi)
 * @param {number} [options.networkInfo.downlink] - Downlink speed in Mbps
 * @param {number} [options.bufferMultiplier] - Buffer multiplier (default: 1.5)
 * @param {number} [options.minExpirySeconds] - Minimum expiry (default: 60)
 * @param {number} [options.maxExpirySeconds] - Maximum expiry (default: 604800)
 * @returns {Object} Calculation result with expiry and reasoning
 */
function calculateSmartExpiry(options) {
    const {
        fileSize,
        networkInfo = {},
        bufferMultiplier = DEFAULT_CONFIG.bufferMultiplier,
        minExpirySeconds = DEFAULT_CONFIG.minExpirySeconds,
        maxExpirySeconds = DEFAULT_CONFIG.maxExpirySeconds
    } = options;

    // Validate inputs
    if (!fileSize || fileSize <= 0) {
        fileSize = 0;
    }

    // =========================================================================
    // 1. DETERMINE NETWORK SPEED
    // =========================================================================

    let networkType;
    let speedBytesPerSecond;

    if (networkInfo.downlink && networkInfo.downlink > 0) {
        // Use actual downlink speed (Mbps → bytes/sec)
        // downlink is in Mbps, convert to bytes/sec: Mbps * 1024 * 1024 / 8
        speedBytesPerSecond = (networkInfo.downlink * 1024 * 1024) / 8;
        networkType = networkInfo.effectiveType || 'measured';
    } else if (networkInfo.effectiveType &&
        networkInfo.effectiveType !== 'unknown' &&
        NETWORK_SPEEDS[networkInfo.effectiveType]) {
        // Use network type estimate
        networkType = networkInfo.effectiveType;
        speedBytesPerSecond = NETWORK_SPEEDS[networkInfo.effectiveType];
    } else {
        // Default to conservative estimate
        networkType = 'unknown';
        speedBytesPerSecond = NETWORK_SPEEDS.unknown;
    }

    // =========================================================================
    // 2. CALCULATE ESTIMATED UPLOAD TIME
    // =========================================================================

    const estimatedUploadTime = Math.ceil(fileSize / speedBytesPerSecond);

    // =========================================================================
    // 3. ADD BUFFER FOR NETWORK FLUCTUATIONS
    // =========================================================================

    const bufferTime = Math.ceil(estimatedUploadTime * (bufferMultiplier - 1));
    let expirySeconds = estimatedUploadTime + bufferTime;

    // =========================================================================
    // 4. APPLY MIN/MAX CONSTRAINTS
    // =========================================================================

    const originalExpiry = expirySeconds;
    expirySeconds = Math.max(minExpirySeconds, expirySeconds);
    expirySeconds = Math.min(maxExpirySeconds, expirySeconds);

    // =========================================================================
    // 5. GENERATE REASONING FOR DEBUGGING
    // =========================================================================

    const reasoning = {
        fileSize: formatBytes(fileSize),
        networkType,
        networkSpeed: formatBytes(speedBytesPerSecond) + '/s',
        estimatedUploadTime: formatDuration(estimatedUploadTime),
        bufferMultiplier: `${(bufferMultiplier * 100).toFixed(0)}%`,
        bufferTime: formatDuration(bufferTime),
        finalExpiry: formatDuration(expirySeconds),
        constraints: {
            minExpiry: formatDuration(minExpirySeconds),
            maxExpiry: formatDuration(maxExpirySeconds),
            cappedAtMin: originalExpiry < minExpirySeconds,
            cappedAtMax: originalExpiry > maxExpirySeconds
        }
    };

    // =========================================================================
    // 6. RETURN RESULT
    // =========================================================================

    return {
        expirySeconds,
        estimatedUploadTime,
        networkType,
        bufferTime,
        reasoning
    };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate expiry for a typical scenario
 * @param {number} fileSizeMB - File size in MB
 * @param {string} networkType - Network type (2g, 3g, 4g, wifi)
 * @returns {Object} Expiry info
 */
function getTypicalExpiry(fileSizeMB, networkType = '4g') {
    const fileSize = fileSizeMB * 1024 * 1024;

    return calculateSmartExpiry({
        fileSize,
        networkInfo: { effectiveType: networkType }
    });
}

/**
 * Get all network speed estimates
 * @returns {Object} Network speed map
 */
function getNetworkSpeeds() {
    const speeds = {};

    for (const [type, bytesPerSecond] of Object.entries(NETWORK_SPEEDS)) {
        speeds[type] = {
            bytesPerSecond,
            formatted: formatBytes(bytesPerSecond) + '/s',
            label: type.toUpperCase()
        };
    }

    return speeds;
}

// ============================================================================
// EXPORTS (ESM)
// ============================================================================

export {
    // Core function
    calculateSmartExpiry,

    // Helper functions
    getTypicalExpiry,
    getNetworkSpeeds,

    // Constants
    DEFAULT_CONFIG,
    NETWORK_SPEEDS,

    // Formatters (for external use)
    formatBytes,
    formatDuration
};
