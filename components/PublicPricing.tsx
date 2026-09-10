'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { apps } from '@/lib/catalog';
import type { PublicPlan } from '@/lib/publicPlans';
import './public-pricing.css';

const cycles = [
  { id: 'monthly', label: 'Mensal', months: 1, detail: 'Pagamento mês a mês.' },
  { id: 'semiannual', label: 'Semestral', months: 6, detail: 'Uma cobrança a cada 6 meses.' },
  { id: 'annual', label: 'Anual', months: 12, detail: 'Uma cobrança a cada 12 meses.' },
] as const;
const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function PublicPricing({ plans, initialApp, fixedApp = false }: { plans: PublicPlan[]; initialApp?: string; fixedApp?: boolean }) {
  const available = apps.filter(app => plans.some(plan => plan.app_id === app.slug));
  const [selected, setSelected] = useState(initialApp || 'zeus');
  const app = available.find(item => item.slug === selected) || available[0];
  if (!app) return <section className="public-pricing" id="planos"><span className="eyebrow">Planos</span><h2>Consulte os planos dos aplicativos.</h2><p>Não foi possível carregar os valores agora. Atualize a página para tentar novamente.</p></section>;
  const appPlans = plans.filter(plan => plan.app_id === app.slug);
  const monthly = appPlans.find(plan => plan.billing_interval === 'monthly');
  return <section className={`public-pricing pricing-${app.tone}`} id="planos" aria-labelledby="public-pricing-title">
    <div className="public-pricing-heading"><div><span className="eyebrow">Planos por aplicativo</span><h2 id="public-pricing-title">Seu aplicativo.<br/>Seu ritmo de pagamento.</h2></div><p>Escolha o aplicativo e o ciclo de assinatura. Confira o valor total antes de contratar.</p></div>
    {!fixedApp && <div className="pricing-app-options" aria-label="Escolha o aplicativo">{available.map(item => <button key={item.slug} type="button" aria-pressed={app.slug === item.slug} onClick={() => setSelected(item.slug)}><strong>{item.name}</strong><span>{item.category}</span></button>)}</div>}
    <div className="pricing-app-heading"><h3>{app.name} <span>· {app.category}</span></h3><Link href={`/aplicativos/${app.slug}`}>Conhecer o aplicativo <ArrowRight size={16}/></Link></div>
    {['zeus', 'artemis'].includes(app.slug) && <p><Link className="ghost" href={`/assinaturas?app=${app.slug}#teste-gratis`}>Teste grátis por 7 dias</Link></p>}
    <div className="public-price-grid">{cycles.map(cycle => {
      const plan = appPlans.find(item => item.billing_interval === cycle.id);
      if (!plan) return null;
      const savings = monthly ? monthly.amount_cents * cycle.months - plan.amount_cents : 0;
      return <article className="public-price-card" key={plan.id}>
        <div className="price-card-heading"><h4>{cycle.label}</h4>{savings > 0 && <span>Economize {money(savings)}</span>}</div>
        <strong className="public-price-value">{money(plan.amount_cents)}</strong><p className="price-cycle-detail">{cycle.detail}</p>
        <p className="price-equivalent">{cycle.months > 1 ? `Equivale a ${money(plan.amount_cents / cycle.months)}/mês, cobrado por ciclo.` : 'Mais flexibilidade para começar.'}</p>
        <ul>{app.features.map(feature => <li key={feature}><Check size={16}/>{feature}</li>)}</ul>
        <Link className="primary" href={`/assinaturas?app=${app.slug}&plano=${plan.id}`}>Escolher {cycle.label.toLowerCase()} <ArrowRight size={16}/></Link>
      </article>;
    })}</div>
    <p className="public-pricing-note">Valores por aplicativo. Os ciclos incluem os mesmos recursos listados. Renovação automática; cancele as próximas cobranças quando precisar. O acesso começa após a confirmação do pagamento.</p>
  </section>;
}
