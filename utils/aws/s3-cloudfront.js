/**
 * AWS CloudFront CDN Helpers for S3
 * 
 * CRITICAL RULES:
 * - OPTIONAL feature (zero breaking changes)
 * - ZERO network calls (pure string manipulation)
 * - NO CloudFront API calls
 * - Client provides CloudFront domain, we just format URLs
 * 
 * Why CloudFront?
 * - Faster delivery (edge locations)
 * - Lower bandwidth costs
 * - Custom domains
 * - HTTPS by default
 */

/**
 * Generate CloudFront URL for an S3 object
 * 
 * This is pure string manipulation - NO API calls!
 * 
 * @param {string} key - Object key (filename)
 * @param {string} cloudfrontDomain - CloudFront distribution domain
 * @returns {string|null} CloudFront URL or null if no domain provided
 * 
 * @example
 * // CloudFront distribution
 * getCloudFrontUrl('uploads/photo.jpg', 'd111111abcdef8.cloudfront.net')
 * // Returns: 'https://d111111abcdef8.cloudfront.net/uploads/photo.jpg'
 * 
 * // Custom domain
 * getCloudFrontUrl('uploads/photo.jpg', 'cdn.example.com')
 * // Returns: 'https://cdn.example.com/uploads/photo.jpg'
 * 
 * // No domain (optional)
 * getCloudFrontUrl('uploads/photo.jpg', null)
 * // Returns: null
 */
export function getCloudFrontUrl(key, cloudfrontDomain) {
    if (!cloudfrontDomain) {
        return null;
    }

    // Remove https:// or http:// if user included it
    const domain = cloudfrontDomain.replace(/^https?:\/\//, '');

    // Build CloudFront URL
    return `https://${domain}/${key}`;
}

/**
 * Validate CloudFront domain format
 * 
 * Accepts:
 * - CloudFront distributions: d111111abcdef8.cloudfront.net
 * - Custom domains: cdn.example.com
 * - With or without https://
 * 
 * @param {string} domain - CloudFront domain to validate
 * @returns {boolean} True if valid format
 * 
 * @example
 * isValidCloudFrontDomain('d111111abcdef8.cloudfront.net')  // true
 * isValidCloudFrontDomain('cdn.example.com')                // true
 * isValidCloudFrontDomain('https://cdn.example.com')        // true
 * isValidCloudFrontDomain('')                                // true (optional)
 * isValidCloudFrontDomain('invalid domain!')                 // false
 */
export function isValidCloudFrontDomain(domain) {
    // Empty/null is valid (optional parameter)
    if (!domain) {
        return true;
    }

    // Remove protocol if present
    const cleanDomain = domain.replace(/^https?:\/\//, '');

    // Pattern matches:
    // - CloudFront: d111111abcdef8.cloudfront.net
    // - Custom domain: cdn.example.com, static.mysite.io
    const pattern = /^([a-z0-9-]+\.cloudfront\.net|[a-z0-9-]+\.[a-z0-9-]+\.[a-z]+)$/i;

    return pattern.test(cleanDomain);
}

/**
 * Get CloudFront error response
 * Helper for validation errors
 * 
 * @param {string} domain - Invalid domain
 * @returns {Object} Error object
 */
export function getCloudFrontValidationError(domain) {
    return {
        error: 'INVALID_CLOUDFRONT_DOMAIN',
        message: `Invalid CloudFront domain format: ${domain}`,
        hint: 'Use format: d111111abcdef8.cloudfront.net or cdn.example.com',
        examples: [
            'd111111abcdef8.cloudfront.net',
            'cdn.example.com',
            'static.mysite.io'
        ]
    };
}

/**
 * Compare CloudFront vs S3 direct URLs
 * Informational helper (not used in hot path)
 * 
 * @param {string} bucket - S3 bucket name
 * @param {string} region - AWS region
 * @param {string} key - Object key
 * @param {string} cloudfrontDomain - CloudFront domain
 * @returns {Object} Comparison object
 */
export function compareUrls(bucket, region, key, cloudfrontDomain) {
    const s3Url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
    const cdnUrl = getCloudFrontUrl(key, cloudfrontDomain);

    return {
        s3Direct: s3Url,
        cloudFront: cdnUrl,
        benefits: {
            faster: 'CloudFront uses edge locations (lower latency)',
            cheaper: 'CloudFront data transfer cheaper than S3',
            https: 'HTTPS by default with custom SSL',
            customDomain: 'Use your own domain name'
        }
    };
}
