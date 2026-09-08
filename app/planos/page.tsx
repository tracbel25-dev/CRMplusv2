import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { pricingGroups } from '@/lib/pricing';

const money=(n:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(n);
export default function Planos(){return <><Header/><main className="page-shell"><div className="page-intro"><span className="eyebrow">Planos</span><h1>Preço claro. Sem enrolação.</h1><p>Escolha o ciclo de assinatura do aplicativo que você precisa.</p></div><div className="pricing-grid">{pricingGroups.map(group=><section className="pricing-group" key={group.label}><div><span className="eyebrow">{group.label}</span><h2>{group.apps.join(' · ')}</h2></div><div className="price-cards"><div><span>Mensal</span><strong>{money(group.price.monthly)}</strong><small>cobrança mensal</small></div><div><span>Semestral</span><strong>{money(group.price.semiannual)}</strong><small>ciclo de 6 meses</small></div><div><span>Anual</span><strong>{money(group.price.annual)}</strong><small>ciclo de 12 meses</small></div></div></section>)}</div></main><Footer/></>}
