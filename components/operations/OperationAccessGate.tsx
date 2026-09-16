'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { AppLoadingScreen } from '@/components/AppLoadingScreen';
import { useStoreAccess } from '@/lib/account/storeAccess';
import type { AppId } from '@/lib/operations/model';
import { TrialProtection } from './TrialProtection';

export function OperationAccessGate({ app, children }: { app: AppId; children: ReactNode }) {
  const access = useStoreAccess();
  const router = useRouter();
  const pathname = usePathname();
  const allowed = access.ready && access.hasApp(app);
  const entitlement = access.account?.apps.find(item => item.appId === app);
  const trialing = allowed && entitlement?.status === 'trialing' && !!entitlement.currentPeriodEnd && Date.parse(entitlement.currentPeriodEnd) > Date.now();

  useEffect(() => {
    if (!access.ready) return;
    if (!access.user) {
      const destination = pathname || `/${app}`;
      router.replace(`/login?app=${encodeURIComponent(app)}&redirect=${encodeURIComponent(destination)}`);
      return;
    }
    if (!allowed && !access.error) router.replace(`/checkout?app=${encodeURIComponent(app)}`);
  }, [access.ready, access.user, access.error, allowed, app, pathname, router]);

  if (!access.ready) return <AppLoadingScreen label="Carregando acesso" />;

  if (access.error) return <main className="op-access-gate"><section className="op-access-gate-card"><span>CRM PLUS</span><h1>Não foi possível validar seu acesso.</h1><p>{access.error}</p><div><button type="button" onClick={() => void access.refresh()}>Tentar novamente</button><Link href="/conta">Minha conta</Link></div></section></main>;

  if (!access.user) return <AppLoadingScreen label="Abrindo login" />;
  if (!allowed) return <AppLoadingScreen label="Carregando acesso ao aplicativo" />;

  if (trialing && access.account) return <TrialProtection app={app} accountName={access.account.name} email={access.user.email}>{children}</TrialProtection>;
  return <>{children}</>;
}
