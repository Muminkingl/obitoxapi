/**
 * Analytics Controller (v2 - with Redis caching)
 * 
 * Uses these tables:
 * - api_keys (running totals)
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
 * Get comprehensive analytics from running totals
 */
export const getUploadAnalytics = async (req, res) => {
  try {
    const { provider, startDate, endDate, limit = 100, offset = 0 } = req.query;
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
      // Get API key summary
      const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin
        .from('api_keys')
        .select('total_requests, successful_requests, failed_requests, total_file_size, total_files_uploaded, file_type_counts')
        .eq('id', apiKeyId)
        .single();

      if (apiKeyError) throw apiKeyError;

      // Get provider usage breakdown
      let providerQuery = supabaseAdmin
        .from('provider_usage')
        .select('provider, upload_count, total_file_size, last_used_at')
        .eq('api_key_id', apiKeyId);

      if (provider) {
        const providers = Array.isArray(provider) ? provider : [provider];
        providerQuery = providerQuery.in('provider', providers);
      }

      const { data: providerData, error: providerError } = await providerQuery;
      if (providerError) throw providerError;

      // Calculate summary
      const summary = {
        totalUploads: apiKeyData?.total_files_uploaded || 0,
        totalRequests: apiKeyData?.total_requests || 0,
        successfulRequests: apiKeyData?.successful_requests || 0,
        failedRequests: apiKeyData?.failed_requests || 0,
        totalBytes: apiKeyData?.total_file_size || 0,
        averageFileSize: apiKeyData?.total_files_uploaded > 0
          ? Math.round((apiKeyData?.total_file_size || 0) / apiKeyData.total_files_uploaded)
          : 0,
        successRate: apiKeyData?.total_requests > 0
          ? Math.round((apiKeyData?.successful_requests || 0) / apiKeyData.total_requests * 100)
          : 0
      };

      // Provider breakdown
      const providerBreakdown = (providerData || []).reduce((acc, p) => {
        acc[p.provider] = {
          uploads: p.upload_count || 0,
          totalBytes: p.total_file_size || 0,
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
    console.error('Analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'ANALYTICS_ERROR',
      message: error.message
    });
  }
};

/**
 * Get daily usage analytics from daily tables
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
      // Query daily usage table
      let query = supabaseAdmin
        .from('api_key_usage_daily')
        .select('usage_date, total_requests, successful_requests, failed_requests, total_file_size, total_files_uploaded')
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

      // Calculate totals for period
      const totals = (dailyData || []).reduce((acc, day) => {
        acc.totalRequests += day.total_requests || 0;
        acc.successfulRequests += day.successful_requests || 0;
        acc.failedRequests += day.failed_requests || 0;
        acc.totalBytes += day.total_file_size || 0;
        acc.totalUploads += day.total_files_uploaded || 0;
        return acc;
      }, { totalRequests: 0, successfulRequests: 0, failedRequests: 0, totalBytes: 0, totalUploads: 0 });

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
    console.error('Daily analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'DAILY_ANALYTICS_ERROR',
      message: error.message
    });
  }
};

/**
 * Get provider usage detailed analytics
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

    // Get running totals by provider
    let runningQuery = supabaseAdmin
      .from('provider_usage')
      .select('provider, upload_count, total_file_size, last_used_at, average_file_size')
      .eq('api_key_id', apiKeyId);

    if (provider) {
      runningQuery = runningQuery.eq('provider', provider);
    }

    const { data: runningData, error: runningError } = await runningQuery;
    if (runningError) throw runningError;

    // Get daily breakdown by provider
    let dailyQuery = supabaseAdmin
      .from('provider_usage_daily')
      .select('usage_date, provider, upload_count, total_file_size')
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

    // Group daily data by provider
    const dailyByProvider = (dailyData || []).reduce((acc, row) => {
      if (!acc[row.provider]) {
        acc[row.provider] = [];
      }
      acc[row.provider].push({
        date: row.usage_date,
        uploads: row.upload_count,
        bytes: row.total_file_size
      });
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        providers: (runningData || []).map(p => ({
          name: p.provider,
          totalUploads: p.upload_count || 0,
          totalBytes: p.total_file_size || 0,
          averageFileSize: p.average_file_size || 0,
          lastUsed: p.last_used_at,
          dailyTrend: dailyByProvider[p.provider] || []
        }))
      }
    });

  } catch (error) {
    console.error('Provider analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'PROVIDER_ANALYTICS_ERROR',
      message: error.message
    });
  }
};

/**
 * Get file type distribution analytics from api_keys
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

    res.json({
      success: true,
      data: {
        totalFiles,
        fileTypes,
        categories
      }
    });

  } catch (error) {
    console.error('File type analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'FILE_TYPE_ANALYTICS_ERROR',
      message: error.message
    });
  }
};
