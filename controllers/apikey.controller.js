import { supabaseAdmin } from '../database/supabase.js';

// Validate API key and return user information
export const validateApiKey = async (req, res, next) => {
  try {
    // Get API key from header or query parameter
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API key is required'
      });
    }

    // Validate API key format (ox_randomstring)
    if (!apiKey.startsWith('ox_') || apiKey.length < 10) {
      return res.status(401).json({
        success: false,
        message: 'Invalid API key format'
      });
    }

    // Validate API key in database with request metrics
    const { data: apiKeyData, error } = await supabaseAdmin
      .from('api_keys')
      .select('id, user_id, name, created_at, last_used_at, total_requests, total_files_uploaded, file_type_counts')
      .eq('key_value', apiKey)
      .single();

    if (error || !apiKeyData) {
      return res.status(401).json({
        success: false,
        message: 'Invalid API key'
      });
    }

    // Update last_used_at timestamp
    await supabaseAdmin
      .from('api_keys')
      .update({ last_used_at: new Date() })
      .eq('id', apiKeyData.id);

    // Get user information from Supabase
    const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.getUserById(apiKeyData.user_id);

    if (userError || !user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user's plan/profile information with computed tier
    // Query profiles_with_tier view for computed tier and limits
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles_with_tier')
      .select('subscription_tier, subscription_tier_paid, subscription_status, is_subscription_expired, is_in_grace_period, api_requests_limit, plan_name')
      .eq('id', apiKeyData.user_id)
      .single();

    // Get provider usage statistics (upload counts only)
    const { data: providerUsage, error: providerError } = await supabaseAdmin
      .from('provider_usage')
      .select('provider, upload_count')
      .eq('api_key_id', apiKeyData.id);

    // Format provider usage data
    const providerStats = {};
    if (providerUsage && !providerError) {
      providerUsage.forEach(usage => {
        providerStats[usage.provider] = {
          uploads: usage.upload_count
        };
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Valid API key',
      data: {
        api_key: {
          id: apiKeyData.id,
          name: apiKeyData.name,
          status: 'active',
          created_at: apiKeyData.created_at,
          last_used_at: apiKeyData.last_used_at,
          total_requests: apiKeyData.total_requests || 0,
          total_files_uploaded: apiKeyData.total_files_uploaded || 0,
          file_type_counts: apiKeyData.file_type_counts || {}
        },
        user: {
          id: user.id,
          email: user.email,
          first_name: user.user_metadata?.first_name,
          last_name: user.user_metadata?.last_name
        },
        plan: profile?.plan || 'free',
        provider_usage: providerStats,
        profile: profile || null
      }
    });
  } catch (error) {
    console.error('API key validation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error validating API key',
      error: error.message
    });
  }
};

// Validate API key via POST request (useful for testing)
export const validateApiKeyPost = async (req, res, next) => {
  try {
    // Get API key from request body or header
    const apiKey = req.body.apiKey || req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API key is required'
      });
    }

    // Call the same validation logic
    req.headers['x-api-key'] = apiKey;
    return validateApiKey(req, res, next);
  } catch (error) {
    console.error('API key validation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error validating API key',
      error: error.message
    });
  }
};
