import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { AppArtwork } from '@/components/AppArtwork';
import { apps } from '@/lib/catalog';

export function generateStaticParams(){return apps.map(app=>({slug:app.slug}))}

export default async function Product({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params; const app=apps.find(item=>item.slug===slug); if(!app) notFound();
  return <><Header/><main><section className={`product-hero product-${app.tone}`}><div><span className="eyebrow">{app.category}</span><h1>{app.name}</h1><p>{app.description}</p><div className="feature-list">{app.features.map(feature=><span key={feature}>{feature}</span>)}</div><div className="hero-actions"><Link className="primary" href={`/cadastro?app=${app.slug}`}>Assinar agora</Link><Link className="ghost" href="/planos">Ver planos</Link></div></div><AppArtwork tone={app.tone}/></section><section className="product-copy"><span className="eyebrow">Produto independente</span><h2>Uma experiência própria para {app.category.toLowerCase()}.</h2><p>Esta é a base comercial e de SEO do aplicativo. A interface interna, o login direto e a infraestrutura seguem a identidade própria de cada produto.</p><Link href={`/login?app=${app.slug}`}>Já sou cliente: entrar direto <ArrowRight size={16}/></Link></section></main><Footer/></>
}
