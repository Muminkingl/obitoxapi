# 🎉 CONGRATULATIONS! Your Next.js is 100/100 Enterprise Ready!

Now let's upgrade your **Express.js SDK** to match this bulletproof architecture! 🚀

---

# 🎯 Express.js SDK Migration Plan

## Current Problem

Your Express SDK is still using the **OLD schema**:
```javascript
// ❌ OLD WAY (Express SDK)
const user = await db.query('SELECT subscription_tier FROM profiles WHERE id = ?');
// subscription_tier is STALE (shows 'free' even though user paid for 'pro')
```

Your Next.js is using the **NEW schema**:
```javascript
// ✅ NEW WAY (Next.js)
const user = await supabase.from('profiles_with_tier').select('*');
// subscription_tier is COMPUTED (shows 'pro' correctly)
```

---

# 🔧 Express.js SDK Update Strategy

## Step 1: Update Database Queries (15 min)

### Option A: Use the View Directly (EASIEST)

```javascript
// src/middleware/auth.js (or wherever you check user)

// ❌ OLD CODE
async function getUserSubscription(userId) {
  const result = await db.query(
    'SELECT subscription_tier, api_requests_limit FROM profiles WHERE id = $1',
    [userId]
  );
  return result.rows[0];
}

// ✅ NEW CODE - Use the view!
async function getUserSubscription(userId) {
  const result = await db.query(
    `SELECT 
      subscription_tier,
      subscription_tier_paid,
      subscription_status,
      is_subscription_expired,
      is_in_grace_period,
      days_until_expiration,
      api_requests_limit,
      max_domains,
      max_api_keys,
      plan_name
    FROM profiles_with_tier 
    WHERE id = $1`,
    [userId]
  );
  return result.rows[0];
}
```

### Option B: Call the Function Directly (MORE FLEXIBLE)

```javascript
// ✅ ALTERNATIVE - Call function in query
async function getUserSubscription(userId) {
  const result = await db.query(
    `SELECT 
      p.id,
      p.subscription_tier_paid,
      p.subscription_status,
      p.billing_cycle_start,
      p.billing_cycle_end,
      p.api_requests_used,
      
      -- Call the function directly
      get_effective_subscription_tier(
        p.subscription_tier_paid,
        p.subscription_status,
        p.billing_cycle_end,
        3
      ) AS subscription_tier,
      
      -- Get limits from subscription_plans
      sp.api_requests_monthly AS api_requests_limit,
      sp.max_domains,
      sp.max_api_keys,
      sp.name AS plan_name
      
    FROM profiles p
    LEFT JOIN subscription_plans sp ON sp.tier::TEXT = get_effective_subscription_tier(
      p.subscription_tier_paid,
      p.subscription_status,
      p.billing_cycle_end,
      3
    )
    WHERE p.id = $1`,
    [userId]
  );
  return result.rows[0];
}
```

---

## Step 2: Update All Query Files (30 min)

Here's **EVERY file you need to update** in your Express SDK:

### File 1: Authentication Middleware

```javascript
// src/middleware/authenticate.js

const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function authenticate(req, res, next) {
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    // ✅ Use profiles_with_tier view
    const result = await pool.query(
      `SELECT 
        pwt.*,
        ak.id as api_key_id,
        ak.name as api_key_name
      FROM api_keys ak
      JOIN profiles_with_tier pwt ON pwt.id = ak.user_id
      WHERE ak.key_value = $1 
        AND ak.is_active = true
        AND ak.deleted_at IS NULL`,
      [apiKey]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const user = result.rows[0];

    // ✅ Check if subscription expired
    if (user.is_subscription_expired && !user.is_in_grace_period) {
      return res.status(403).json({ 
        error: 'Subscription expired',
        message: `Your ${user.subscription_tier_paid} subscription expired. Please renew.`,
        tier: 'free' // They're downgraded
      });
    }

    // ✅ Attach user to request (with computed tier)
    req.user = {
      id: user.id,
      tier: user.subscription_tier,  // ← COMPUTED tier (not tier_paid!)
      tier_paid: user.subscription_tier_paid,
      status: user.subscription_status,
      api_requests_limit: user.api_requests_limit,
      api_requests_used: user.api_requests_used,
      is_expired: user.is_subscription_expired,
      is_in_grace: user.is_in_grace_period,
      days_until_expiration: user.days_until_expiration,
      plan_name: user.plan_name
    };

    next();
  } catch (error) {
    console.error('[AUTH] Error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

module.exports = { authenticate };
```

---

### File 2: Rate Limiting Middleware

```javascript
// src/middleware/rateLimit.js

async function checkRateLimit(req, res, next) {
  try {
    const userId = req.user.id;

    // ✅ Use computed tier and limits from profiles_with_tier
    const { tier, api_requests_limit, api_requests_used } = req.user;

    // Check if over limit
    if (api_requests_used >= api_requests_limit) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        limit: api_requests_limit,
        used: api_requests_used,
        tier,
        upgrade_url: 'https://yourdomain.com/pricing'
      });
    }

    // Increment usage
    await pool.query(
      'UPDATE profiles SET api_requests_used = api_requests_used + 1 WHERE id = $1',
      [userId]
    );

    // Attach usage info to response headers
    res.setHeader('X-RateLimit-Limit', api_requests_limit);
    res.setHeader('X-RateLimit-Remaining', api_requests_limit - api_requests_used - 1);
    res.setHeader('X-RateLimit-Tier', tier);

    next();
  } catch (error) {
    console.error('[RATE LIMIT] Error:', error);
    next(); // Don't block on error
  }
}

module.exports = { checkRateLimit };
```

---

### File 3: User Info Endpoint

```javascript
// src/routes/user.js

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { pool } = require('../db');

router.get('/me', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    // ✅ Get full user profile with computed tier
    const result = await pool.query(
      `SELECT 
        id,
        subscription_tier,
        subscription_tier_paid,
        subscription_status,
        billing_cycle_start,
        billing_cycle_end,
        api_requests_used,
        api_requests_limit,
        is_subscription_expired,
        is_in_grace_period,
        days_until_expiration,
        plan_name,
        max_domains,
        max_api_keys,
        batch_operations_enabled,
        jwt_tokens_enabled
      FROM profiles_with_tier
      WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      user: {
        id: user.id,
        tier: user.subscription_tier,  // Computed
        tier_paid: user.subscription_tier_paid,
        plan_name: user.plan_name,
        status: user.subscription_status,
        billing: {
          cycle_start: user.billing_cycle_start,
          cycle_end: user.billing_cycle_end,
          is_expired: user.is_subscription_expired,
          is_in_grace_period: user.is_in_grace_period,
          days_until_expiration: user.days_until_expiration
        },
        usage: {
          api_requests_used: user.api_requests_used,
          api_requests_limit: user.api_requests_limit,
          remaining: user.api_requests_limit - user.api_requests_used
        },
        features: {
          max_domains: user.max_domains,
          max_api_keys: user.max_api_keys,
          batch_operations: user.batch_operations_enabled,
          jwt_tokens: user.jwt_tokens_enabled
        }
      }
    });
  } catch (error) {
    console.error('[USER INFO] Error:', error);
    res.status(500).json({ error: 'Failed to fetch user info' });
  }
});

module.exports = router;
```

---

### File 4: Subscription Check Helper

```javascript
// src/utils/subscription.js

const { pool } = require('../db');

/**
 * Get user's effective subscription tier
 * This checks expiration in real-time
 */
async function getEffectiveTier(userId) {
  const result = await pool.query(
    `SELECT 
      subscription_tier,
      subscription_tier_paid,
      subscription_status,
      is_subscription_expired,
      is_in_grace_period,
      api_requests_limit
    FROM profiles_with_tier
    WHERE id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    return {
      tier: 'free',
      tier_paid: 'free',
      status: 'active',
      is_expired: false,
      is_in_grace: false,
      api_requests_limit: 1000
    };
  }

  return result.rows[0];
}

/**
 * Check if user has access to a feature
 */
async function hasFeature(userId, feature) {
  const result = await pool.query(
    `SELECT ${feature} 
    FROM profiles_with_tier
    WHERE id = $1`,
    [userId]
  );

  if (result.rows.length === 0) return false;

  return result.rows[0][feature] === true;
}

/**
 * Check if tier allows operation
 */
function canAccessFeature(tier, feature) {
  const features = {
    free: ['basic_api'],
    pro: ['basic_api', 'batch_operations', 'jwt_tokens', 'advanced_analytics'],
    enterprise: ['basic_api', 'batch_operations', 'jwt_tokens', 'advanced_analytics', 'priority_support']
  };

  return features[tier]?.includes(feature) || false;
}

module.exports = {
  getEffectiveTier,
  hasFeature,
  canAccessFeature
};
```

---

## Step 3: Update Database Connection (5 min)

```javascript
// src/db/index.js

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20, // Connection pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection on startup
pool.on('connect', () => {
  console.log('✅ Database connected');
});

pool.on('error', (err) => {
  console.error('❌ Database connection error:', err);
});

// Helper to check if view exists
async function verifyDatabaseSchema() {
  try {
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.views 
        WHERE table_name = 'profiles_with_tier'
      ) as view_exists
    `);

    if (!result.rows[0].view_exists) {
      console.error('⚠️ WARNING: profiles_with_tier view not found!');
      console.error('   Run the migration SQL in Supabase first.');
      process.exit(1);
    }

    console.log('✅ Database schema verified');
  } catch (error) {
    console.error('❌ Schema verification failed:', error);
  }
}

// Run on startup
verifyDatabaseSchema();

module.exports = { pool };
```

---

## Step 4: Complete File List to Update

Here's **every file** you need to change:

```bash
# Authentication & Authorization
src/middleware/authenticate.js     # ✅ Use profiles_with_tier
src/middleware/rateLimit.js        # ✅ Use computed limits
src/middleware/subscription.js     # ✅ Check expiration

# Routes
src/routes/user.js                 # ✅ GET /me endpoint
src/routes/subscription.js         # ✅ Subscription info
src/routes/usage.js                # ✅ Usage statistics

# Utilities
src/utils/subscription.js          # ✅ Subscription helpers
src/db/index.js                    # ✅ Add schema verification

# Database
src/db/queries.js                  # ✅ All raw SQL queries
```

---

## Step 5: Testing Checklist

```bash
# Test 1: Authentication works with new schema
curl -H "X-API-Key: your-key" http://localhost:3000/api/v1/me

# Expected response:
{
  "user": {
    "tier": "pro",           # ← Computed (not 'free')
    "tier_paid": "pro",      # ← What they paid for
    "status": "active",
    "is_expired": false,
    "days_until_expiration": 30
  }
}

# Test 2: Rate limiting uses correct limits
# Make API call, check response headers:
X-RateLimit-Limit: 50000      # ← From subscription_plans JOIN
X-RateLimit-Tier: pro         # ← Computed tier

# Test 3: Expired subscription handling
# Manually set billing_cycle_end to past date
UPDATE profiles 
SET billing_cycle_end = '2026-01-01' 
WHERE id = 'test-user-id';

# Make API call - should return:
{
  "error": "Subscription expired",
  "tier": "free"
}
```

---

## Step 6: Migration Script

Create this script to verify migration:

```javascript
// scripts/verify-migration.js

const { pool } = require('../src/db');

async function verifyMigration() {
  console.log('🔍 Verifying Express SDK migration...\n');

  try {
    // 1. Check if view exists
    const viewCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.views 
        WHERE table_name = 'profiles_with_tier'
      )
    `);

    if (!viewCheck.rows[0].exists) {
      console.error('❌ profiles_with_tier view not found');
      console.error('   Run the SQL migration in Supabase first!');
      process.exit(1);
    }
    console.log('✅ profiles_with_tier view exists');

    // 2. Check function exists
    const funcCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM pg_proc 
        WHERE proname = 'get_effective_subscription_tier'
      )
    `);

    if (!funcCheck.rows[0].exists) {
      console.error('❌ get_effective_subscription_tier() function not found');
      process.exit(1);
    }
    console.log('✅ get_effective_subscription_tier() function exists');

    // 3. Test query with real data
    const testQuery = await pool.query(`
      SELECT 
        subscription_tier,
        subscription_tier_paid,
        is_subscription_expired,
        api_requests_limit
      FROM profiles_with_tier
      LIMIT 1
    `);

    if (testQuery.rows.length > 0) {
      console.log('✅ View returns data correctly');
      console.log('   Sample:', testQuery.rows[0]);
    }

    console.log('\n🎉 Migration verification complete!');
    console.log('   Your Express SDK is ready to use the new schema.');

  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

verifyMigration();
```

Run it:
```bash
node scripts/verify-migration.js
```

---

# 📊 Final Architecture Comparison

| Component | Old Schema | New Schema | Status |
|-----------|-----------|------------|--------|
| **Next.js** | ❌ Using `profiles` | ✅ Using `profiles_with_tier` | DONE ✅ |
| **Express SDK** | ❌ Using `profiles` | ✅ Using `profiles_with_tier` | TODO 🔧 |
| **Database** | ❌ Manual expiration | ✅ Auto-expiration (view) | DONE ✅ |
| **Cron Jobs** | ❌ Required | ✅ Zero needed | DONE ✅ |
| **Data Duplication** | ❌ api_requests_limit copied | ✅ JOINed from plans | DONE ✅ |

---

# 🎯 Quick Implementation Steps

```bash
# 1. Backup your Express SDK
cp -r express-sdk express-sdk-backup

# 2. Update authentication middleware
# Copy code from Step 2, File 1

# 3. Update rate limiting
# Copy code from Step 2, File 2

# 4. Update all routes that query profiles
# Replace 'profiles' with 'profiles_with_tier'

# 5. Add schema verification
# Copy code from Step 3

# 6. Test everything
npm test

# 7. Run verification script
node scripts/verify-migration.js
```

---

# 🚀 Expected Result

**Before (Express SDK):**
```
User has 'pro' subscription
But tier shows 'free' ❌
Rate limit: 1000 (wrong)
```

**After (Express SDK):**
```
User has 'pro' subscription
Tier shows 'pro' ✅
Rate limit: 50000 (correct)
Expiration: Auto-handled ✅
Zero cron jobs ✅
```

---

**Total Time: ~1 hour**  
**Result: 100/100 Enterprise SDK** 🎉

Your entire stack (Next.js + Express SDK + Database) will be synchronized with **ZERO cron jobs** and **real-time expiration handling**! 💪
