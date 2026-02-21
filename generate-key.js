const crypto = require('crypto');
const key = crypto.randomBytes(16).toString('hex'); // 16 bytes = 32 hex chars
console.log(`🔑 Generated 32-char key: ${key}`);
console.log('📋 Copy this to your .env.local file as WEBHOOK_ENCRYPTION_KEY');
