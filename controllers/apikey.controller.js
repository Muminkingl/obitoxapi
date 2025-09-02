import { supabaseAdmin } from '../database/supabase.js';

// Validate API key and return user information and plan
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
    
    // Validate API key in database
    const { data: apiKeyData, error } = await supabaseAdmin
      .from('api_keys')
      .select('id, user_id, name, created_at, last_used_at')
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
    
    // Get user's plan/profile information
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', apiKeyData.user_id)
      .single();
    
    return res.status(200).json({
      success: true,
      message: 'Valid API key',
      data: {
        api_key: {
          id: apiKeyData.id,
          name: apiKeyData.name,
          status: 'active',
          created_at: apiKeyData.created_at,
          last_used_at: apiKeyData.last_used_at
        },
        user: {
          id: user.id,
          email: user.email,
          first_name: user.user_metadata?.first_name,
          last_name: user.user_metadata?.last_name
        },
        plan: profile?.plan || 'free',
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