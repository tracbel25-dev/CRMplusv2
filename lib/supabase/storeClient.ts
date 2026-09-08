'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let storeClient: SupabaseClient | null = null;

export function createStoreClient() {
  if (storeClient) return storeClient;
  const url = process.env.NEXT_PUBLIC_STORE_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_STORE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error('A conexão da CRM PLUS Store com o Supabase central ainda não foi configurada.');
  }
  storeClient = createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
  return storeClient;
}
