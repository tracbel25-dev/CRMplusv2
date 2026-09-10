import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { apps } from '@/lib/catalog';
import { AppArtwork } from '@/components/AppArtwork';

export default function Aplicativos(){return <><Header/><main className="page-shell"><div className="page-intro"><span className="eyebrow">Catálogo</span><h1>Aplicativos feitos para rotinas diferentes.</h1><p>Conheça cada produto e, quando fizer sentido, abra os preços daquele aplicativo para testar, ativar ou reativar.</p></div><div className="catalog-grid">{apps.map(app=><article className="catalog-card" key={app.slug}><AppArtwork tone={app.tone} compact/><div><span>{app.segment} · {app.category}</span><h2>{app.name}</h2><p>{app.description}</p><Link className="primary small" href={`/planos?app=${encodeURIComponent(app.slug)}`}>Ver preços <ArrowRight size={16}/></Link><Link href={`/aplicativos/${app.slug}`}>Conhecer aplicativo <ArrowRight size={16}/></Link></div></article>)}</div></main><Footer/></>}
