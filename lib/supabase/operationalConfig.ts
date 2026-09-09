type OperationalApp = 'zeus' | 'artemis';

type OperationalSupabaseConfig = {
  app: OperationalApp;
  projectRef: string;
  url: string;
  publishableKey: string;
  anonKey: string;
  secretKey: string;
};

const expected = {
  zeus: {
    projectRef: 'diejjfzvoopcuqulqkqr',
    url: 'https://diejjfzvoopcuqulqkqr.supabase.co',
    env: 'ZEUS'
  },
  artemis: {
    projectRef: 'sqbjqjjnusmqotlkegyt',
    url: 'https://sqbjqjjnusmqotlkegyt.supabase.co',
    env: 'ARTEMIS'
  }
} as const;

function env(name: string) {
  return process.env[name]?.trim() || '';
}

function legacyAnonClaims(key: string) {
  const payload = key.split('.')[1];
  if (!payload) throw new Error('Legacy anon key inválida: JWT sem payload.');
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { ref?: string; role?: string };
  } catch {
    throw new Error('Legacy anon key inválida: payload JWT não pôde ser lido.');
  }
}

export function readOperationalSupabaseConfig(app: OperationalApp): OperationalSupabaseConfig {
  const definition = expected[app];
  const prefix = definition.env;
  const projectRef = env(`${prefix}_SUPABASE_PROJECT_REF`) || definition.projectRef;
  const url = env(`${prefix}_SUPABASE_URL`);
  const publishableKey = env(`${prefix}_SUPABASE_PUBLISHABLE_KEY`);
  const anonKey = env(`${prefix}_SUPABASE_ANON_KEY`);
  const secretKey = env(`${prefix}_SUPABASE_SECRET_KEY`);

  if (projectRef !== definition.projectRef) throw new Error(`${prefix}_SUPABASE_PROJECT_REF não corresponde ao projeto ${app}.`);
  if (url !== definition.url) throw new Error(`${prefix}_SUPABASE_URL deve ser ${definition.url}.`);
  if (!publishableKey && !anonKey) throw new Error(`${prefix}: informe SUPABASE_PUBLISHABLE_KEY ou SUPABASE_ANON_KEY.`);

  if (anonKey) {
    const claims = legacyAnonClaims(anonKey);
    if (claims.role !== 'anon') throw new Error(`${prefix}_SUPABASE_ANON_KEY não possui role anon.`);
    if (claims.ref !== definition.projectRef) throw new Error(`${prefix}_SUPABASE_ANON_KEY pertence a outro projeto Supabase.`);
  }

  if (publishableKey && !publishableKey.startsWith('sb_publishable_')) {
    throw new Error(`${prefix}_SUPABASE_PUBLISHABLE_KEY não possui o formato sb_publishable_.`);
  }

  return { app, projectRef, url, publishableKey, anonKey, secretKey };
}

export function validateOperationalSupabaseIsolation() {
  const zeus = readOperationalSupabaseConfig('zeus');
  const artemis = readOperationalSupabaseConfig('artemis');

  if (zeus.url === artemis.url || zeus.projectRef === artemis.projectRef) {
    throw new Error('Zeus e Artemis precisam apontar para projetos Supabase diferentes.');
  }
  if (zeus.anonKey && artemis.anonKey && zeus.anonKey === artemis.anonKey) {
    throw new Error('Zeus e Artemis não podem compartilhar a legacy anon key.');
  }
  if (zeus.publishableKey && artemis.publishableKey && zeus.publishableKey === artemis.publishableKey) {
    throw new Error('Zeus e Artemis não podem compartilhar a publishable key.');
  }
  if (zeus.secretKey && artemis.secretKey && zeus.secretKey === artemis.secretKey) {
    throw new Error('Zeus e Artemis não podem compartilhar a secret/service-role key.');
  }

  return {
    zeus: { projectRef: zeus.projectRef, url: zeus.url, keyMode: zeus.publishableKey ? 'publishable' : 'legacy-anon' },
    artemis: { projectRef: artemis.projectRef, url: artemis.url, keyMode: artemis.publishableKey ? 'publishable' : 'legacy-anon' }
  } as const;
}
