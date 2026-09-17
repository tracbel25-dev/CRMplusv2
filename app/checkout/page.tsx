import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Subscriptions } from '@/components/Subscriptions';
import './checkout.css';

export const metadata={title:'Ativar plano | CRM PLUS Store',robots:{index:false,follow:false}};

export default async function CheckoutPage({searchParams}:{searchParams:Promise<{app?:string;plano?:string;retorno?:string}>}){
  const params=await searchParams;
  return <><Header/><main className="page-shell checkout-shell"><div className="checkout-intro"><span className="eyebrow">Ativação</span><h1>Ativar seu plano</h1><p>Primeiro validamos a elegibilidade do teste grátis. Se ele não estiver disponível, você pode seguir normalmente para a assinatura pelo Mercado Pago.</p></div><Subscriptions initialApp={params.app} initialPlan={params.plano} returned={params.retorno==='1'}/></main><Footer/></>;
}
