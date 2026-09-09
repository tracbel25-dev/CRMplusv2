export const STORE_SUPABASE = {
  projectRef: 'sodcfarvfhkdjecjmdwc',
  url: 'https://sodcfarvfhkdjecjmdwc.supabase.co',
  publishableKey: 'sb_publishable_hPguKVNttFAz7Pqq4necfA_rxbVUqET',
} as const;

export const OPERATIONAL_SUPABASE = {
  zeus: {
    projectRef: 'diejjfzvoopcuqulqkqr',
    url: 'https://diejjfzvoopcuqulqkqr.supabase.co',
    publishableKey: 'sb_publishable_V8KzkI74JYAXFm3lv6cEMQ_92ecfA6Q',
    envPrefix: 'ZEUS',
  },
  artemis: {
    projectRef: 'sqbjqjjnusmqotlkegyt',
    url: 'https://sqbjqjjnusmqotlkegyt.supabase.co',
    publishableKey: 'sb_publishable_FVh6RFzQLZ0EDU1a0X0r5g_rh_nKRWn',
    envPrefix: 'ARTEMIS',
  },
} as const;

export type FixedOperationalApp = keyof typeof OPERATIONAL_SUPABASE;
