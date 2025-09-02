import { supabaseAdmin } from '../database/supabase.js';

const validateApiKey = async (req, res, next) => {
  try {
    // Get API key from header
    const apiKey = req.headers['x-api-key'];
    
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
      .select('id, user_id, name, created_at')
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
    
    // Attach user ID to request
    req.userId = apiKeyData.user_id;
    req.apiKeyId = apiKeyData.id;
    req.apiKeyName = apiKeyData.name;
    
    next();
  } catch (error) {
    console.error('API key validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error validating API key',
      error: error.message
    });
  }
};

export default validateApiKey;
