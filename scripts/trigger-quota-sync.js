/**
 * Manual trigger: quota sync to DB
 * Usage: node scripts/trigger-quota-sync.js
 */
import { syncQuotasToDatabase, getStats } from '../jobs/sync-quotas.js';

console.log('🔧 Manually triggering quota sync...\n');

const before = Date.now();
try {
    await syncQuotasToDatabase();
    console.log(`\n✅ Quota sync completed in ${Date.now() - before}ms`);
    console.log('📈 Stats:', getStats());
} catch (e) {
    console.error('❌ Quota sync failed:', e.message);
}

process.exit(0);
