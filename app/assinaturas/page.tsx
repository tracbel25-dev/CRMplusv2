import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { AccountNav } from '@/components/AccountNav';
import { BillingPortal } from '@/components/BillingPortal';
import '../account-area.css';
import './subscriptions.css';

export const metadata={title:'Assinaturas e cobrança | CRM PLUS Store',robots:{index:false,follow:false}};

export default async function Page({searchParams}:{searchParams:Promise<{retorno?:string}>}){
  const params=await searchParams;
  return <><Header/><main className="page-shell account-area-shell billing-portal-shell"><AccountNav/><section className="billing-portal-intro"><div><span className="account-kicker">Financeiro</span><h1>Assinaturas e cobrança</h1><p>Planos ativos, testes, renovações e pagamentos da sua empresa. A contratação de novos aplicativos acontece separadamente na Store.</p></div></section><BillingPortal returned={params.retorno==='1'}/></main><Footer/></>;
}
