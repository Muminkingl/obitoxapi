/**
 * Monitoring Routes
 * Provides health checks and metrics endpoints
 */

import express from 'express';
import { getRedis } from '../config/redis.js';

const router = express.Router();

/**
 * GET /api/v1/monitoring/audit-metrics
 * Returns real-time audit worker metrics
 */
router.get('/audit-metrics', async (req, res) => {
    try {
        const redis = getRedis();

        if (!redis) {
            return res.status(503).json({
                status: 'unavailable',
                error: 'Redis not configured'
            });
        }

        const metricsJson = await redis.get('audit:metrics');

        if (!metricsJson) {
            return res.status(503).json({
                status: 'no_data',
                message: 'Metrics not available. Worker may not be running.',
                hint: 'Start worker with: pm2 start jobs/audit-worker.js --instances 4'
            });
        }

        const metrics = JSON.parse(metricsJson);

        // Health assessment
        const health = {
            status: 'healthy',
            issues: []
        };

        // Check queue depth
        if (metrics.queueLength > 8000) {
            health.status = 'critical';
            health.issues.push('Queue severely backed up (>8K)');
        } else if (metrics.queueLength > 5000) {
            health.status = 'degraded';
            health.issues.push('Queue backed up (>5K)');
        } else if (metrics.queueLength > 2000) {
            health.status = 'warning';
            health.issues.push('Queue growing (>2K)');
        }

        // Check failure rate
        if (metrics.failuresLastMinute > 100) {
            health.status = 'critical';
            health.issues.push('High failure rate (>100/min)');
        } else if (metrics.failuresLastMinute > 50) {
            health.status = 'degraded';
            health.issues.push('Elevated failures (>50/min)');
        }

        // Check dropped events
        if (metrics.droppedEvents > 1000) {
            health.status = 'warning';
            health.issues.push(`Events being dropped (${metrics.droppedEvents} total)`);
        }

        // Response
        return res.json({
            health,
            metrics: {
                queue_length: metrics.queueLength,
                current_batch_size: metrics.currentBatchSize,
                inserts_last_minute: metrics.insertsLastMinute,
                failures_last_minute: metrics.failuresLastMinute,
                avg_batch_time_ms: metrics.avgBatchTime,
                total_dropped_events: metrics.droppedEvents,
                total_overflow_events: metrics.overflowEvents,
                worker_id: metrics.worker_id,
                last_updated: metrics.timestamp
            },
            recommendations: getRecommendations(metrics),
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        return res.status(500).json({
            status: 'error',
            error: 'Failed to fetch metrics',
            message: error.message
        });
    }
});

/**
 * GET /api/v1/monitoring/health
 * Overall system health check
 */
router.get('/health', async (req, res) => {
    try {
        const redis = getRedis();

        const health = {
            status: 'healthy',
            services: {
                redis: redis ? 'connected' : 'unavailable',
                audit_worker: 'unknown'
            },
            timestamp: new Date().toISOString()
        };

        // Check audit worker status
        if (redis) {
            const metrics = await redis.get('audit:metrics');
            const metricsAge = metrics ? Date.now() - new Date(JSON.parse(metrics).timestamp).getTime() : null;

            if (metricsAge && metricsAge < 120000) { // < 2 minutes
                health.services.audit_worker = 'running';
            } else {
                health.services.audit_worker = 'stale_or_stopped';
                health.status = 'degraded';
            }
        }

        res.json(health);

    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

/**
 * Generate recommendations based on metrics
 */
function getRecommendations(metrics) {
    const recommendations = [];

    if (metrics.queueLength > 5000) {
        recommendations.push({
            severity: 'high',
            message: 'Queue is backed up. Consider scaling workers.',
            action: 'pm2 scale audit-worker +2'
        });
    }

    if (metrics.failuresLastMinute > 50) {
        recommendations.push({
            severity: 'high',
            message: 'High failure rate detected. Check database connectivity.',
            action: 'Review logs: pm2 logs audit-worker'
        });
    }

    if (metrics.droppedEvents > 500) {
        recommendations.push({
            severity: 'medium',
            message: 'Events are being dropped due to high load.',
            action: 'Increase MAX_QUEUE_LENGTH or add more workers'
        });
    }

    if (metrics.avgBatchTime > 1000) {
        recommendations.push({
            severity: 'medium',
            message: 'Slow database writes detected.',
            action: 'Check database performance and connection pooling'
        });
    }

    if (recommendations.length === 0) {
        recommendations.push({
            severity: 'info',
            message: 'All systems operating normally.',
            action: null
        });
    }

    return recommendations;
}

export default router;
