/**
 * Verify that r2.signed-url.js has the incrementQuota call
 */

import fs from 'fs';

const filePath = './controllers/providers/r2/r2.signed-url.js';
const fileContent = fs.readFileSync(filePath, 'utf8');

console.log('🔍 Checking r2.signed-url.js for incrementQuota call...\n');

// Check for the increment quota call
if (fileContent.includes('incrementQuota(req.userId || apiKeyId, 1)')) {
    console.log('✅ Found incrementQuota() call in file!');

    // Find the line number
    const lines = fileContent.split('\n');
    const lineNum = lines.findIndex(line => line.includes('incrementQuota(req.userId || apiKeyId, 1)'));

    console.log(`   Location: Line ${lineNum + 1}`);
    console.log(`   Context:`);
    console.log('   ' + lines[lineNum - 1]);
    console.log('   ' + lines[lineNum]);
    console.log('   ' + lines[lineNum + 1]);
} else {
    console.log('❌ incrementQuota() call NOT FOUND in file!');
    console.log('   The code change did not save properly.');
}

console.log('\n✅ Verification complete');
