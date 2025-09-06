import { supabaseAdmin } from '../database/supabase.js';

/**
 * Get comprehensive analytics with all filter support
 */
export const getUploadAnalytics = async (req, res) => {
  try {
    const { 
      provider, 
      fileType, 
      startDate, 
      endDate, 
      limit = 100, 
      offset = 0 
    } = req.query;
    
    const apiKeyId = req.apiKeyId;
    const userId = req.userId;

    if (!apiKeyId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'API key is required'
      });
    }

    // Build the base query
    let query = supabaseAdmin
      .from('file_uploads')
      .select('*')
      .eq('api_key_id', apiKeyId);

    // Apply filters
    if (provider) {
      const providers = Array.isArray(provider) ? provider : [provider];
      query = query.in('provider', providers);
    }

    if (fileType) {
      if (fileType.includes('*')) {
        // Handle wildcard file types (e.g., 'image/*')
        const baseType = fileType.replace('*', '');
        query = query.like('file_type', `${baseType}%`);
      } else {
        const fileTypes = Array.isArray(fileType) ? fileType : [fileType];
        query = query.in('file_type', fileTypes);
      }
    }

    if (startDate) {
      query = query.gte('uploaded_at', startDate);
    }

    if (endDate) {
      query = query.lte('uploaded_at', endDate);
    }

    // Apply pagination
    query = query
      .order('uploaded_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: uploads, error } = await query;

    if (error) {
      throw error;
    }

    // Get summary statistics
    const summaryQuery = supabaseAdmin
      .from('file_uploads')
      .select('provider, file_type, file_size, upload_status')
      .eq('api_key_id', apiKeyId);

    // Apply same filters for summary
    if (provider) {
      const providers = Array.isArray(provider) ? provider : [provider];
      summaryQuery.in('provider', providers);
    }

    if (fileType) {
      if (fileType.includes('*')) {
        const baseType = fileType.replace('*', '');
        summaryQuery.like('file_type', `${baseType}%`);
      } else {
        const fileTypes = Array.isArray(fileType) ? fileType : [fileType];
        summaryQuery.in('file_type', fileTypes);
      }
    }

    if (startDate) {
      summaryQuery.gte('uploaded_at', startDate);
    }

    if (endDate) {
      summaryQuery.lte('uploaded_at', endDate);
    }

    const { data: allUploads, error: summaryError } = await summaryQuery;

    if (summaryError) {
      throw summaryError;
    }

    // Calculate summary statistics
    const totalUploads = allUploads.length;
    const totalSize = allUploads.reduce((sum, upload) => sum + (upload.file_size || 0), 0);
    const successfulUploads = allUploads.filter(upload => upload.upload_status === 'success').length;
    const failedUploads = allUploads.filter(upload => upload.upload_status === 'failed').length;

    // Provider breakdown
    const providerStats = allUploads.reduce((acc, upload) => {
      if (!acc[upload.provider]) {
        acc[upload.provider] = { count: 0, size: 0, successful: 0, failed: 0 };
      }
      acc[upload.provider].count++;
      acc[upload.provider].size += upload.file_size || 0;
      if (upload.upload_status === 'success') acc[upload.provider].successful++;
      if (upload.upload_status === 'failed') acc[upload.provider].failed++;
      return acc;
    }, {});

    // File type breakdown
    const fileTypeStats = allUploads.reduce((acc, upload) => {
      if (!acc[upload.file_type]) {
        acc[upload.file_type] = { count: 0, size: 0, successful: 0, failed: 0 };
      }
      acc[upload.file_type].count++;
      acc[upload.file_type].size += upload.file_size || 0;
      if (upload.upload_status === 'success') acc[upload.file_type].successful++;
      if (upload.upload_status === 'failed') acc[upload.file_type].failed++;
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        uploads: uploads || [],
        summary: {
          totalUploads,
          totalSize,
          successfulUploads,
          failedUploads,
          successRate: totalUploads > 0 ? (successfulUploads / totalUploads * 100).toFixed(2) : 0
        },
        providerStats,
        fileTypeStats,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: totalUploads,
          hasMore: (parseInt(offset) + parseInt(limit)) < totalUploads
        },
        filters: {
          provider: provider || null,
          fileType: fileType || null,
          startDate: startDate || null,
          endDate: endDate || null
        }
      }
    });

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'ANALYTICS_ERROR',
      message: 'Failed to fetch upload analytics'
    });
  }
};

/**
 * Get daily usage analytics
 */
export const getDailyUsageAnalytics = async (req, res) => {
  try {
    const { 
      provider, 
      startDate, 
      endDate, 
      limit = 30 
    } = req.query;
    
    const apiKeyId = req.apiKeyId;

    if (!apiKeyId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'API key is required'
      });
    }

    // Build the base query
    let query = supabaseAdmin
      .from('daily_usage_summary')
      .select('*')
      .eq('api_key_id', apiKeyId);

    // Apply filters
    if (provider) {
      const providers = Array.isArray(provider) ? provider : [provider];
      query = query.in('provider', providers);
    }

    if (startDate) {
      query = query.gte('usage_date', startDate);
    }

    if (endDate) {
      query = query.lte('usage_date', endDate);
    }

    // Apply pagination and ordering
    query = query
      .order('usage_date', { ascending: false })
      .limit(parseInt(limit));

    const { data: dailyUsage, error } = await query;

    if (error) {
      throw error;
    }

    // Calculate totals
    const totalUploads = dailyUsage.reduce((sum, day) => sum + (day.total_uploads || 0), 0);
    const totalSize = dailyUsage.reduce((sum, day) => sum + (day.total_file_size || 0), 0);
    const totalSuccessful = dailyUsage.reduce((sum, day) => sum + (day.successful_requests || 0), 0);
    const totalFailed = dailyUsage.reduce((sum, day) => sum + (day.failed_requests || 0), 0);

    res.json({
      success: true,
      data: {
        dailyUsage: dailyUsage || [],
        summary: {
          totalUploads,
          totalSize,
          totalSuccessful,
          totalFailed,
          successRate: totalUploads > 0 ? (totalSuccessful / totalUploads * 100).toFixed(2) : 0,
          averageDailyUploads: dailyUsage.length > 0 ? (totalUploads / dailyUsage.length).toFixed(2) : 0,
          averageDailySize: dailyUsage.length > 0 ? (totalSize / dailyUsage.length).toFixed(2) : 0
        },
        filters: {
          provider: provider || null,
          startDate: startDate || null,
          endDate: endDate || null
        }
      }
    });

  } catch (error) {
    console.error('Daily usage analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'DAILY_ANALYTICS_ERROR',
      message: 'Failed to fetch daily usage analytics'
    });
  }
};

/**
 * Get provider usage detailed analytics
 */
export const getProviderUsageAnalytics = async (req, res) => {
  try {
    const { provider } = req.query;
    const apiKeyId = req.apiKeyId;

    if (!apiKeyId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'API key is required'
      });
    }

    // Build the base query
    let query = supabaseAdmin
      .from('provider_usage_detailed')
      .select('*')
      .eq('api_key_id', apiKeyId);

    // Apply provider filter if specified
    if (provider) {
      const providers = Array.isArray(provider) ? provider : [provider];
      query = query.in('provider', providers);
    }

    const { data: providerUsage, error } = await query;

    if (error) {
      throw error;
    }

    // Calculate totals
    const totalUploads = providerUsage.reduce((sum, provider) => sum + (provider.upload_count || 0), 0);
    const totalSize = providerUsage.reduce((sum, provider) => sum + (provider.total_file_size || 0), 0);

    res.json({
      success: true,
      data: {
        providerUsage: providerUsage || [],
        summary: {
          totalUploads,
          totalSize,
          averageFileSize: totalUploads > 0 ? (totalSize / totalUploads).toFixed(2) : 0,
          providerCount: providerUsage.length
        },
        filters: {
          provider: provider || null
        }
      }
    });

  } catch (error) {
    console.error('Provider usage analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'PROVIDER_ANALYTICS_ERROR',
      message: 'Failed to fetch provider usage analytics'
    });
  }
};

/**
 * Get file type distribution analytics
 */
export const getFileTypeAnalytics = async (req, res) => {
  try {
    const { 
      provider, 
      startDate, 
      endDate 
    } = req.query;
    
    const apiKeyId = req.apiKeyId;

    if (!apiKeyId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'API key is required'
      });
    }

    // Build the base query
    let query = supabaseAdmin
      .from('file_uploads')
      .select('file_type, file_size, upload_status')
      .eq('api_key_id', apiKeyId)
      .eq('upload_status', 'success'); // Only count successful uploads

    // Apply filters
    if (provider) {
      const providers = Array.isArray(provider) ? provider : [provider];
      query = query.in('provider', providers);
    }

    if (startDate) {
      query = query.gte('uploaded_at', startDate);
    }

    if (endDate) {
      query = query.lte('uploaded_at', endDate);
    }

    const { data: uploads, error } = await query;

    if (error) {
      throw error;
    }

    // Calculate file type distribution
    const fileTypeStats = uploads.reduce((acc, upload) => {
      if (!acc[upload.file_type]) {
        acc[upload.file_type] = { count: 0, size: 0 };
      }
      acc[upload.file_type].count++;
      acc[upload.file_type].size += upload.file_size || 0;
      return acc;
    }, {});

    // Convert to array and sort by count
    const fileTypeDistribution = Object.entries(fileTypeStats)
      .map(([fileType, stats]) => ({
        fileType,
        count: stats.count,
        totalSize: stats.size,
        averageSize: stats.count > 0 ? (stats.size / stats.count).toFixed(2) : 0,
        percentage: uploads.length > 0 ? (stats.count / uploads.length * 100).toFixed(2) : 0
      }))
      .sort((a, b) => b.count - a.count);

    // Calculate category distribution
    const categoryStats = fileTypeDistribution.reduce((acc, item) => {
      const category = item.fileType.split('/')[0];
      if (!acc[category]) {
        acc[category] = { count: 0, size: 0 };
      }
      acc[category].count += item.count;
      acc[category].size += item.totalSize;
      return acc;
    }, {});

    const categoryDistribution = Object.entries(categoryStats)
      .map(([category, stats]) => ({
        category,
        count: stats.count,
        totalSize: stats.size,
        averageSize: stats.count > 0 ? (stats.size / stats.count).toFixed(2) : 0,
        percentage: uploads.length > 0 ? (stats.count / uploads.length * 100).toFixed(2) : 0
      }))
      .sort((a, b) => b.count - a.count);

    res.json({
      success: true,
      data: {
        fileTypeDistribution,
        categoryDistribution,
        summary: {
          totalFileTypes: fileTypeDistribution.length,
          totalCategories: categoryDistribution.length,
          totalUploads: uploads.length,
          totalSize: uploads.reduce((sum, upload) => sum + (upload.file_size || 0), 0)
        },
        filters: {
          provider: provider || null,
          startDate: startDate || null,
          endDate: endDate || null
        }
      }
    });

  } catch (error) {
    console.error('File type analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'FILE_TYPE_ANALYTICS_ERROR',
      message: 'Failed to fetch file type analytics'
    });
  }
};
