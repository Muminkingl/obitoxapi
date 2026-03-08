
---

## audit-worker.js

```javascript
// FIND:
const result = await redis.brpop('audit:queue', 1);
// CHANGE TO:
const result = await redis.brpop('audit:queue', 30);
```

```javascript
// FIND and DELETE these 3 lines:
const [dropped, overflow, failedDepth] = await Promise.all([
    redis.get('audit:dropped_count'),
    redis.get('audit:overflow_count'),
    redis.llen('audit:failed')
]);
// REPLACE WITH:
const failedDepth = await redis.llen('audit:failed');
```

```javascript
// FIND (end of startMetricsReporter setInterval):
}, 60000);
// CHANGE TO:
}, 300000);
```

---

## metrics-worker.js

```javascript
// FIND in main():
setInterval(async () => {
    await startMetricsSyncWorker();
}, SYNC_INTERVAL_MS);

// REPLACE WITH:
let metricsBackoff = 5000;
const MIN_INTERVAL = 5000;
const MAX_INTERVAL = 300000;

const adaptiveMetricsLoop = async () => {
    const result = await startMetricsSyncWorker().catch(() => null);
    const hadWork = (lifetimeStats.apiKeysProcessed > 0);
    metricsBackoff = hadWork
        ? MIN_INTERVAL
        : Math.min(metricsBackoff * 2, MAX_INTERVAL);
    setTimeout(adaptiveMetricsLoop, metricsBackoff);
};
setTimeout(adaptiveMetricsLoop, MIN_INTERVAL);
```

---

## webhook-worker.js

```javascript
// FIND:
const intervalId = setInterval(async () => {
    try {
        await runWorker();
        consecutiveErrors = 0;
    } catch (error) {
        consecutiveErrors++;
        logger.error(`[Webhook Worker] Consecutive errors: ${consecutiveErrors}`);
        if (consecutiveErrors >= maxConsecutiveErrors) {
            logger.error('[Webhook Worker] Too many errors, restarting...');
            clearInterval(intervalId);
            process.exit(1);
        }
    }
}, SYNC_INTERVAL_MS);

// REPLACE WITH:
let webhookBackoff = 5000;
const MIN_WEBHOOK_INTERVAL = 5000;
const MAX_WEBHOOK_INTERVAL = 300000;

const adaptiveWebhookLoop = async () => {
    try {
        const webhooks = await dequeueWebhooks(BATCH_SIZE);
        const hadWork = webhooks.length > 0;
        if (hadWork) {
            await runWorker();
            consecutiveErrors = 0;
            webhookBackoff = MIN_WEBHOOK_INTERVAL;
        } else {
            webhookBackoff = Math.min(webhookBackoff * 2, MAX_WEBHOOK_INTERVAL);
        }
    } catch (error) {
        consecutiveErrors++;
        logger.error(`[Webhook Worker] Consecutive errors: ${consecutiveErrors}`);
        if (consecutiveErrors >= maxConsecutiveErrors) {
            logger.error('[Webhook Worker] Too many errors, restarting...');
            process.exit(1);
        }
        webhookBackoff = MIN_WEBHOOK_INTERVAL;
    }
    setTimeout(adaptiveWebhookLoop, webhookBackoff);
};
setTimeout(adaptiveWebhookLoop, MIN_WEBHOOK_INTERVAL);
```

---
