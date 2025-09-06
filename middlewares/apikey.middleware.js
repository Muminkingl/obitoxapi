import { supabaseAdmin } from '../database/supabase.js';

const validateApiKey = async (req, res, next) => {
  try {
    // Get API key from header (support multiple header formats)
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API key is required',
        error: 'MISSING_API_KEY'
      });
    }
    
    // Validate API key format (ox_randomstring)
    if (!apiKey.startsWith('ox_') || apiKey.length < 10) {
      return res.status(401).json({
        success: false,
        message: 'Invalid API key format',
        error: 'INVALID_API_KEY_FORMAT'
      });
    }
    
   // Validate API key in database (same logic as API key controller)
    const { data: apiKeyData, error } = await supabaseAdmin
      .from('api_keys')
      .select('id, user_id, name, created_at, last_used_at, total_requests, successful_requests, failed_requests, total_file_size, total_files_uploaded, file_type_counts')
      .eq('key_value', apiKey)
      .single();
      
    if (error || !apiKeyData) {
      return res.status(401).json({
        success: false,
        message: 'Invalid API key',
        error: 'INVALID_API_KEY'
      });
    }
    
    // Check if API key is expired
    if (apiKeyData.expires_at && new Date(apiKeyData.expires_at) < new Date()) {
      return res.status(401).json({
        success: false,
        message: 'API key has expired',
        error: 'EXPIRED_API_KEY'
      });
    }
    
    // Optional: Rate limiting check
    if (apiKeyData.rate_limit_per_hour) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const { count: recentRequests } = await supabaseAdmin
        .from('api_usage_logs')
        .select('*', { count: 'exact', head: true })
        .eq('api_key_id', apiKeyData.id)
        .gte('created_at', oneHourAgo.toISOString());
        
      if (recentRequests >= apiKeyData.rate_limit_per_hour) {
        return res.status(429).json({
          success: false,
          message: 'Rate limit exceeded',
          error: 'RATE_LIMIT_EXCEEDED',
          retry_after: 3600 // seconds until reset
        });
      }
    }
    
    // Update last_used_at timestamp (consider making this async to not block the request)
    supabaseAdmin
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', apiKeyData.id)
      .then(() => {})
      .catch(err => console.error('Failed to update last_used_at:', err));
    
    // Optional: Log API usage for analytics/monitoring
    supabaseAdmin
      .from('api_usage_logs')
      .insert({
        api_key_id: apiKeyData.id,
        user_id: apiKeyData.user_id,
        endpoint: req.path,
        method: req.method,
        ip_address: req.ip || req.connection.remoteAddress,
        user_agent: req.headers['user-agent'],
        created_at: new Date().toISOString()
      })
      .then(() => {})
      .catch(err => console.error('Failed to log API usage:', err));
    
    // Attach user data to request
    req.userId = apiKeyData.user_id;
    req.apiKeyId = apiKeyData.id;
    req.apiKeyName = apiKeyData.name;
    req.apiKeyData = apiKeyData; // Include full data for potential use
    
    next();
  } catch (error) {
    console.error('API key validation error:', error);
    
    // Don't expose internal error details in production
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    res.status(500).json({
      success: false,
      message: 'Internal server error during API key validation',
      error: 'VALIDATION_ERROR',
      ...(isDevelopment && { details: error.message })
    });
  }
};

export default validateApiKey;