###sync quotas worker

This one is genuinely the cleanest of the four workers you've shown me. The MGET batching, overlap guard, graceful shutdown with polling wait, SCAN instead of KEYS — all correct. Honestly not much to fix here.

---

## Real Issues (only 2)

**#1 — `synced_at` called per-row inside the loop**

Same minor issue as the daily rollup:
```js
// Called for every row, each gets a slightly different timestamp
synced_at: new Date().toISOString()
```
Snapshot it once before the batch loop:
```js
const syncedAt = new Date().toISOString();
// reuse syncedAt for all rows in this run
```

**#2 — Early return on empty keys doesn't go through the normal stats path**

```js
if (keys.length === 0) {
    logger.debug('[QUOTA SYNC] No quotas to sync');
    stats.runsCompleted++;
    stats.lastRunAt = new Date().toISOString();
    stats.lastRunDurationMs = Date.now() - startTime;
    stats.lastRunSynced = 0;
    isRunning = false;  // manually set here
    return;             // bypasses the finally block
}
```

You're manually setting `isRunning = false` and duplicating stats updates instead of letting the `finally` block handle it. If you ever add more stats fields, you'll have to remember to update both places. Just remove the early return and let it fall through naturally — the loop simply won't execute if `keys.length === 0`.

---

## Things That Are Actually Fine

The shutdown polling pattern (`while (isRunning && Date.now() < deadline)`) is the right approach for this — cleaner than what the audit worker does.

The 5-minute startup delay is a thoughtful touch for reducing Redis spike on server restart.

`parseInt(value || '0', 10)` with explicit radix and NaN guard is correct.

SCAN with COUNT 500 is a reasonable chunk size for this pattern.

---

## Summary

Honestly this is the best-written worker of the four. The two issues above are both minor — the `synced_at` timestamp and the early-return code duplication. Nothing architecturally wrong here, nothing that risks data loss or correctness issues. Ship it.






### webhook worker report 
This is the most complex of the four workers, and it's mostly solid — the jitter, consecutive error tracking, health check server, lazy-loaded dependencies are all good. But there are some real issues:

---

## Real Problems

**#1 — `runWorker()` called during shutdown without overlap guard**

```js
const shutdown = async (signal) => {
    clearInterval(intervalId);
    // ...
    await runWorker(); // ⚠️ can run concurrently with an in-flight interval tick
```

There's no `isRunning` flag like your other workers. If a `runWorker()` is mid-flight when SIGTERM arrives, you now have two running simultaneously. Add the same guard you used everywhere else:

```js
let isRunning = false;

// In the interval:
if (isRunning) return;
isRunning = true;
try { await runWorker(); } finally { isRunning = false; }
```

**#2 — DB fetch inside `runWorker()` is a silent N+1 risk**

```js
const webhookIds = webhooks.map(w => w.id);
const { data: webhookRecords } = await supabaseAdmin
    .from('upload_webhooks')
    .select('*')        // ⚠️ SELECT * on every batch
    .in('id', webhookIds)
```

`SELECT *` fetches every column including potentially large payload fields on up to 200 rows every 5 seconds. Select only the columns `processWebhookBatch` actually needs. This is a network and memory cost that compounds at scale.

**#3 — `handleAutoWebhooks` does a status update without checking current state**

```js
await supabaseAdmin
    .from('upload_webhooks')
    .update({ status: 'pending' })
    .in('id', ids);
```

This blindly sets all `verifying` webhooks back to `pending` every 10 seconds. If `processWebhookBatch` is currently mid-processing one of these webhooks and has set it to another status, you just reset it. You need to add `.eq('status', 'verifying')` to the update as well, not just the select:

```js
await supabaseAdmin
    .from('upload_webhooks')
    .update({ status: 'pending' })
    .in('id', ids)
    .eq('status', 'verifying');  // only update if still verifying
```

**#4 — Lazy-loading dependencies adds complexity with no real benefit**

The dynamic `import()` in `loadDependencies()` is unusual and makes the code harder to follow. The stated reason is "handle startup errors gracefully" but if Redis or Supabase isn't available at startup, the worker can't function anyway — you `process.exit(1)` if loading fails. Normal top-level ESM imports would give you the same behavior with much less code and proper static analysis. This is worth simplifying.

---

## Minor Things

**`lastRunAt: new Date().toISOString()` inside `runWorker()`** — only set when `webhooks.length > 0` (early return skips it). So `lastRunAt` in your health check reflects last *active* run, not last *attempted* run. This is probably fine but worth knowing when reading health dashboards.

**The health check server has no authentication** — any process that can reach port 3001 can query it. Fine for internal VPS, worth noting if this is ever exposed externally.

**`consecutiveErrors` resets to 0 on any success** — so 4 errors, 1 success, 4 errors, 1 success... never triggers the restart. You might want a rolling window instead, but for MVP this is acceptable.

---

## Summary

| Issue | Priority |
|-------|----------|
| No `isRunning` guard → concurrent runs on shutdown | High |
| `SELECT *` on every batch | Medium |
| Auto-webhook update missing `.eq('status', 'verifying')` | Medium — race condition |
| Lazy dependency loading — unnecessary complexity | Low — simplify when you can |

The race condition on #3 is the sneakiest one — it's not obviously broken but it can cause webhooks to get reset mid-processing under load. Fix that one before launch.