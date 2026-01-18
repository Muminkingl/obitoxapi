import { syncQuotasToDatabase } from './jobs/sync-quotas.js';

async function runOnce() {
    console.log('🚀 Triggering manual quota sync...');
    await syncQuotasToDatabase();
    console.log('✅ Manual sync complete. Checking database is now possible.');
    process.exit(0);
}

runOnce().catch(err => {
    console.error('❌ Sync failed:', err);
    process.exit(1);
});
