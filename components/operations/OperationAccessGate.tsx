'use client';

import Link from 'next/link';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { apps } from '@/lib/catalog';
import type { AppId } from '@/lib/operations/model';
import { useLocalAccess } from '@/lib/account/localAccess';

export function OperationAccessGate({ app, children }: { app: AppId; children: ReactNode }) {
  const access = useLocalAccess();
  const pathname = usePathname();
  const product = apps.find(item => item.slug === app);
  const loginHref = `/login?app=${encodeURIComponent(app)}&redirect=${encodeURIComponent(pathname || `/${app}`)}`;

  if (!access.ready) return <div className="op-access-screen"><div className="op-loading">Verificando acesso…</div></div>;

  if (!access.member || !access.account) {
    return <main className="op-access-screen">
      <section className="op-access-card">
        <span className="op-access-icon"><LockKeyhole size={22} /></span>
        <span className="op-kicker">{product?.name || app}</span>
        <h1>Entre para abrir este aplicativo.</h1>
        <p>O destino fica preservado. Depois do acesso, você volta direto para esta área.</p>
        <div className="op-actions">
          <Link className="op-button" href={loginHref}>Entrar <ArrowRight size={16} /></Link>
          <Link className="op-button secondary" href={`/aplicativos/${app}`}>Conhecer o aplicativo</Link>
        </div>
        <small>Protótipo local de conta e acessos. A autenticação real será conectada ao Supabase depois da validação desta experiência.</small>
      </section>
    </main>;
  }

  if (!access.hasApp(app)) {
    return <main className="op-access-screen">
      <section className="op-access-card">
        <span className="op-access-icon"><LockKeyhole size={22} /></span>
        <span className="op-kicker">Conta: {access.account.business}</span>
        <h1>Seu acesso não inclui {product?.name || app}.</h1>
        <p>Você entrou como {access.member.name}. Os aplicativos disponíveis dependem das assinaturas da conta e das permissões atribuídas a este usuário.</p>
        <div className="op-actions">
          <Link className="op-button" href="/entrar">Ver meus aplicativos <ArrowRight size={16} /></Link>
          <Link className="op-button secondary" href={`/aplicativos/${app}`}>Conhecer {product?.name || app}</Link>
        </div>
      </section>
    </main>;
  }

  return <>{children}</>;
}
