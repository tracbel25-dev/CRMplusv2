import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Subscriptions } from '@/components/Subscriptions';
import './checkout.css';

export const metadata={title:'Finalizar assinatura | CRM PLUS Store',robots:{index:false,follow:false}};

export default async function CheckoutPage({searchParams}:{searchParams:Promise<{app?:string;plano?:string;retorno?:string}>}){
  const params=await searchParams;
  return <><Header/><main className="page-shell checkout-shell"><div className="checkout-intro"><span className="eyebrow">Checkout</span><h1>Finalizar assinatura</h1><p>Escolha o ciclo e continue no Mercado Pago. Sua conta CRM PLUS permanece conectada durante todo o processo.</p></div><Subscriptions initialApp={params.app} initialPlan={params.plano} returned={params.retorno==='1'}/></main><Footer/></>;
}
