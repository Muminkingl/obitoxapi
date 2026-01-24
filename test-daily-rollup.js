/**
 * Test Daily Rollup - Manual trigger
 * 
 * Usage: node test-daily-rollup.js
 *        node test-daily-rollup.js 2026-01-22  (specific date)
 */

// Load env FIRST before any other imports
import { config } from 'dotenv';
config({ path: '.env.local' });

// NOW import the modules that need env vars
const { rollupToday, rollupForDate } = await import('./jobs/daily-rollup-worker.js');

const args = process.argv.slice(2);

if (args[0]) {
    // Rollup specific date: node test-daily-rollup.js 2026-01-22
    console.log(`🔧 Rolling up data for: ${args[0]}`);
    await rollupForDate(args[0]);
} else {
    // Rollup today's data
    console.log(`🔧 Rolling up TODAY's data for testing`);
    await rollupToday();
}

console.log('\n✅ Done! Check your daily tables in Supabase.');
process.exit(0);
