API Keys & Secrets
We use dual-key authentication, not just bearer tokens
Most APIs give you one key and call it a day. We give you two:

API Key (public, identifies you) — ox_196aed8...
API Secret (private, signs requests) — sk_0d94df0...
The key identifies you. The secret proves it's actually you via HMAC-SHA256 signatures.

Why? Because if someone steals your API key from browser network logs, they still can't make requests without the secret.

How request signing works
Every request must include 4 headers:

X-API-Key: ox_196aed8312066f42b12566f79bc30b55ff2e3209794abc23
X-API-Secret: sk_0d94df0aa198e04f49035122063b650b5c73fa96020ac81f...
X-Signature: a3f2b9c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7
X-Timestamp: 1704672000123
Step 1: Create the signature payload

// In your code:
const method = 'POST';
const path = '/api/v1/upload/r2/signed-url';
const timestamp = Date.now(); // Current Unix timestamp in ms
const body = { filename: 'photo.jpg', ... };

// Build the message to sign:
const message = `${method.toUpperCase()}|${path}|${timestamp}|${JSON.stringify(body)}`;

// Example output:
"POST|/api/v1/upload/r2/signed-url|1704672000123|{"filename":"photo.jpg",...}"
Step 2: Sign with HMAC-SHA256

import crypto from 'crypto';

const signature = crypto
  .createHmac('sha256', API_SECRET)
  .update(message)
  .digest('hex');

// Example output:
"a3f2b9c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7"
Step 3: Send the request

const response = await fetch('https://api.obitox.com/v1/upload/r2/signed-url', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
    'X-API-Secret': API_SECRET,
    'X-Signature': signature,
    'X-Timestamp': timestamp.toString()
  },
  body: JSON.stringify(body)
});
What we do on our side:

Extract X-API-Key → Lookup your account
Extract X-API-Secret → Fetch your stored secret (hashed)
Extract X-Timestamp → Check it's within 5 minutes (prevents replay attacks)
Rebuild the message: METHOD|PATH|TIMESTAMP|BODY
Sign it with your secret → Compare to X-Signature
If signatures match → Request is authentic ✅
If not → 401 Unauthorized ❌
Why this is more secure than bearer tokens
❌ Bearer Token (most APIs):
Authorization: Bearer sk_live_abc123...
Problem: If someone intercepts this (browser DevTools, network logs, compromised proxy), they can replay it forever until you manually revoke it.
✅ HMAC Signature (us):
X-API-Key: ox_... (can be public)
X-API-Secret: sk_... (never logged, never cached)
X-Signature: a3f2b9... (unique per request)
X-Timestamp: 1704672000123 (5min window)
Why better:
Signature changes every request (includes timestamp + body)
Can't replay old requests (timestamp expires after 5 minutes)
Can't forge requests (need secret to generate valid signature)
Body tampering detected (signature includes full body)
Attack scenarios we prevent
Replay Attack:
Attacker captures your request, tries to replay it 10 minutes later.
✅ Blocked: Timestamp is ~5 minutes old → 401 Unauthorized
Man-in-the-Middle:
Attacker intercepts request, modifies body (changes filename from "safe.jpg" to "../../etc/passwd")
✅ Blocked: Signature doesn't match modified body → 401 Unauthorized
Stolen API Key (from logs):
Attacker sees X-API-Key: ox_... in browser DevTools
✅ Blocked: Without secret, can't generate valid signature → 401 Unauthorized
Brute Force Signature:
Attacker tries to guess valid signature (SHA256 has 2^256 possibilities)
✅ Blocked: Would take longer than age of universe to brute force
Key format and storage
API Key format: ox_[40 hex characters]
API Secret format: sk_[64 hex characters]

How we store them:

API Key: Stored in plaintext (needs to be looked up fast, Redis cache)
API Secret: Hashed with bcrypt (12 rounds), never stored in plaintext
What this means: If our database leaks:

Attacker gets API keys → Useless without secrets
Attacker gets hashed secrets → Can't reverse bcrypt (computationally infeasible)
You still need to rotate keys (we'll email you), but damage is minimal
Best practices (actually important)
⚠️ NEVER commit secrets to Git
Use environment variables:
// .env (gitignored!)
OBITOX_API_KEY=ox_196aed8312066f42b12566f79bc30b55ff2e3209794abc23
OBITOX_API_SECRET=sk_0d94df0aa198e04f49035122063b650b5c73fa96020ac81f...

// In your code:
const API_KEY = process.env.OBITOX_API_KEY;
const API_SECRET = process.env.OBITOX_API_SECRET;
⚠️ Use separate keys for dev/prod
Create different keys for:
Local development (ox_test_...)
Staging environment (ox_staging_...)
Production (ox_live_...)
If dev key leaks, production is safe.
⚠️ Rotate keys every 90 days
Create new key → Update environment variables → Delete old key.
We'll remind you via email 7 days before expiry.
⚠️ Revoke immediately if compromised
Dashboard → API Keys → Click "Revoke" → Takes effect in 5 minutes (cache TTL).
Better safe than sorry.
⚠️ Don't send secrets to client-side code
Bad: React app making signed requests from browser (secret exposed in JS bundle)
Good: Backend API makes signed requests, React calls your backend
Helper library (we provide this)
Don't want to write HMAC signing yourself? Use our SDK:

npm install @obitox/sdk

import { ObitoX } from '@obitox/sdk';

const client = new ObitoX({
  apiKey: process.env.OBITOX_API_KEY,
  apiSecret: process.env.OBITOX_API_SECRET
});

// SDK handles signing automatically:
const { uploadUrl } = await client.r2.getSignedUrl({
  filename: 'photo.jpg',
  r2AccessKey: '...',
  r2SecretKey: '...',
  r2Bucket: 'my-uploads'
});

// Behind the scenes:
// 1. Generates timestamp
// 2. Creates signature
// 3. Sends request with all 4 headers
// 4. Handles errors, retries, rate limits
What happens if you get it wrong
Missing X-Signature header:
401 Unauthorized: Missing signature header
Signature doesn't match:
401 Unauthorized: Invalid signature
Timestamp too old (~5 minutes):
401 Unauthorized: Request timestamp expired
Timestamp in future (clock skew):
401 Unauthorized: Request timestamp in future (check system clock)
Invalid API key:
401 Unauthorized: API key not found or revoked
All errors include a requestId for debugging. If you're stuck, email support with the request ID and we'll check our logs.