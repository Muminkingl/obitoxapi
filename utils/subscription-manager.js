/**
 * Subscription Management Helper
 * 
 * Call these functions when users upgrade/downgrade subscriptions
 * to ensure instant tier changes without waiting for cache expiry
 */

import { supabaseAdmin } from '../config/supabase.js';
import { invalidateTierCache } from '../utils/tier-cache.js';

/**
 * Upgrade user subscription
 * 
 * @param {string} userId - User UUID
 * @param {string} newTier - New tier ('free', 'pro', 'enterprise')
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function upgradeSubscription(userId, newTier) {
    try {
        console.log(`[SUBSCRIPTION] Upgrading user ${userId.substring(0, 8)}... to ${newTier}`);

        // 1. Update database
        const { error } = await supabaseAdmin
            .from('profiles')
            .update({
                subscription_tier: newTier,
                subscription_start_date: new Date().toISOString()
            })
            .eq('id', userId);

        if (error) throw error;

        // 2. Invalidate tier cache (forces immediate tier change)
        await invalidateTierCache(userId);

        console.log(`[SUBSCRIPTION] ✅ User upgraded to ${newTier} (cache invalidated)`);

        return { success: true };

    } catch (error) {
        console.error('[SUBSCRIPTION] ❌ Upgrade failed:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Downgrade user subscription
 * 
 * @param {string} userId - User UUID
 * @param {string} newTier - New tier ('free', 'pro', 'enterprise')
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function downgradeSubscription(userId, newTier) {
    try {
        console.log(`[SUBSCRIPTION] Downgrading user ${userId.substring(0, 8)}... to ${newTier}`);

        // 1. Update database
        const { error } = await supabaseAdmin
            .from('profiles')
            .update({
                subscription_tier: newTier
            })
            .eq('id', userId);

        if (error) throw error;

        // 2. Invalidate tier cache
        await invalidateTierCache(userId);

        console.log(`[SUBSCRIPTION] ✅ User downgraded to ${newTier} (cache invalidated)`);

        return { success: true };

    } catch (error) {
        console.error('[SUBSCRIPTION] ❌ Downgrade failed:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Example: How to use in your payment webhook
 */
export async function handleStripeWebhook(event) {
    if (event.type === 'checkout.session.completed') {
        const userId = event.data.object.metadata.user_id;
        const tier = event.data.object.metadata.tier; // 'pro' or 'enterprise'

        // Upgrade user and invalidate cache
        await upgradeSubscription(userId, tier);

        // ✅ Next API request will IMMEDIATELY see new tier!
    }

    if (event.type === 'customer.subscription.deleted') {
        const userId = event.data.object.metadata.user_id;

        // Downgrade to free and invalidate cache
        await downgradeSubscription(userId, 'free');
    }
}
