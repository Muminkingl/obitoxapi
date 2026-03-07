/**
 * RateLimiter Durable Object
 * 
 * Handles BOTH per-minute rate limiting AND monthly quota
 * for a single user/identifier — entirely in memory.
 * 
 * Syncs quota to Redis every 15 min (or immediately on limit hit).
 */
export class RateLimiter {
    constructor(ctx, env) {
        this.ctx = ctx;
        this.env = env;

        // Per-minute rate window (sliding window)
        this.requests = []; // array of timestamps

        // Monthly quota
        this.quotaCount = 0;
        this.quotaMonth = null; // 'YYYY-MM'
        this.quotaLimit = 0;
        this.quotaLoaded = false;
        this.quotaDirty = false;

        // Ban cache (loaded from Redis once, cached here)
        this.banCache = null;
        this.banCacheLoadedAt = 0;
        this.BAN_CACHE_TTL = 60_000; // re-check Redis every 60s
    }

    async fetch(request) {
        const { identifier, tier, userId, month } = await request.json();

        try {
            // Load quota from Redis on first request or month change
            await this.ensureQuotaLoaded(userId, month, tier);

            const now = Date.now();
            const limits = this.getTierLimits(tier);

            // ── Check ban (cached, only hits Redis every 60s) ─────────────
            const banResult = await this.checkBan(identifier, userId, now);
            if (banResult) return Response.json(banResult, { status: 429 });

            // ── Check monthly quota ───────────────────────────────────────
            if (limits.requestsPerMonth !== -1 &&
                this.quotaCount >= limits.requestsPerMonth) {

                // Sync immediately so Redis is accurate when limit hit
                await this.syncQuotaToRedis(userId, month);

                return Response.json({
                    success: false,
                    error: 'QUOTA_EXCEEDED',
                    message: `Monthly quota limit reached. ${this.quotaCount}/${limits.requestsPerMonth}`,
                    hint: tier === 'free' ? 'Upgrade to PRO for 50,000 requests/month' : 'Resets next month'
                }, { status: 429 });
            }

            // ── Check per-minute rate limit (sliding window) ──────────────
            const windowStart = now - 60_000;
            // Evict old timestamps
            this.requests = this.requests.filter(ts => ts > windowStart);

            if (limits.requestsPerMinute !== -1 &&
                this.requests.length >= limits.requestsPerMinute) {

                // Track violation in Redis (non-blocking)
                this.ctx.waitUntil(this.trackViolation(identifier, userId));

                return Response.json({
                    success: false,
                    error: 'RATE_LIMIT_EXCEEDED',
                    message: `Rate limit exceeded for ${tier.toUpperCase()} tier`,
                    limit: limits.requestsPerMinute,
                    current: this.requests.length
                }, { status: 429 });
            }

            // ── Allow request ─────────────────────────────────────────────
            this.requests.push(now);
            this.quotaCount++;
            this.quotaDirty = true;

            // Persist to DO local storage to survive memory eviction before 15m alarm
            this.ctx.waitUntil(this.ctx.storage.put(`quotaCount:${month}`, this.quotaCount).catch(() => { }));
            this.ctx.waitUntil(this.ctx.storage.put(`quotaDirty:${month}`, 1).catch(() => { }));

            // Schedule 15-min sync alarm if not already scheduled
            await this.ensureAlarmScheduled();

            return Response.json({
                success: true,
                quota: {
                    current: this.quotaCount,
                    limit: limits.requestsPerMonth,
                    tier
                },
                rateLimit: {
                    current: this.requests.length,
                    limit: limits.requestsPerMinute
                }
            });

        } catch (err) {
            // Fail open — never block requests due to DO errors
            console.error('[RateLimiter DO] Error:', err.message);
            return Response.json({ success: true, failOpen: true });
        }
    }

    async getRedis() {
        if (this._redis) return this._redis;
        try {
            const { Redis } = await import('@upstash/redis');
            this._redis = new Redis({
                url: this.env.UPSTASH_REDIS_REST_URL,
                token: this.env.UPSTASH_REDIS_REST_TOKEN,
                fetch: (url, init = {}) => {
                    const { cache, ...safe } = init || {};
                    return globalThis.fetch(url, safe);
                }
            });
            return this._redis;
        } catch (err) {
            console.error('[DO] Redis init failed:', err.message);
            return null;
        }
    }

    // ── Alarm: sync quota to Redis every 15 min ───────────────────────────────
    async alarm() {
        try {
            const userId = await this.ctx.storage.get('userId');
            const month = await this.ctx.storage.get('month');

            if (!userId || !month) return;

            // If DO was evicted from memory, class properties reset. Load from storage.
            const storedDirty = await this.ctx.storage.get(`quotaDirty:${month}`);
            if (storedDirty === 1 || this.quotaDirty) {
                if (this.quotaCount === 0) {
                    const storedQuota = await this.ctx.storage.get(`quotaCount:${month}`);
                    if (storedQuota !== undefined) this.quotaCount = storedQuota;
                }

                // Only proceed if we actually have quota to sync
                if (this.quotaCount > 0) {
                    await this.syncQuotaToRedis(userId, month);
                }
            }

            // Reschedule if still active
            if (this.quotaCount > 0) {
                await this.ctx.storage.setAlarm(Date.now() + 15 * 60_000);
            }
        } catch (e) {
            console.error('[RateLimiter DO] Alarm crashed:', e.message);
        }
    }

    // ── Load quota from Redis on cold start ───────────────────────────────────
    async ensureQuotaLoaded(userId, month, tier) {
        // Already loaded for this month
        if (this.quotaLoaded && this.quotaMonth === month) return;

        // Save for alarm use
        await this.ctx.storage.put('userId', userId);
        await this.ctx.storage.put('month', month);

        this.quotaMonth = month;
        this.quotaLimit = this.getTierLimits(tier).requestsPerMonth;

        // Try to load from DO storage first (survives memory eviction)
        try {
            const storedQuota = await this.ctx.storage.get(`quotaCount:${month}`);
            if (storedQuota !== undefined) {
                const storedDirty = await this.ctx.storage.get(`quotaDirty:${month}`);
                this.quotaCount = storedQuota;
                this.quotaDirty = storedDirty === 1;
                this.quotaLoaded = true;
                return;
            }
        } catch (e) {
            console.warn('[RateLimiter DO] DO storage get failed on load:', e.message);
        }

        // Load current count from Redis (only if not found in DO storage)
        try {
            const redis = await this.getRedis();
            if (redis) {
                const stored = await redis.get(`quota:${userId}:${month}`);
                this.quotaCount = stored ? parseInt(stored, 10) : 0;
            }
        } catch (err) {
            console.error('[RateLimiter DO] Failed to load quota from Redis:', err.message);
            this.quotaCount = 0;
        }

        this.quotaLoaded = true;
    }

    // ── Sync quota count to Redis ─────────────────────────────────────────────
    async syncQuotaToRedis(userId, month) {
        try {
            const redis = await this.getRedis();
            if (!redis) return;

            const key = `quota:${userId}:${month}`;
            const pipeline = redis.pipeline();
            pipeline.set(key, this.quotaCount);
            pipeline.expire(key, 30 * 24 * 60 * 60); // 30 days TTL preserved ✅
            await pipeline.exec();

            this.quotaDirty = false;
            await this.ctx.storage.put(`quotaDirty:${month}`, 0).catch(() => { });
            console.log(`[RateLimiter DO] Synced quota ${userId}: ${this.quotaCount}`);
        } catch (err) {
            console.error('[RateLimiter DO] Sync failed:', err.message);
        }
    }

    // ── Check ban status (cached, 60s TTL) ────────────────────────────────────
    async checkBan(identifier, userId, now) {
        // Use cache if fresh
        if (this.banCache !== null && (now - this.banCacheLoadedAt) < this.BAN_CACHE_TTL) {
            return this.banCache; // null = not banned
        }

        // Refresh from Redis
        try {
            const redis = await this.getRedis();
            if (!redis) { this.banCache = null; return null; }

            const [tempBan, permBan] = await redis.mget(
                `ban:${identifier}`,
                `perm_ban:${identifier}`
            );

            this.banCacheLoadedAt = now;

            if (permBan) {
                const data = JSON.parse(permBan);
                this.banCache = {
                    success: false, error: 'BANNED',
                    message: 'Permanently banned',
                    banInfo: { level: 'PERMANENT', isPermanent: true, reason: data.reason }
                };
                return this.banCache;
            }

            if (tempBan) {
                const data = JSON.parse(tempBan);
                const remaining = Math.ceil((data.expiresAt - now) / 1000);
                if (remaining > 0) {
                    this.banCache = {
                        success: false, error: 'BANNED',
                        message: `Banned for ${data.banLevel}`,
                        banInfo: { level: data.banLevel, isPermanent: false, remainingSeconds: remaining }
                    };
                    return this.banCache;
                }
            }

            this.banCache = null; // not banned
            return null;

        } catch (err) {
            this.banCache = null;
            return null;
        }
    }

    // ── Track violation in Redis (only on rate limit hit) ─────────────────────
    async trackViolation(identifier, userId) {
        try {
            const redis = await this.getRedis();
            if (!redis) return;

            const violationsKey = `violations:${identifier}`;
            const pipeline = redis.pipeline();
            pipeline.incr(violationsKey);
            pipeline.expire(violationsKey, 7 * 24 * 60 * 60);
            await pipeline.exec();
        } catch (err) {
            console.error('[RateLimiter DO] Violation track failed:', err.message);
        }
    }

    async ensureAlarmScheduled() {
        const existing = await this.ctx.storage.getAlarm();
        if (!existing) {
            await this.ctx.storage.setAlarm(Date.now() + 15 * 60_000);
        }
    }

    getTierLimits(tier) {
        const LIMITS = {
            free: { requestsPerMinute: 10, requestsPerMonth: 1000 },
            pro: { requestsPerMinute: 100, requestsPerMonth: 50000 },
            enterprise: { requestsPerMinute: -1, requestsPerMonth: -1 }
        };
        return LIMITS[tier] || LIMITS.free;
    }
}
