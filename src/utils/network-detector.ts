/**
 * Network Information Detector Utility
 * 
 * Provides automatic network information detection using the Navigator.connection API
 * for smart presigned URL expiry calculation.
 * 
 * @module network-detector
 */

/**
 * Network information interface for smart expiry
 */
export interface NetworkInfo {
    /** Network type: 'slow-2g' | '2g' | '3g' | '4g' | 'wifi' | 'unknown' */
    effectiveType?: string;
    /** Actual download speed in Mbps (if available) */
    downlink?: number;
    /** Round-trip time in ms */
    rtt?: number;
}

/**
 * Check if running in browser environment
 */
export function isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof navigator !== 'undefined';
}

/**
 * Get network information from browser
 * Falls back to 'unknown' if not available
 * 
 * @returns NetworkInfo object or null if not available
 */
export function getNetworkInfo(): NetworkInfo | null {
    // Check if Navigator.connection is available (Chrome, Edge, Firefox)
    if (typeof navigator !== 'undefined' && 'connection' in navigator) {
        const conn = (navigator as any).connection;
        
        return {
            effectiveType: conn.effectiveType || 'unknown',
            downlink: conn.downlink,
            rtt: conn.rtt
        };
    }
    
    return null;
}

/**
 * Create network info object with defaults
 * 
 * @param info - Optional network info to normalize
 * @returns Normalized network info or undefined
 */
export function normalizeNetworkInfo(info?: NetworkInfo | null): NetworkInfo | undefined {
    if (info === null) {
        return undefined;
    }
    
    if (!info) {
        // Auto-detect if in browser
        if (isBrowser()) {
            return getNetworkInfo() || undefined;
        }
        return undefined;
    }
    
    return {
        effectiveType: info.effectiveType || 'unknown',
        downlink: info.downlink,
        rtt: info.rtt
    };
}

/**
 * Get a human-readable label for network type
 * 
 * @param effectiveType - The effective network type
 * @returns Human-readable label
 */
export function getNetworkLabel(effectiveType?: string): string {
    const labels: Record<string, string> = {
        'slow-2g': 'Very Slow (2G)',
        '2g': 'Slow (2G)',
        '3g': 'Moderate (3G)',
        '4g': 'Fast (4G)',
        'wifi': 'WiFi',
        'unknown': 'Unknown'
    };
    
    return labels[effectiveType || 'unknown'] || 'Unknown';
}

/**
 * Estimate upload speed in bytes/second based on network type
 * 
 * @param effectiveType - The effective network type
 * @param downlink - Optional measured downlink speed in Mbps
 * @returns Estimated upload speed in bytes/second
 */
export function estimateNetworkSpeed(
    effectiveType?: string, 
    downlink?: number
): number {
    // If measured downlink is available, use it
    if (downlink && downlink > 0) {
        // Convert Mbps to bytes/second (approximate for uploads)
        return Math.floor(downlink * 125000 * 0.8); // 80% of downlink as upload speed
    }
    
    // Fall back to typical estimates based on effectiveType
    const speeds: Record<string, number> = {
        'slow-2g': 50 * 1024,      // 50 KB/s
        '2g': 150 * 1024,          // 150 KB/s
        '3g': 750 * 1024,          // 750 KB/s
        '4g': 5 * 1024 * 1024,     // 5 MB/s
        'wifi': 15 * 1024 * 1024,  // 15 MB/s
    };
    
    return speeds[effectiveType || 'unknown'] || 500 * 1024; // 500 KB/s default
}
