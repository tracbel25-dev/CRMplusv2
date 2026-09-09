'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const centralUrl = 'https://sodcfarvfhkdjecjmdwc.supabase.co';
const centralPublishableKey = 'sb_publishable_hPguKVNttFAz7Pqq4necfA_rxbVUqET';
let storeClient: SupabaseClient | null = null;

function validHttpUrl(value: string) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !!url.hostname;
  } catch {
    return false;
  }
}

function resolvedCentralUrl() {
  const configured = process.env.NEXT_PUBLIC_STORE_SUPABASE_URL?.trim() || '';
  return validHttpUrl(configured) ? configured : centralUrl;
}

function resolvedCentralPublishableKey() {
  const configured = process.env.NEXT_PUBLIC_STORE_SUPABASE_PUBLISHABLE_KEY?.trim() || '';
  return configured.startsWith('sb_publishable_') ? configured : centralPublishableKey;
}

export function createStoreClient() {
  if (storeClient) return storeClient;
  storeClient = createClient(resolvedCentralUrl(), resolvedCentralPublishableKey(), {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
  return storeClient;
}
