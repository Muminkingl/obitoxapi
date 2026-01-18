/**
 * Rate Limit COOLDOWN Expiration Test (No Ban)
 * 
 * This test triggers rate limit WITHOUT crossing the ban threshold.
 * We only cause 1-2 violations, then wait for cooldown.
 */

import http from 'http';
import crypto from 'crypto';

const API_HOST = 'localhost';
const API_PORT = 3000;
const API_PATH = '/api/v1/upload/s3/signed-url';
const API_KEY = 'ox_f7dc6427f861ad84a59f8bbf46b16b5b04cea246629e96c7b11ab0bc8bc7fb66';
const API_SECRET = 'sk_2fc32a8ba44ade03ea2ff7a6c03ff2b75b9d61ee05f5a42a2e8b8c4f57dc7ad6';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function makeRequest() {
    return new Promise((resolve) => {
        const body = JSON.stringify({
            fileName: 'test.txt',
            fileType: 'text/plain'
        });

        const timestamp = Date.now();
        const signature = crypto
            .createHmac('sha256', API_SECRET)
            .update(timestamp + body)
            .digest('hex');

        const options = {
            hostname: API_HOST,
            port: API_PORT,
            path: API_PATH,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': API_KEY,
                'X-Signature': signature,
                'X-Timestamp': timestamp.toString(),
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data || '{}') });
                } catch (e) {
                    resolve({ status: res.statusCode, data: { error: data } });
                }
            });
        });

        req.on('error', (error) => {
            resolve({ status: 0, error: error.message });
        });

        req.write(body);
        req.end();
    });
}

async function runTest() {
    console.log('\n🧪 RATE LIMIT COOLDOWN EXPIRATION TEST (No Ban)');
    console.log('='.repeat(70));
    console.log('\n📌 This test only triggers 1-2 violations (NOT causing 5-min ban)');
    console.log('   Then waits for window to reset and checks cooldown expiration.\n');

    // Phase 1: Trigger rate limit with ONLY 1-2 violations (not 5!)
    console.log('📝 Phase 1: Making 11 requests to trigger 1 violation...\n');

    let hitRateLimit = false;
    for (let i = 1; i <= 11; i++) {
        const result = await makeRequest();

        if (result.data?.error === 'BANNED') {
            console.log(`\n⚠️  WARNING: User is already BANNED!`);
            console.log(`   Please wait for ban to expire before testing cooldown.`);
            console.log(`   Ban info: ${JSON.stringify(result.data.banInfo)}`);
            return;
        }

        const status = result.status === 200 ? '✅' :
            result.data?.error === 'RATE_LIMIT_EXCEEDED' ? '⚠️' : '❌';

        console.log(`${status} Request ${i}: ${result.status} - ${result.data?.error || 'SUCCESS'}`);

        if (result.data?.error === 'RATE_LIMIT_EXCEEDED') {
            hitRateLimit = true;
            console.log(`\n✅ Rate limit triggered with ${result.data.violationCount} violation(s)`);
            break; // Stop after first rate limit, don't accumulate violations
        }

        await sleep(200);
    }

    if (!hitRateLimit) {
        console.log('\n⚠️  Did not hit rate limit. Try running again.');
        return;
    }

    // Phase 2: Wait for cooldown
    console.log('\n⏳ Phase 2: Waiting 65 seconds for window to reset...');

    for (let i = 65; i > 0; i--) {
        process.stdout.write(`\r   ⏰ ${i} seconds remaining...`);
        await sleep(1000);
    }

    console.log('\n\n✅ Cooldown complete!');

    // Phase 3: Request after cooldown - should trigger expiration event
    console.log('\n📝 Phase 3: Making request AFTER cooldown...');
    console.log('   (This should trigger "Rate limit cooldown expired" event)\n');

    const result = await makeRequest();
    console.log(`   Status: ${result.status}`);
    console.log(`   Result: ${result.data?.error || 'SUCCESS'}`);

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('\n🔍 CHECK SERVER LOGS FOR THIS MESSAGE:');
    console.log('   "[rate_xxx] ✅ Rate limit cooldown expired for ox_..."');
    console.log('\n✅ If you see that message, cooldown expiration is WORKING!');
    console.log('\n📊 Also check audit_logs table:');
    console.log(`   SELECT * FROM audit_logs `);
    console.log(`   WHERE event_type = 'rate_limit_cooldown_expired'`);
    console.log(`   ORDER BY created_at DESC LIMIT 5;`);
    console.log('\n' + '='.repeat(70) + '\n');
}

runTest().catch(console.error);
