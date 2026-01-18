/**
 * PM2 Ecosystem Configuration
 * 
 * Production deployment configuration for audit workers and cron jobs
 * 
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2 startup
 */

module.exports = {
    apps: [
        {
            name: 'audit-worker',
            script: 'jobs/audit-worker.js',
            instances: 4,  // 🔥 Run 4 workers in parallel (adjust based on load)
            exec_mode: 'cluster',
            autorestart: true,
            watch: false,
            max_memory_restart: '500M',  // Restart if memory exceeds 500MB
            env: {
                NODE_ENV: 'production'
            },
            error_file: './logs/audit-worker-error.log',
            out_file: './logs/audit-worker-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            merge_logs: true,
            min_uptime: '10s',  // Consider unstable if crashes within 10s
            max_restarts: 10,   // Max 10 restarts within 1 minute
            restart_delay: 4000 // Wait 4s before restarting
        },
        {
            name: 'quota-reset-logger',
            script: 'jobs/quota-reset-logger.js',
            instances: 1,  // Only 1 instance (deduplication handles double-runs)
            exec_mode: 'fork',
            autorestart: false,  // Don't restart after completion
            cron_restart: '1 0 1 * *',  // 🔥 Run at 00:01 on 1st of every month
            watch: false,
            max_memory_restart: '200M',
            env: {
                NODE_ENV: 'production'
            },
            error_file: './logs/quota-reset-error.log',
            out_file: './logs/quota-reset-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss'
        }
    ]
};
