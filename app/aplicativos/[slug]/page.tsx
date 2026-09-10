import Link from 'next/link';
import { PublicPricing } from '@/components/PublicPricing';
import { getPublicPlans } from '@/lib/publicPlans';
export const revalidate = 60;
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { AppArtwork } from '@/components/AppArtwork';
import { apps } from '@/lib/catalog';

export function generateStaticParams(){return apps.map(app=>({slug:app.slug}))}

export default async function Product({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params; const app=apps.find(item=>item.slug===slug); if(!app) notFound();
  const plans=await getPublicPlans();
  const loginHref=`/login?app=${encodeURIComponent(app.slug)}&redirect=${encodeURIComponent(`/${app.slug}`)}`;
  const signupHref=`/checkout?app=${encodeURIComponent(app.slug)}`;
  return <><Header/><main><section className={`product-hero product-${app.tone}`}><div><span className="eyebrow">{app.category}</span><h1>{app.name}</h1><p>{app.description}</p><div className="feature-list">{app.features.map(feature=><span key={feature}>{feature}</span>)}</div><div className="hero-actions"><Link className="primary" href={signupHref}>Começar com {app.name}</Link><Link className="ghost" href={loginHref}>Já sou cliente</Link></div></div><AppArtwork tone={app.tone}/></section><section className="product-copy"><span className="eyebrow">Produto independente</span><h2>Uma experiência própria para {app.category.toLowerCase()}.</h2><p>A contratação fica vinculada à conta CRM PLUS. Depois, o titular define quais usuários podem entrar neste aplicativo.</p><div className="hero-actions"><Link href={loginHref}>Entrar no aplicativo <ArrowRight size={16}/></Link><Link href={`/planos?app=${encodeURIComponent(app.slug)}`}>Ver planos</Link></div></section><PublicPricing plans={plans.filter(plan=>plan.app_id===app.slug)} initialApp={app.slug} fixedApp/></main><Footer/></>;
}
