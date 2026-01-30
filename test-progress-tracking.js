/**
 * Test: Real Progress Tracking
 * 
 * This test verifies that the onProgress callback actually gets called
 * with real progress data during uploads.
 * 
 * Note: In Node.js, we use fetch fallback which reports 0% -> 100%
 * In Browser, XHR would report real incremental progress.
 */

import ObitoX from './dist/index.esm.js';
import dotenv from 'dotenv';
import { Blob } from 'buffer';

dotenv.config();

// Load credentials
const SUPABASE_URL = 'https://mexdnzyfjyhwqsosbizu.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1leGRuenlmanlod3Fzb3NiaXp1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjYyNDI0MSwiZXhwIjoyMDcyMjAwMjQxfQ.sKDYLS7ZnDG6kUEfrK0XR8GN_10fFx8cCIYYy3QDUo4';

// ObitoX credentials
const OBITOX_API_KEY = 'ox_a409f2a37edf23b2ea5aec559d47fc066692ad5b67f32b0a';
const OBITOX_API_SECRET = 'sk_aec7280bdbad52cc1ee27e15c647fd39f20f9f42356883d01e0e1a36ad3221e9';

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║  PROGRESS TRACKING TEST                                    ║');
console.log('║  Verifying onProgress callback is called correctly         ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

async function testProgressTracking() {
    const client = new ObitoX({
        apiKey: OBITOX_API_KEY,
        apiSecret: OBITOX_API_SECRET
    });

    // Create a larger test file (50KB) so we can see progress
    const testData = 'X'.repeat(50 * 1024);  // 50KB
    const file = new Blob([testData], { type: 'text/plain' });
    file.name = `progress-test-${Date.now()}.txt`;

    console.log(`📁 Test file size: ${(file.size / 1024).toFixed(1)} KB\n`);

    // Track all progress calls
    const progressCalls = [];
    let lastProgress = -1;

    console.log('📊 Progress Updates:');
    console.log('─'.repeat(50));

    try {
        const url = await client.uploadFile(file, {
            provider: 'SUPABASE',
            supabaseUrl: SUPABASE_URL,
            supabaseToken: SUPABASE_SERVICE_ROLE_KEY,
            bucket: 'avatars',
            onProgress: (progress, bytesUploaded, totalBytes) => {
                // Only log if progress changed (avoid duplicates)
                if (progress !== lastProgress) {
                    const bar = '█'.repeat(Math.floor(progress / 5)) + '░'.repeat(20 - Math.floor(progress / 5));
                    console.log(`   [${bar}] ${progress.toFixed(1)}% (${bytesUploaded}/${totalBytes} bytes)`);
                    lastProgress = progress;
                }

                progressCalls.push({
                    progress,
                    bytesUploaded,
                    totalBytes,
                    timestamp: Date.now()
                });
            }
        });

        console.log('─'.repeat(50));
        console.log(`\n✅ Upload completed!`);
        console.log(`   URL: ${url}\n`);

        // Analyze progress calls
        console.log('📈 Progress Analysis:');
        console.log('─'.repeat(50));
        console.log(`   Total onProgress calls: ${progressCalls.length}`);

        if (progressCalls.length > 0) {
            const firstCall = progressCalls[0];
            const lastCall = progressCalls[progressCalls.length - 1];

            console.log(`   First call: ${firstCall.progress.toFixed(1)}% (${firstCall.bytesUploaded} bytes)`);
            console.log(`   Last call:  ${lastCall.progress.toFixed(1)}% (${lastCall.bytesUploaded} bytes)`);
            console.log(`   Total bytes: ${lastCall.totalBytes}`);

            // Verify we got start and end
            const hasStart = progressCalls.some(p => p.progress === 0);
            const hasEnd = progressCalls.some(p => p.progress === 100);

            console.log(`\n   ✅ Start (0%) reported: ${hasStart}`);
            console.log(`   ✅ End (100%) reported: ${hasEnd}`);

            if (hasStart && hasEnd) {
                console.log('\n╔════════════════════════════════════════════════════════════╗');
                console.log('║  ✅ TEST PASSED - Progress tracking is working!            ║');
                console.log('╚════════════════════════════════════════════════════════════╝');

                console.log('\n📝 Note: In Node.js we use fetch fallback (0% → 100%)');
                console.log('   In Browser, XHR provides real incremental progress.\n');
            } else {
                console.log('\n❌ TEST FAILED - Progress not properly reported');
            }
        } else {
            console.log('\n❌ TEST FAILED - onProgress was never called!');
        }

        // Cleanup
        console.log('🧹 Cleaning up...');
        await client.deleteFile({
            provider: 'SUPABASE',
            fileUrl: url,
            supabaseUrl: SUPABASE_URL,
            supabaseToken: SUPABASE_SERVICE_ROLE_KEY,
            bucket: 'avatars'
        });
        console.log('   ✅ Test file deleted\n');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

testProgressTracking();
