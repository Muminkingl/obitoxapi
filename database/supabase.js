import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } from '../config/env.js';
import logger from '../utils/logger.js';

// Client for authenticated user operations (uses anon key)
export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Admin client for service operations (uses service role key)
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Initialize Supabase connection
const connectToSupabase = async () => {
  try {
    // Test the connection by checking auth.users table
    const { data, error } = await supabaseAdmin.from('profiles').select('count', { count: 'exact', head: true });
    
    if (error) {
      logger.error('Error connecting to Supabase:', { message: error.message });
      return false;
    }
    
    logger.debug('Connected to Supabase successfully');
    return true;
  } catch (error) {
    logger.error('Failed to connect to Supabase:', { message: error.message });
    return false;
  }
};

export default connectToSupabase;