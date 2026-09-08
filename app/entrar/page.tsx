import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { apps } from '@/lib/catalog';
import { AppArtwork } from '@/components/AppArtwork';
import './entry.css';
export const metadata={title:'Abrir aplicativo | CRM PLUS Store'};
export default function Entry(){return <><Header/><main className="page-shell entry-page"><div className="page-intro"><span className="eyebrow">Seu próximo acesso</span><h1>Em qual app vamos trabalhar?</h1><p>Entre direto. Seus registros ficam salvos neste navegador.</p></div><div className="entry-grid">{apps.map(app=><Link href={`/${app.slug}`} key={app.slug} className={`entry-app entry-${app.tone}`}><div className="entry-art"><AppArtwork tone={app.tone} compact/></div><div><small>{app.category}</small><h2>{app.name}</h2><span>Abrir aplicativo <ArrowRight size={18}/></span></div></Link>)}</div></main><Footer/></>}
