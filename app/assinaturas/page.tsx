import { redirect } from 'next/navigation';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { AccountNav } from '@/components/AccountNav';
import { BillingPortal } from '@/components/BillingPortal';
import { MercadoPagoConnection } from '@/components/MercadoPagoConnection';
import '../account-area.css';
import './subscriptions.css';
import './mercadopago-connect.css';

export const metadata={title:'Assinaturas e cobrança | CRM PLUS Store',robots:{index:false,follow:false}};

export default async function Page({searchParams}:{searchParams:Promise<{app?:string;plano?:string;retorno?:string;mp?:string}>}){
  const params=await searchParams;
  if(params.app||params.plano){
    const query=new URLSearchParams();
    if(params.app)query.set('app',params.app);
    if(params.plano)query.set('plano',params.plano);
    redirect(`/checkout?${query.toString()}`);
  }
  return <><Header/><main className="page-shell account-area-shell billing-portal-shell"><AccountNav/><section className="billing-portal-intro"><div><span className="account-kicker">Financeiro</span><h1>Assinaturas e cobrança</h1><p>Planos ativos, testes, renovações e pagamentos da sua empresa. A contratação de novos aplicativos acontece separadamente na Store.</p></div></section><BillingPortal returned={params.retorno==='1'}/><MercadoPagoConnection returned={params.mp}/></main><Footer/></>;
}
