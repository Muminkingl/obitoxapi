/**
 * AWS S3 Region Configuration
 * 
 * Phase 1: 8 core regions (US, EU, Asia Pacific)
 * Coverage: ~90% of enterprise use cases
 * 
 * Future phases will add:
 * - Phase 2: 10 additional regions (total 18)
 * - Phase 3: All remaining regions (30+)
 */

// ============================================================================
// PHASE 1: Core 8 Regions
// ============================================================================

export const S3_REGIONS = {
    // North America (3 regions)
    'us-east-1': {
        name: 'US East (N. Virginia)',
        country: 'US',
        continent: 'North America',
        launched: '2006',
        description: 'Default region, lowest latency for US East Coast'
    },
    'us-west-2': {
        name: 'US West (Oregon)',
        country: 'US',
        continent: 'North America',
        launched: '2011',
        description: 'Best for US West Coast, lowest cost in US'
    },
    'ca-central-1': {
        name: 'Canada (Central)',
        country: 'CA',
        continent: 'North America',
        launched: '2016',
        description: 'Canadian data residency compliance'
    },

    // Europe (2 regions)
    'eu-west-1': {
        name: 'Europe (Ireland)',
        country: 'IE',
        continent: 'Europe',
        launched: '2007',
        description: 'Best for Western Europe, GDPR compliant'
    },
    'eu-central-1': {
        name: 'Europe (Frankfurt)',
        country: 'DE',
        continent: 'Europe',
        launched: '2014',
        description: 'Best for Central Europe, Germany data residency'
    },

    // Asia Pacific (3 regions)
    'ap-south-1': {
        name: 'Asia Pacific (Mumbai)',
        country: 'IN',
        continent: 'Asia',
        launched: '2016',
        description: 'Best for India, South Asia'
    },
    'ap-southeast-1': {
        name: 'Asia Pacific (Singapore)',
        country: 'SG',
        continent: 'Asia',
        launched: '2010',
        description: 'Best for Southeast Asia, APAC hub'
    },
    'ap-northeast-1': {
        name: 'Asia Pacific (Tokyo)',
        country: 'JP',
        continent: 'Asia',
        launched: '2011',
        description: 'Best for Japan, Northeast Asia'
    },

    // ============================================================================
    // PHASE 2: Additional 10 Regions (Total: 18)
    // ============================================================================

    // North America (Additional 2 regions)
    'us-east-2': {
        name: 'US East (Ohio)',
        country: 'US',
        continent: 'North America',
        launched: '2016',
        description: 'Secondary US East region, lower cost'
    },
    'us-west-1': {
        name: 'US West (N. California)',
        country: 'US',
        continent: 'North America',
        launched: '2009',
        description: 'Secondary US West region'
    },

    // Europe (Additional 3 regions)
    'eu-west-2': {
        name: 'Europe (London)',
        country: 'GB',
        continent: 'Europe',
        launched: '2016',
        description: 'UK data residency, Brexit compliance'
    },
    'eu-west-3': {
        name: 'Europe (Paris)',
        country: 'FR',
        continent: 'Europe',
        launched: '2017',
        description: 'France data residency'
    },
    'eu-north-1': {
        name: 'Europe (Stockholm)',
        country: 'SE',
        continent: 'Europe',
        launched: '2018',
        description: 'Nordic region, sustainable energy'
    },

    // Asia Pacific (Additional 2 regions)
    'ap-northeast-2': {
        name: 'Asia Pacific (Seoul)',
        country: 'KR',
        continent: 'Asia',
        launched: '2016',
        description: 'Best for South Korea'
    },
    'ap-southeast-2': {
        name: 'Asia Pacific (Sydney)',
        country: 'AU',
        continent: 'Asia',
        launched: '2012',
        description: 'Best for Australia, New Zealand'
    },

    // Middle East (1 region)
    'me-south-1': {
        name: 'Middle East (Bahrain)',
        country: 'BH',
        continent: 'Middle East',
        launched: '2019',
        description: 'Middle East data residency'
    },

    // South America (1 region)
    'sa-east-1': {
        name: 'South America (São Paulo)',
        country: 'BR',
        continent: 'South America',
        launched: '2011',
        description: 'Latin America data residency'
    },

    // Africa (1 region)
    'af-south-1': {
        name: 'Africa (Cape Town)',
        country: 'ZA',
        continent: 'Africa',
        launched: '2020',
        description: 'Africa data residency'
    },

    // ============================================================================
    // PHASE 3: Additional 9 Regions (Total: 27 - excluding China/GovCloud)
    // ============================================================================

    // Europe (Additional 2 regions)
    'eu-south-1': {
        name: 'Europe (Milan)',
        country: 'IT',
        continent: 'Europe',
        launched: '2020',
        description: 'Italy data residency'
    },
    'eu-south-2': {
        name: 'Europe (Spain)',
        country: 'ES',
        continent: 'Europe',
        launched: '2022',
        description: 'Spain data residency'
    },

    // Asia Pacific (Additional 5 regions)
    'ap-east-1': {
        name: 'Asia Pacific (Hong Kong)',
        country: 'HK',
        continent: 'Asia',
        launched: '2019',
        description: 'Hong Kong SAR data residency'
    },
    'ap-northeast-3': {
        name: 'Asia Pacific (Osaka)',
        country: 'JP',
        continent: 'Asia',
        launched: '2021',
        description: 'Japan disaster recovery region'
    },
    'ap-south-2': {
        name: 'Asia Pacific (Hyderabad)',
        country: 'IN',
        continent: 'Asia',
        launched: '2022',
        description: 'India secondary region'
    },
    'ap-southeast-3': {
        name: 'Asia Pacific (Jakarta)',
        country: 'ID',
        continent: 'Asia',
        launched: '2021',
        description: 'Indonesia data residency'
    },
    'ap-southeast-4': {
        name: 'Asia Pacific (Melbourne)',
        country: 'AU',
        continent: 'Asia',
        launched: '2023',
        description: 'Australia secondary region'
    },

    // Middle East (Additional 2 regions)
    'me-central-1': {
        name: 'Middle East (UAE)',
        country: 'AE',
        continent: 'Middle East',
        launched: '2022',
        description: 'UAE data residency'
    },
    'il-central-1': {
        name: 'Middle East (Israel)',
        country: 'IL',
        continent: 'Middle East',
        launched: '2023',
        description: 'Israel data residency'
    }

    // Note: Skipping AWS China regions (require AWS China account):
    // - cn-north-1 (Beijing)
    // - cn-northwest-1 (Ningxia)

    // Note: Skipping US GovCloud region (requires government certification):
    // - us-gov-west-1 (AWS GovCloud)
};

// ============================================================================
// Default Region
// ============================================================================

export const DEFAULT_S3_REGION = 'us-east-1';

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Check if a region code is valid
 * 
 * @param {string} region - AWS region code (e.g., 'us-east-1')
 * @returns {boolean} True if region is supported
 * 
 * @example
 * isValidRegion('us-east-1') // true
 * isValidRegion('invalid-region') // false
 */
export function isValidRegion(region) {
    if (!region || typeof region !== 'string') {
        return false;
    }

    return region in S3_REGIONS;
}

/**
 * Get region information
 * 
 * @param {string} region - AWS region code
 * @returns {Object|null} Region info or null if invalid
 * 
 * @example
 * getRegionInfo('us-east-1')
 * // Returns: { name: 'US East (N. Virginia)', country: 'US', ... }
 */
export function getRegionInfo(region) {
    return S3_REGIONS[region] || null;
}

/**
 * Get region display name
 * 
 * @param {string} region - AWS region code
 * @returns {string} Human-readable region name
 * 
 * @example
 * getRegionName('us-east-1') // 'US East (N. Virginia)'
 * getRegionName('invalid') // 'Unknown Region'
 */
export function getRegionName(region) {
    const info = getRegionInfo(region);
    return info ? info.name : 'Unknown Region';
}

/**
 * Get all supported regions as array
 * 
 * @returns {Array} Array of region codes
 * 
 * @example
 * getSupportedRegions()
 * // Returns: ['us-east-1', 'us-west-2', 'ca-central-1', ...]
 */
export function getSupportedRegions() {
    return Object.keys(S3_REGIONS);
}

/**
 * Get regions grouped by continent
 * 
 * @returns {Object} Regions grouped by continent
 * 
 * @example
 * getRegionsByContinent()
 * // Returns: { 'North America': [...], 'Europe': [...], 'Asia': [...] }
 */
export function getRegionsByContinent() {
    const grouped = {};

    for (const [code, info] of Object.entries(S3_REGIONS)) {
        const continent = info.continent;
        if (!grouped[continent]) {
            grouped[continent] = [];
        }
        grouped[continent].push({
            code,
            name: info.name,
            country: info.country
        });
    }

    return grouped;
}

/**
 * Build S3 endpoint URL for a region
 * 
 * @param {string} bucket - S3 bucket name
 * @param {string} region - AWS region code
 * @returns {string} S3 endpoint URL
 * 
 * @example
 * getS3Endpoint('my-bucket', 'us-east-1')
 * // Returns: 'https://my-bucket.s3.us-east-1.amazonaws.com'
 */
export function getS3Endpoint(bucket, region) {
    // Validate inputs
    if (!bucket || !region) {
        throw new Error('Bucket and region are required');
    }

    if (!isValidRegion(region)) {
        throw new Error(`Invalid region: ${region}`);
    }

    // Format: https://{bucket}.s3.{region}.amazonaws.com
    return `https://${bucket}.s3.${region}.amazonaws.com`;
}

/**
 * Build S3 public URL for an object
 * 
 * @param {string} bucket - S3 bucket name
 * @param {string} region - AWS region code
 * @param {string} key - Object key (filename)
 * @returns {string} Public URL
 * 
 * @example
 * buildS3PublicUrl('my-bucket', 'us-east-1', 'photo.jpg')
 * // Returns: 'https://my-bucket.s3.us-east-1.amazonaws.com/photo.jpg'
 */
export function buildS3PublicUrl(bucket, region, key) {
    const endpoint = getS3Endpoint(bucket, region);
    return `${endpoint}/${key}`;
}

// ============================================================================
// Validation Error Formatters
// ============================================================================

/**
 * Get formatted error for invalid region
 * 
 * @param {string} region - Invalid region that was provided
 * @returns {Object} Error object with details and hint
 */
export function getInvalidRegionError(region) {
    const supportedRegions = getSupportedRegions();

    return {
        valid: false,
        error: 'INVALID_S3_REGION',
        message: `Invalid S3 region: ${region}`,
        hint: `Supported regions: ${supportedRegions.join(', ')}`,
        supportedRegions,
        docs: 'https://docs.aws.amazon.com/general/latest/gr/s3.html'
    };
}
