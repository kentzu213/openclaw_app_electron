// Supabase client — shared project with izziapi.com
// Forked from: izzi-backend/src/db/client.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

export const isDemoMode = !supabaseUrl || !supabaseKey;

if (isDemoMode) {
  console.warn("⚠️ Marketplace API running in DEMO mode (missing SUPABASE_URL or SUPABASE_SERVICE_KEY)");
}

// Service role client — bypasses RLS
export const supabase: SupabaseClient | null = !isDemoMode
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;
