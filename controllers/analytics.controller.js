/**
 * Analytics Controller (v3 - Simplified for Presigned URL Architecture)
 * 
 * Since files never hit our server (direct upload to providers via presigned URLs),
 * we track REQUEST COUNTS for quota management, not file transfer metrics.
 * 
 * Uses these tables:
 * - api_keys (running totals for request counts)
 * - provider_usage (per-provider running totals)
 * - api_key_usage_daily (daily snapshots)
 * - provider_usage_daily (per-provider daily snapshots)
 * 
 * CACHING:
 * - 60s Redis cache for frequently accessed data
 * - Cache-Control headers for browser/CDN caching
 */

import { supabaseAdmin } from '../database/supabase.js';
import { getRedis } from '../config/redis.js';
import logger from '../utils/logger.js';

const CACHE_TTL = 60; // 60 seconds

/**
 * Simple cache helper - get from Redis or fetch from DB
 */
const withCache = async (cacheKey, fetchFn) => {
  const redis = getRedis();

  try {
    // Try cache first
    if (redis?.status === 'ready') {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return { data: JSON.parse(cached), fromCache: true };
      }
    }

    // Cache miss - fetch from database
    const data = await fetchFn();

    // Store in cache (fire and forget)
    if (redis?.status === 'ready') {
      redis.setex(cacheKey, CACHE_TTL, JSON.stringify(data)).catch(() => { });
    }

    return { data, fromCache: false };
  } catch (error) {
    // On cache error, just fetch from DB
    const data = await fetchFn();
    return { data, fromCache: false };
  }
};

/**
 * Get upload analytics - QUOTA TRACKING ONLY
 * 
 * Tracks request counts for quota management.
 * Note: We cannot track actual file transfer since files upload directly to providers.
 */
export const getUploadAnalytics = async (req, res) => {
  try {
    const { provider, limit = 100, offset = 0 } = req.query;
    const apiKeyId = req.apiKeyId;

    if (!apiKeyId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'API key is required'
      });
    }

    // Cache key includes apiKeyId and provider filter
    const cacheKey = `analytics:upload:${apiKeyId}:${provider || 'all'}`;

    const { data, fromCache } = await withCache(cacheKey, async () => {
      // Get API key summary - QUOTA TRACKING ONLY (request counts)
      const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin
        .from('api_keys')
        .select('total_requests, total_files_uploaded, file_type_counts')
        .eq('id', apiKeyId)
        .single();

      if (apiKeyError) throw apiKeyError;

      // Get provider usage breakdown
      let providerQuery = supabaseAdmin
        .from('provider_usage')
        .select('provider, upload_count, last_used_at')
        .eq('api_key_id', apiKeyId);

      if (provider) {
        const providers = Array.isArray(provider) ? provider : [provider];
        providerQuery = providerQuery.in('provider', providers);
      }

      const { data: providerData, error: providerError } = await providerQuery;
      if (providerError) throw providerError;

      // Calculate summary - QUOTA TRACKING ONLY
      const summary = {
        totalRequests: apiKeyData?.total_requests || 0,
        totalFilesUploaded: apiKeyData?.total_files_uploaded || 0
      };

      // Provider breakdown - request counts only
      const providerBreakdown = (providerData || []).reduce((acc, p) => {
        acc[p.provider] = {
          uploads: p.upload_count || 0,
          lastUsed: p.last_used_at
        };
        return acc;
      }, {});

      return {
        summary,
        providers: providerBreakdown,
        fileTypes: apiKeyData?.file_type_counts || {}
      };
    });

    // Set cache header
    res.set('Cache-Control', 'private, max-age=60');

    res.json({
      success: true,
      data,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset)
      },
      meta: { cached: fromCache }
    });

  } catch (error) {
    logger.error('Analytics error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'ANALYTICS_ERROR',
      message: error.message
    });
  }
};

/**
 * Get daily usage analytics from daily tables
 * 
 * Historical request counts per day for quota trends.
 */
export const getDailyUsageAnalytics = async (req, res) => {
  try {
    const { startDate, endDate, limit = 30 } = req.query;
    const apiKeyId = req.apiKeyId;

    if (!apiKeyId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'API key is required'
      });
    }

    const safeLimit = Math.min(parseInt(limit), 90); // Max 90 days
    const cacheKey = `analytics:daily:${apiKeyId}:${startDate || 'none'}:${endDate || 'none'}:${safeLimit}`;

    const { data, fromCache } = await withCache(cacheKey, async () => {
      // Query daily usage table - QUOTA TRACKING ONLY (request counts)
      let query = supabaseAdmin
        .from('api_key_usage_daily')
        .select('usage_date, total_requests, total_files_uploaded')
        .eq('api_key_id', apiKeyId)
        .order('usage_date', { ascending: false })
        .limit(safeLimit);

      if (startDate) {
        query = query.gte('usage_date', startDate);
      }
      if (endDate) {
        query = query.lte('usage_date', endDate);
      }

      const { data: dailyData, error } = await query;
      if (error) throw error;

      // Calculate totals for period - QUOTA TRACKING ONLY
      const totals = (dailyData || []).reduce((acc, day) => {
        acc.totalRequests += day.total_requests || 0;
        acc.totalFilesUploaded += day.total_files_uploaded || 0;
        return acc;
      }, { totalRequests: 0, totalFilesUploaded: 0 });

      return {
        daily: dailyData || [],
        totals,
        period: {
          days: dailyData?.length || 0,
          startDate: dailyData?.[dailyData.length - 1]?.usage_date || null,
          endDate: dailyData?.[0]?.usage_date || null
        }
      };
    });

    res.set('Cache-Control', 'private, max-age=60');

    res.json({
      success: true,
      data,
      meta: { cached: fromCache }
    });

  } catch (error) {
    logger.error('Daily analytics error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'DAILY_ANALYTICS_ERROR',
      message: error.message
    });
  }
};

/**
 * Get provider usage detailed analytics - WITH CACHING
 * 
 * Tracks request counts per provider by date for quota management.
 */
export const getProviderUsageAnalytics = async (req, res) => {
  try {
    const { provider, startDate, endDate } = req.query;
    const apiKeyId = req.apiKeyId;

    if (!apiKeyId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'API key is required'
      });
    }

    // Build cache key
    const cacheKey = `analytics:provider:${apiKeyId}:${provider || 'all'}:${startDate || 'none'}:${endDate || 'none'}`;

    const { data, fromCache } = await withCache(cacheKey, async () => {
      // Get running totals by provider - request counts only
      let runningQuery = supabaseAdmin
        .from('provider_usage')
        .select('provider, upload_count, last_used_at')
        .eq('api_key_id', apiKeyId);

      if (provider) {
        runningQuery = runningQuery.eq('provider', provider);
      }

      const { data: runningData, error: runningError } = await runningQuery;
      if (runningError) throw runningError;

      // Get daily breakdown by provider - request counts only
      let dailyQuery = supabaseAdmin
        .from('provider_usage_daily')
        .select('usage_date, provider, upload_count')
        .eq('api_key_id', apiKeyId)
        .order('usage_date', { ascending: false })
        .limit(90); // Last 90 days

      if (provider) {
        dailyQuery = dailyQuery.eq('provider', provider);
      }
      if (startDate) {
        dailyQuery = dailyQuery.gte('usage_date', startDate);
      }
      if (endDate) {
        dailyQuery = dailyQuery.lte('usage_date', endDate);
      }

      const { data: dailyData, error: dailyError } = await dailyQuery;
      if (dailyError) throw dailyError;

      // Group daily data by provider - request counts only
      const dailyByProvider = (dailyData || []).reduce((acc, row) => {
        if (!acc[row.provider]) {
          acc[row.provider] = [];
        }
        acc[row.provider].push({
          date: row.usage_date,
          requests: row.upload_count
        });
        return acc;
      }, {});

      // Calculate totals
      const allProviders = (runningData || []).reduce((acc, p) => acc + (p.upload_count || 0), 0);
      const last30Days = (dailyData || []).reduce((acc, row) => acc + (row.upload_count || 0), 0);

      return {
        providers: (runningData || []).map(p => ({
          name: p.provider,
          totalRequests: p.upload_count || 0,
          lastUsed: p.last_used_at,
          dailyTrend: dailyByProvider[p.provider] || []
        })),
        totals: {
          allProviders: allProviders,
          last30Days: last30Days
        }
      };
    });

    res.set('Cache-Control', 'private, max-age=60');

    res.json({
      success: true,
      data,
      meta: { cached: fromCache }
    });

  } catch (error) {
    logger.error('Provider analytics error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'PROVIDER_ANALYTICS_ERROR',
      message: error.message
    });
  }
};

/**
 * Get file type distribution analytics - WITH CACHING
 * 
 * Tracks MIME types for segmentation/validation purposes.
 */
export const getFileTypeAnalytics = async (req, res) => {
  try {
    const apiKeyId = req.apiKeyId;

    if (!apiKeyId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'API key is required'
      });
    }

    const cacheKey = `analytics:filetypes:${apiKeyId}`;

    const { data, fromCache } = await withCache(cacheKey, async () => {
      // Get file type counts from api_keys
      const { data: apiKeyData, error } = await supabaseAdmin
        .from('api_keys')
        .select('file_type_counts, total_files_uploaded')
        .eq('id', apiKeyId)
        .single();

      if (error) throw error;

      const fileTypeCounts = apiKeyData?.file_type_counts || {};
      const totalFiles = apiKeyData?.total_files_uploaded || 0;

      // Convert to array with percentages
      const fileTypes = Object.entries(fileTypeCounts).map(([type, count]) => ({
        type,
        count,
        percentage: totalFiles > 0 ? Math.round((count / totalFiles) * 100) : 0
      })).sort((a, b) => b.count - a.count);

      // Group by category (image, video, document, etc.)
      const categories = fileTypes.reduce((acc, ft) => {
        const category = ft.type.split('/')[0] || 'other';
        if (!acc[category]) {
          acc[category] = { count: 0, types: [] };
        }
        acc[category].count += ft.count;
        acc[category].types.push(ft);
        return acc;
      }, {});

      return {
        totalFiles,
        fileTypes,
        categories
      };
    });

    res.set('Cache-Control', 'private, max-age=60');

    res.json({
      success: true,
      data,
      meta: { cached: fromCache }
    });

  } catch (error) {
    logger.error('File type analytics error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'FILE_TYPE_ANALYTICS_ERROR',
      message: error.message
    });
  }
};
