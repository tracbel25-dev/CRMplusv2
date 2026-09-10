import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Subscriptions } from '@/components/Subscriptions';
import './subscriptions.css';

export const metadata = { title: 'Assinaturas | CRM PLUS Store', robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ app?: string; retorno?: string; plano?: string }> }) {
  const params = await searchParams;
  return <><Header/><main className="page-shell billing-shell"><div className="page-intro"><span className="eyebrow">Sua conta</span><h1>Assinaturas</h1><p>Seus aplicativos, teste grátis e pagamentos em um só lugar.</p></div><Subscriptions initialApp={params.app} initialPlan={params.plano} returned={params.retorno === '1'}/></main><Footer/></>;
}
