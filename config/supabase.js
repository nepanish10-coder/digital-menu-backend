const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

const missingVars = [];
if (!supabaseUrl) missingVars.push('SUPABASE_URL');
if (!supabaseAnonKey) missingVars.push('SUPABASE_ANON_KEY');
if (!supabaseServiceKey) missingVars.push('SUPABASE_SERVICE_KEY');
if (missingVars.length > 0) {
    throw new Error(`Missing required Supabase environment variables: ${missingVars.join(', ')}`);
}

// Client for public operations (useful if we ever expose Supabase directly to the browser)
const supabasePublic = createClient(supabaseUrl, supabaseAnonKey);

// Service client for all server-side operations (bypasses RLS)
const supabaseService = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false
    }
});

// Default export now points to the service client so existing imports gain elevated access
const supabase = supabaseService;

module.exports = { supabase, supabaseService, supabasePublic };