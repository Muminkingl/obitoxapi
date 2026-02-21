/**
 * PM2 Ecosystem Configuration
 * 
 * Production deployment for ObitoX API background jobs
 * 
 * Jobs:
 *   1. audit-worker - Processes audit log queue (continuous)
 * 
 * Note: sync-quotas runs automatically via app.js import (hourly setInterval)
 * 
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *   pm2 startup
 */

module.exports = {
    apps: [
        // ========================
        // 🔥 AUDIT WORKER (Continuous)
        // ========================
        // Processes audit log queue from Redis → Supabase
        // Scale workers based on load (4-8 for 10K req/min)
        {
            name: 'audit-worker',
            script: 'jobs/audit-worker.js',
            instances: 1,
            exec_mode: 'fork', // Fork mode for reliable log capture
            autorestart: true,
            watch: false,
            max_memory_restart: '500M',
            env: {
                NODE_ENV: 'production'
            },
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            min_uptime: '10s',
            max_restarts: 10,
            restart_delay: 4000
        },
        // ========================
        // 🚀 METRICS WORKER (Interval)
        // ========================
        // Syncs Redis metrics to DB every 5 seconds
        // Very low CPU - single instance is enough
        {
            name: 'metrics-worker',
            script: 'jobs/metrics-worker.js',
            instances: 1,
            exec_mode: 'fork', // Single instance is fine
            autorestart: true,
            watch: false,
            max_memory_restart: '200M',
            env: {
                NODE_ENV: 'production'
            },
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            min_uptime: '10s',
            max_restarts: 10,
            restart_delay: 4000
        },
        // ========================
        // 🎣 WEBHOOK WORKER (Continuous)
        // ========================
        // Processes outgoing webhooks from Redis queue
        // Scale based on webhook volume
        {
            name: 'webhook-worker',
            script: 'jobs/webhook-worker.js',
            instances: 1,
            exec_mode: 'fork', // Fork mode for reliable log capture (only 1 instance needed)
            autorestart: true,
            watch: false,
            max_memory_restart: '300M',
            env: {
                NODE_ENV: 'production',
                WEBHOOK_HEALTH_SERVER: 'false' // Let PM2 handle health checks via process status
            },
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            min_uptime: '10s',
            max_restarts: 10,
            restart_delay: 4000
        },
        // ========================
        // 📅 DAILY ROLLUP WORKER (Cron)
        // ========================
        // Syncs Redis daily metrics to daily tables at midnight UTC
        // Runs once per day at 00:05 UTC
        {
            name: 'daily-rollup',
            script: 'jobs/daily-rollup-worker.js',
            instances: 1,
            exec_mode: 'fork',
            autorestart: false,  // Runs once, exits
            cron_restart: '5 0 * * *',  // 00:05 UTC daily
            watch: false,
            max_memory_restart: '200M',
            env: {
                NODE_ENV: 'production'
            },
            log_date_format: 'YYYY-MM-DD HH:mm:ss'
        }
    ]
};
