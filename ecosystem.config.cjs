/**
 * PM2 Ecosystem Configuration
 * 
 * Production deployment for ObitoX API background jobs
 * 
 * Jobs:
 *   1. audit-worker - Processes audit log queue (continuous)
 * 
 * Note: sync-quotas is a standalone PM2 process (removed from app.js for CF Workers compat)
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
        {
            name: 'audit-worker',
            script: 'jobs/audit-worker.js',
            instances: 1,
            exec_mode: 'fork',
            autorestart: true,
            watch: false,
            max_memory_restart: '500M',
            // FIX: --require dotenv/config pre-loads .env.local BEFORE any ESM
            // module graph evaluates. env_file is not reliable across PM2 versions.
            node_args: '--require dotenv/config',
            env: {
                NODE_ENV: 'production',
                DOTENV_CONFIG_PATH: '.env.local'
            },
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            min_uptime: '10s',
            max_restarts: 10,
            restart_delay: 4000,
            kill_timeout: 5000
        },
        // ========================
        // 🚀 METRICS WORKER (Interval)
        // ========================
        {
            name: 'metrics-worker',
            script: 'jobs/metrics-worker.js',
            instances: 1,
            exec_mode: 'fork',
            autorestart: true,
            watch: false,
            max_memory_restart: '200M',
            node_args: '--require dotenv/config',
            env: {
                NODE_ENV: 'production',
                DOTENV_CONFIG_PATH: '.env.local'
            },
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            min_uptime: '10s',
            max_restarts: 10,
            restart_delay: 4000,
            kill_timeout: 5000
        },
        // ========================
        // 🎣 WEBHOOK WORKER (Continuous)
        // ========================
        {
            name: 'webhook-worker',
            script: 'jobs/webhook-worker.js',
            instances: 1,
            exec_mode: 'fork',
            autorestart: true,
            watch: false,
            max_memory_restart: '300M',
            node_args: '--require dotenv/config',
            env: {
                NODE_ENV: 'production',
                DOTENV_CONFIG_PATH: '.env.local',
                WEBHOOK_HEALTH_SERVER: 'true'
            },
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            min_uptime: '10s',
            max_restarts: 10,
            restart_delay: 4000,
            kill_timeout: 5000
        },
        // ========================
        // 🔄 QUOTA SYNC WORKER (Hourly)
        // ========================
        {
            name: 'sync-quotas',
            script: 'jobs/sync-quotas.js',
            instances: 1,
            exec_mode: 'fork',
            autorestart: true,
            watch: false,
            max_memory_restart: '150M',
            node_args: '--require dotenv/config',
            env: {
                NODE_ENV: 'production',
                DOTENV_CONFIG_PATH: '.env.local'
            },
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            min_uptime: '10s',
            max_restarts: 10,
            restart_delay: 4000,
            kill_timeout: 5000
        },
    ]
};
