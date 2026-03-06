Your `webhook-worker.js` already has `startHealthCheckServer()` built in! You just need to:

**1. Enable it in `ecosystem.config.cjs`** — change one line:

```javascript
// In the webhook-worker section, change:
WEBHOOK_HEALTH_SERVER: 'false'
// TO:
WEBHOOK_HEALTH_SERVER: 'true'
```

But that's just the health check on port 3001. You also need to **add the inbound webhook receiver route** to that same HTTP server. It's already there in `startHealthCheckServer()`, just add one route.

Open `jobs/webhook-worker.js` and find this block inside `startHealthCheckServer`:

```javascript
res.writeHead(404);
res.end(JSON.stringify({ error: 'Not found' }));
```

Add this **above** that 404 block:

```javascript
// Inbound webhook from Uploadcare
if (req.method === 'POST' && req.url === '/api/v1/webhooks/uploadcare/inbound') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
        try {
            const payload = JSON.parse(body);
            const webhookId = `uc_${payload.webhookId || payload.file?.key || Date.now()}`;
            const redis = await getRedisAsync();
            if (redis) {
                await redis.lpush('webhook:queue', JSON.stringify({
                    id: webhookId,
                    payload: { ...payload, provider: 'UPLOADCARE' },
                    priority: 0,
                    enqueuedAt: new Date().toISOString()
                }));
                logger.info(`[Webhook Worker] Inbound enqueued: ${webhookId}`);
                res.writeHead(200);
                res.end(JSON.stringify({ success: true, webhookId }));
            } else {
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Redis unavailable' }));
            }
        } catch (err) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
    });
    return;
}
```

**2. Change the port to 4000** (so Nginx can proxy it), update `startHealthCheckServer` call at the bottom:

```javascript
// Change:
startHealthCheckServer();
// TO:
startHealthCheckServer(4000);
```

**3. Update `ecosystem.config.cjs`:**
```javascript
WEBHOOK_HEALTH_SERVER: 'true'   // was 'false'
```

**4. On your DO server:**
```bash
cd /app/obitoxapi
# pull your changes then:
pm2 restart webhook-worker
pm2 save
```

**5. Install Nginx:**
```bash
sudo apt install nginx -y

sudo tee /etc/nginx/sites-available/webhook.obitox.dev << 'EOF'
server {
    listen 80;
    server_name webhook.obitox.dev;
    location / {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/webhook.obitox.dev /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

**6. Test:**
```bash
curl https://webhook.obitox.dev/health
# {"status":"healthy"...}
```

**7. Update your SDK** — change the webhook URL from `webhook.site/...` to:
```
https://webhook.obitox.dev/api/v1/webhooks/uploadcare/inbound
```

That's it — no new files, just edits to files you already have!