/**
 * Manual trigger: daily rollup for TODAY's date (for testing)
 * Usage: node scripts/trigger-daily-rollup.js
 */
import { rollupToday, rollupForDate, getStats } from '../jobs/daily-rollup-worker.js';

// Override startDailyRollupWorker auto-call — we just want the functions
// The auto-start at the bottom of that file will also fire, that's OK for testing.

console.log('🔧 Manually triggering daily rollup for TODAY...\n');

const before = Date.now();
try {
    await rollupToday();
    console.log(`\n✅ Rollup completed in ${Date.now() - before}ms`);
    console.log('📈 Stats:', getStats());
} catch (e) {
    console.error('❌ Rollup failed:', e.message);
}

process.exit(0);
