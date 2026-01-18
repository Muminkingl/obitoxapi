/**
 * AWS S3 Storage Class Configuration
 * 
 * Phase 1: 3 core storage classes (covers 95% of use cases)
 * - STANDARD: Hot data, frequently accessed
 * - STANDARD_IA: Warm data, infrequent access
 * - GLACIER_INSTANT_RETRIEVAL: Cold data, instant access archives
 * 
 * Future phases will add:
 * - Phase 2: ONEZONE_IA, GLACIER_FLEXIBLE_RETRIEVAL, GLACIER_DEEP_ARCHIVE, INTELLIGENT_TIERING
 */

// ============================================================================
// PHASE 1: Core 3 Storage Classes
// ============================================================================

export const S3_STORAGE_CLASSES = {
    // Hot Tier - Frequently Accessed Data
    STANDARD: {
        name: 'S3 Standard',
        tier: 'hot',
        description: 'General purpose storage for frequently accessed data',
        costPerGB: 0.023,           // $0.023/GB/month (us-east-1)
        retrievalCost: 0,            // $0/GB retrieval
        minStorageDuration: 0,       // No minimum
        retrievalTime: 'Instant',
        availability: '99.99%',
        durability: '99.999999999%', // 11 nines
        useCase: 'Active data, frequently accessed files',
        examples: [
            'Website content',
            'Mobile/web app assets',
            'Active user uploads',
            'Content distribution'
        ],
        recommended: true // Default choice
    },

    // Warm Tier - Infrequent Access
    STANDARD_IA: {
        name: 'S3 Standard - Infrequent Access (IA)',
        tier: 'warm',
        description: 'Lower cost for infrequently accessed data with instant retrieval',
        costPerGB: 0.0125,           // $0.0125/GB/month (45% cheaper than STANDARD)
        retrievalCost: 0.01,         // $0.01/GB retrieval fee
        minStorageDuration: 30,      // 30 days minimum (charged even if deleted earlier)
        retrievalTime: 'Instant',
        availability: '99.9%',
        durability: '99.999999999%',
        useCase: 'Long-lived, less frequently accessed data',
        examples: [
            'Backup files',
            'Disaster recovery data',
            'Old user data (accessed monthly)',
            'Historical records'
        ]
    },

    // Cold Tier - Archive with Instant Access
    GLACIER_INSTANT_RETRIEVAL: {
        name: 'S3 Glacier Instant Retrieval',
        tier: 'cold',
        description: 'Lowest cost archive storage with instant retrieval (milliseconds)',
        costPerGB: 0.004,            // $0.004/GB/month (83% cheaper than STANDARD!)
        retrievalCost: 0.03,         // $0.03/GB retrieval fee
        minStorageDuration: 90,      // 90 days minimum
        retrievalTime: 'Instant (milliseconds)',
        availability: '99.9%',
        durability: '99.999999999%',
        useCase: 'Rarely accessed archive data that needs instant retrieval',
        examples: [
            'Medical imaging archives (accessed quarterly)',
            'News media archives',
            'Regulatory compliance archives',
            'User data backups (accessed 1-2x per year)'
        ]
    },

    // ============================================================================
    // PHASE 2: Additional 4 Storage Classes (Total: 7)
    // ============================================================================

    // Warm Tier - Single AZ Infrequent Access
    ONEZONE_IA: {
        name: 'S3 One Zone - Infrequent Access',
        tier: 'warm',
        description: 'Infrequent access stored in single AZ (20% cheaper than Standard-IA)',
        costPerGB: 0.01,             // $0.01/GB/month (57% cheaper than STANDARD)
        retrievalCost: 0.01,         // $0.01/GB retrieval fee
        minStorageDuration: 30,      // 30 days minimum
        retrievalTime: 'Instant',
        availability: '99.5%',       // Lower (single AZ)
        durability: '99.999999999%',
        useCase: 'Secondary backups, reproducible data',
        examples: [
            'Secondary backup copies',
            'Easily reproducible data',
            'Thumbnail images',
            'Non-critical archives'
        ]
    },

    // Cold Tier - Flexible Retrieval (Minutes to Hours)
    GLACIER_FLEXIBLE_RETRIEVAL: {
        name: 'S3 Glacier Flexible Retrieval',
        tier: 'cold',
        description: 'Archive storage with configurable retrieval times (minutes to hours)',
        costPerGB: 0.0036,           // $0.0036/GB/month (84% cheaper than STANDARD)
        retrievalCost: 0.02,         // $0.02/GB retrieval (varies by speed)
        minStorageDuration: 90,      // 90 days minimum
        retrievalTime: '1-5 minutes (Expedited) to 3-5 hours (Standard)',
        availability: '99.99%',
        durability: '99.999999999%',
        useCase: 'Long-term backups accessed 1-2 times per year',
        examples: [
            'Annual compliance archives',
            'Historical data backups',
            'Long-term media archives',
            'Disaster recovery archives'
        ]
    },

    // Cold Tier - Deep Archive (Lowest Cost)
    GLACIER_DEEP_ARCHIVE: {
        name: 'S3 Glacier Deep Archive',
        tier: 'cold',
        description: 'Lowest cost storage class for long-term retention (12-hour retrieval)',
        costPerGB: 0.00099,          // $0.00099/GB/month (96% cheaper than STANDARD!)
        retrievalCost: 0.02,         // $0.02/GB retrieval
        minStorageDuration: 180,     // 180 days minimum (6 months)
        retrievalTime: '12 hours (Standard), 48 hours (Bulk)',
        availability: '99.99%',
        durability: '99.999999999%',
        useCase: 'Compliance archives with 7-10 year retention requirements',
        examples: [
            'Regulatory compliance (HIPAA, FINRA)',
            'Legal document retention',
            'Financial records (7+ years)',
            'Tax records archival'
        ]
    },

    // Auto Tier - Intelligent Cost Optimization
    INTELLIGENT_TIERING: {
        name: 'S3 Intelligent-Tiering',
        tier: 'auto',
        description: 'Automatically moves objects between access tiers based on usage patterns',
        costPerGB: 0.023,            // Same as STANDARD + $0.0025 monitoring fee
        retrievalCost: 0,            // No retrieval fees
        minStorageDuration: 0,       // No minimum
        retrievalTime: 'Instant',
        availability: '99.9%',
        durability: '99.999999999%',
        useCase: 'Unknown or changing access patterns',
        examples: [
            'Data lakes with unpredictable access',
            'User-generated content',
            'Analytics data with varying query patterns',
            'Machine learning datasets'
        ],
        monitoring: {
            fee: 0.0025,             // $0.0025 per 1,000 objects
            tiers: [
                'Frequent Access (automatic)',
                'Infrequent Access (30 days)',
                'Archive Instant Access (90 days)',
                'Archive Access (90-270 days)',
                'Deep Archive Access (180-730 days)'
            ]
        }
    }
};

// ============================================================================
// Default Storage Class
// ============================================================================

export const DEFAULT_STORAGE_CLASS = 'STANDARD';

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Check if storage class is valid
 * 
 * @param {string} storageClass - Storage class name
 * @returns {boolean} True if storage class is supported
 * 
 * @example
 * isValidStorageClass('STANDARD') // true
 * isValidStorageClass('INVALID') // false
 */
export function isValidStorageClass(storageClass) {
    if (!storageClass || typeof storageClass !== 'string') {
        return false;
    }

    return storageClass in S3_STORAGE_CLASSES;
}

/**
 * Get storage class information
 * 
 * @param {string} storageClass - Storage class name
 * @returns {Object|null} Storage class info or null if invalid
 * 
 * @example
 * getStorageClassInfo('STANDARD')
 * // Returns: { name: 'S3 Standard', tier: 'hot', ... }
 */
export function getStorageClassInfo(storageClass) {
    return S3_STORAGE_CLASSES[storageClass] || null;
}

/**
 * Get all supported storage classes as array
 * 
 * @returns {Array} Array of storage class names
 * 
 * @example
 * getSupportedStorageClasses()
 * // Returns: ['STANDARD', 'STANDARD_IA', 'GLACIER_INSTANT_RETRIEVAL']
 */
export function getSupportedStorageClasses() {
    return Object.keys(S3_STORAGE_CLASSES);
}

/**
 * Get storage classes grouped by tier
 * 
 * @returns {Object} Storage classes grouped by tier (hot, warm, cold)
 * 
 * @example
 * getStorageClassesByTier()
 * // Returns: { hot: [...], warm: [...], cold: [...] }
 */
export function getStorageClassesByTier() {
    const grouped = {
        hot: [],
        warm: [],
        cold: []
    };

    for (const [className, info] of Object.entries(S3_STORAGE_CLASSES)) {
        grouped[info.tier].push({
            className,
            name: info.name,
            costPerGB: info.costPerGB,
            retrievalCost: info.retrievalCost
        });
    }

    return grouped;
}

/**
 * Calculate estimated monthly cost
 * 
 * @param {string} storageClass - Storage class name
 * @param {number} sizeGB - Storage size in GB
 * @param {number} retrievalsGB - Expected retrievals per month in GB (default: 0)
 * @returns {Object} Cost breakdown
 * 
 * @example
 * calculateCost('STANDARD_IA', 100, 10)
 * // Returns: { 
 * //   storageCost: 1.25, 
 * //   retrievalCost: 0.10, 
 * //   totalCost: 1.35 
 * // }
 */
export function calculateCost(storageClass, sizeGB, retrievalsGB = 0) {
    const info = getStorageClassInfo(storageClass);

    if (!info) {
        throw new Error(`Invalid storage class: ${storageClass}`);
    }

    const storageCost = sizeGB * info.costPerGB;
    const retrievalCost = retrievalsGB * info.retrievalCost;
    const totalCost = storageCost + retrievalCost;

    return {
        storageClass,
        sizeGB,
        retrievalsGB,
        storageCost: parseFloat(storageCost.toFixed(2)),
        retrievalCost: parseFloat(retrievalCost.toFixed(2)),
        totalCost: parseFloat(totalCost.toFixed(2)),
        currency: 'USD',
        period: 'month'
    };
}

/**
 * Recommend storage class based on access pattern
 * 
 * @param {number} accessesPerMonth - Expected accesses per month
 * @param {number} sizeGB - Storage size in GB
 * @returns {Object} Recommendation with reasoning
 * 
 * @example
 * recommendStorageClass(100, 50) // Frequent access
 * // Returns: { recommended: 'STANDARD', reason: '...' }
 */
export function recommendStorageClass(accessesPerMonth, sizeGB) {
    // Frequent access (>30/month)
    if (accessesPerMonth > 30) {
        return {
            recommended: 'STANDARD',
            reason: 'Frequent access pattern - STANDARD is most cost-effective',
            estimatedCost: calculateCost('STANDARD', sizeGB, sizeGB * (accessesPerMonth / 30))
        };
    }

    // Infrequent access (4-30/month)
    if (accessesPerMonth >= 4) {
        return {
            recommended: 'STANDARD_IA',
            reason: 'Infrequent but regular access - IA balances storage and retrieval costs',
            estimatedCost: calculateCost('STANDARD_IA', sizeGB, sizeGB * (accessesPerMonth / 30))
        };
    }

    // Rare access (<4/month)
    return {
        recommended: 'GLACIER_INSTANT_RETRIEVAL',
        reason: 'Rare access pattern - Glacier offers 83% storage cost savings',
        estimatedCost: calculateCost('GLACIER_INSTANT_RETRIEVAL', sizeGB, sizeGB * (accessesPerMonth / 30))
    };
}

// ============================================================================
// Validation Error Formatters
// ============================================================================

/**
 * Get formatted error for invalid storage class
 * 
 * @param {string} storageClass - Invalid storage class that was provided
 * @returns {Object} Error object with details and hint
 */
export function getInvalidStorageClassError(storageClass) {
    const supportedClasses = getSupportedStorageClasses();
    const classesByTier = getStorageClassesByTier();

    return {
        valid: false,
        error: 'INVALID_STORAGE_CLASS',
        message: `Invalid S3 storage class: ${storageClass}`,
        hint: `Supported storage classes: ${supportedClasses.join(', ')}`,
        supportedClasses,
        classesByTier,
        docs: 'https://aws.amazon.com/s3/storage-classes/'
    };
}
