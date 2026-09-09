import { OPERATIONAL_SUPABASE, type FixedOperationalApp } from './fixedProjects';

type OperationalApp = FixedOperationalApp;

type OperationalSupabaseConfig = {
  app: OperationalApp;
  projectRef: string;
  url: string;
  publishableKey: string;
  anonKey: string;
  secretKey: string;
};

function env(name: string) {
  return process.env[name]?.trim() || '';
}

export function readOperationalSupabaseConfig(app: OperationalApp): OperationalSupabaseConfig {
  const definition = OPERATIONAL_SUPABASE[app];
  const secretKey = env(`${definition.envPrefix}_SUPABASE_SECRET_KEY`);

  return {
    app,
    projectRef: definition.projectRef,
    url: definition.url,
    publishableKey: definition.publishableKey,
    anonKey: '',
    secretKey,
  };
}

export function validateOperationalSupabaseIsolation() {
  const zeus = readOperationalSupabaseConfig('zeus');
  const artemis = readOperationalSupabaseConfig('artemis');

  if (zeus.url === artemis.url || zeus.projectRef === artemis.projectRef) {
    throw new Error('Zeus e Artemis precisam apontar para projetos Supabase diferentes.');
  }
  if (zeus.publishableKey === artemis.publishableKey) {
    throw new Error('Zeus e Artemis não podem compartilhar a publishable key.');
  }
  if (zeus.secretKey && artemis.secretKey && zeus.secretKey === artemis.secretKey) {
    throw new Error('Zeus e Artemis não podem compartilhar a secret/service-role key.');
  }

  return {
    zeus: { projectRef: zeus.projectRef, url: zeus.url, keyMode: 'publishable' as const },
    artemis: { projectRef: artemis.projectRef, url: artemis.url, keyMode: 'publishable' as const },
  } as const;
}
