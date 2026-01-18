/**
 * REDIS LUA SCRIPTS - ATOMIC OPERATIONS
 * 
 * These scripts ensure atomic operations to prevent race conditions
 * at high concurrency. All checks and updates happen in a single Redis call.
 * 
 * Performance: ~5ms vs ~50ms for multiple round-trips
 */

/**
 * Atomic Rate Limit Check + Increment
 * 
 * Performs:
 * 1. Clean old entries outside time window
 * 2. Count current requests
 * 3. Check against limit
 * 4. Add new request if under limit
 * 5. Set TTL
 * 
 * All in ONE atomic operation!
 */
export const CHECK_AND_INCREMENT_LUA = `
local key = KEYS[1]
local now = ARGV[1]
local window_start = ARGV[2]
local limit = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])

-- Clean old entries outside time window
redis.call('ZREMRANGEBYSCORE', key, 0, window_start)

-- Count current requests in window
local count = redis.call('ZCARD', key)

-- Check if over limit
if count >= limit then
    return {1, count, limit}  -- [exceeded, current, limit]
end

-- Add new request
redis.call('ZADD', key, now, now)
redis.call('EXPIRE', key, ttl)

return {0, count + 1, limit}  -- [ok, new_count, limit]
`;

/**
 * Fast Ban Status Check
 * 
 * Checks both temporary (Redis) and permanent (would need DB) bans
 * This version only checks Redis for speed
 */
export const CHECK_BAN_STATUS_LUA = `
local banned_key = KEYS[1]
local violations_key = KEYS[2]
local now = ARGV[1]

-- Check if banned
local ban_data = redis.call('GET', banned_key)
if ban_data then
    return {1, ban_data}  -- [is_banned, ban_info]
end

return {0, nil}  -- [not_banned, nil]
`;

/**
 * Track Violation + Check Threshold
 * 
 * Atomically:
 * 1. Add violation
 * 2. Clean old violations
 * 3. Count violations in window
 * 4. Return whether ban threshold reached
 */
export const TRACK_VIOLATION_LUA = `
local violations_key = KEYS[1]
local now = ARGV[1]
local window_start = ARGV[2]
local threshold = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])

-- Add new violation
redis.call('ZADD', violations_key, now, now)
redis.call('EXPIRE', violations_key, ttl)

-- Clean old violations
redis.call('ZREMRANGEBYSCORE', violations_key, 0, window_start)

-- Count violations in window
local count = redis.call('ZCARD', violations_key)

-- Return count and whether threshold exceeded
if count >= threshold then
    return {1, count}  -- [should_ban, violation_count]
end

return {0, count}  -- [ok, violation_count]
`;

/**
 * Helper function to execute Lua script
 * 
 * @param {Redis} redis - Redis client
 * @param {string} script - Lua script
 * @param {number} numKeys - Number of KEYS
 * @param  {...any} args - KEYS and ARGV
 */
export async function evalScript(redis, script, numKeys, ...args) {
    try {
        return await redis.eval(script, numKeys, ...args);
    } catch (error) {
        console.error('[Redis Lua] Script execution failed:', error.message);
        throw error;
    }
}

/**
 * Atomic rate limit check using Lua script
 * 
 * @param {Redis} redis - Redis client
 * @param {string} key - Redis key
 * @param {number} limit - Request limit
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Promise<{exceeded: boolean, current: number, limit: number}>}
 */
export async function checkRateLimitAtomic(redis, key, limit, windowMs) {
    const now = Date.now();
    const windowStart = now - windowMs;
    const ttl = Math.ceil(windowMs / 1000) * 2; // 2x window in seconds

    const [exceeded, current, maxLimit] = await evalScript(
        redis,
        CHECK_AND_INCREMENT_LUA,
        1, // numKeys
        key, // KEYS[1]
        now, // ARGV[1]
        windowStart, // ARGV[2]
        limit, // ARGV[3]
        ttl // ARGV[4]
    );

    return {
        exceeded: exceeded === 1,
        current,
        limit: maxLimit,
        percentageUsed: Math.round((current / maxLimit) * 100)
    };
}

/**
 * Fast ban check using Lua script
 * 
 * @param {Redis} redis - Redis client
 * @param {string} identifier - User/API key identifier
 * @returns {Promise<{isBanned: boolean, banInfo: object|null}>}
 */
export async function checkBanStatusFast(redis, identifier) {
    const bannedKey = `chaos:banned:${identifier}`;
    const violationsKey = `chaos:violations:${identifier}`;
    const now = Date.now();

    const [isBanned, banData] = await evalScript(
        redis,
        CHECK_BAN_STATUS_LUA,
        2,
        bannedKey,
        violationsKey,
        now
    );

    if (isBanned === 1 && banData) {
        return {
            isBanned: true,
            banInfo: JSON.parse(banData)
        };
    }

    return { isBanned: false, banInfo: null };
}

/**
 * Track violation atomically using Lua script
 * 
 * @param {Redis} redis - Redis client
 * @param {string} identifier - User/API key identifier
 * @param {number} threshold - Violations before ban
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Promise<{shouldBan: boolean, violationCount: number}>}
 */
export async function trackViolationAtomic(redis, identifier, threshold = 10, windowMs = 60000) {
    const violationsKey = `chaos:violations:${identifier}`;
    const now = Date.now();
    const windowStart = now - windowMs;
    const ttl = Math.ceil(windowMs / 1000) * 2;

    const [shouldBan, count] = await evalScript(
        redis,
        TRACK_VIOLATION_LUA,
        1,
        violationsKey,
        now,
        windowStart,
        threshold,
        ttl
    );

    return {
        shouldBan: shouldBan === 1,
        violationCount: count
    };
}
