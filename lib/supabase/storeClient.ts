'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const centralUrl='https://sodcfarvfhkdjecjmdwc.supabase.co';
const centralPublishableKey='sb_publishable_hPguKVNttFAz7Pqq4necfA_rxbVUqET';
let storeClient: SupabaseClient | null = null;

export function createStoreClient() {
  if (storeClient) return storeClient;
  const url = process.env.NEXT_PUBLIC_STORE_SUPABASE_URL || centralUrl;
  const publishableKey = process.env.NEXT_PUBLIC_STORE_SUPABASE_PUBLISHABLE_KEY || centralPublishableKey;
  storeClient = createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
  return storeClient;
}
