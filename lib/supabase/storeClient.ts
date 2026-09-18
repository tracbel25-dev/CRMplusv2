'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { STORE_SUPABASE } from './fixedProjects';

let storeClient: SupabaseClient | null = null;

export function createStoreClient() {
  if (storeClient) return storeClient;
  storeClient = createClient(STORE_SUPABASE.url, STORE_SUPABASE.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return storeClient;
}

export function createRecoveryClient() {
  return createClient(STORE_SUPABASE.url, STORE_SUPABASE.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: true,
      flowType: 'implicit',
    },
  });
}
