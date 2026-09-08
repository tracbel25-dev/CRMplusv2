'use client';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { apps, featured } from '@/lib/catalog';
import { AppArtwork } from './AppArtwork';

const impacts=[
'A OCDE aponta que tecnologias digitais podem reduzir custos operacionais, melhorar a tomada de decisão e gerar ganhos de produtividade, especialmente em pequenas e médias empresas.',
'O Sebrae destaca que automatizar tarefas repetitivas pode tornar o atendimento mais rápido e liberar a equipe para atividades que exigem análise.',
'O Sebrae também destaca que tecnologias antes restritas a grandes empresas passaram a ser acessíveis a pequenos negócios em tarefas como atendimento, vendas e marketing.'
];

export function HomeExperience(){
 const [hero,setHero]=useState(0); const [impact,setImpact]=useState(0); const [query,setQuery]=useState(''); const [segment,setSegment]=useState('Todos');
 useEffect(()=>{const id=setInterval(()=>setHero(v=>(v+1)%featured.length),5000);return()=>clearInterval(id)},[]);
 useEffect(()=>{const id=setInterval(()=>setImpact(v=>(v+1)%impacts.length),6500);return()=>clearInterval(id)},[]);
 const segments=['Todos',...Array.from(new Set(apps.map(a=>a.segment)))];
 const filtered=useMemo(()=>apps.filter(app=>{const q=query.toLowerCase(); return (segment==='Todos'||app.segment===segment)&&`${app.name} ${app.category} ${app.segment}`.toLowerCase().includes(q)}),[query,segment]);
 const current=featured[hero];
 return <>
  <section className={`hero hero-${current.tone}`}>
   <div className="hero-copy"><span className="eyebrow">CRM PLUS Store</span><h1>O controle do seu negócio na palma da mão. <em>E no seu bolso.</em></h1><p>Escolha a ferramenta que entende a sua operação — sem transformar tudo no mesmo sistema.</p><div className="hero-actions"><Link className="primary" href="/aplicativos">Explorar aplicativos</Link><Link className="ghost" href="/login">Já sou cliente</Link></div></div>
   <div className="featured-shell"><AppArtwork tone={current.tone}/><div className="featured-overlay"><span className="trend">{hero===0?'Em destaque agora':'Descubra agora'}</span><div><span className="product-kind">{current.short}</span><h2>{current.name}</h2><p>{current.features.slice(0,3).join(' • ')}</p></div><Link href={`/aplicativos/${current.slug}`}>Conheça agora <ArrowRight size={17}/></Link></div><button className="hero-arrow hero-prev" onClick={()=>setHero((hero-1+featured.length)%featured.length)} aria-label="Destaque anterior"><ArrowLeft/></button><button className="hero-arrow hero-next" onClick={()=>setHero((hero+1)%featured.length)} aria-label="Próximo destaque"><ArrowRight/></button></div>
  </section>
  <section className="catalog-preview"><div className="section-heading"><div><span className="eyebrow">Aplicativos</span><h2>Escolha sua próxima ferramenta.</h2></div><Link href="/aplicativos">Ver catálogo completo <ArrowRight size={16}/></Link></div><div className="catalog-tools"><label className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar por aplicativo ou segmento"/></label><div className="filters">{segments.map(item=><button key={item} className={segment===item?'active':''} onClick={()=>setSegment(item)}>{item}</button>)}</div></div><div className="shelf">{filtered.map(app=><article className="app-cover" key={app.slug}><AppArtwork tone={app.tone} compact/><div className="cover-copy"><span>{app.category}</span><h3>{app.name}</h3><p>{app.description}</p><div className="cover-actions"><Link className="ghost small" href={`/login?app=${app.slug}`}>Login</Link><Link className="primary small" href={`/aplicativos/${app.slug}`}>Conheça agora</Link></div></div></article>)}</div></section>
  <section className="store-story" id="sobre"><div className="story-number">01</div><div><span className="eyebrow">Uma Store, produtos próprios</span><h2>Você não precisa adaptar seu negócio a um software genérico.</h2></div><p>Cada aplicativo nasce para uma rotina diferente. A Store é o lugar para descobrir, comparar e entrar no produto que corresponde ao seu trabalho.</p></section>
  <section className="impact"><span className="eyebrow">Tecnologia na prática</span><div className="impact-slider"><button onClick={()=>setImpact((impact-1+impacts.length)%impacts.length)}><ArrowLeft/></button><blockquote>{impacts[impact]}</blockquote><button onClick={()=>setImpact((impact+1)%impacts.length)}><ArrowRight/></button></div><div className="impact-source">Referências indicadas no projeto: OCDE e Sebrae.</div><Link className="primary" href="/aplicativos">Conheça nossas ferramentas</Link></section>
  <section className="testimonials"><span className="eyebrow">Clientes</span><h2>Em breve teremos novidades.</h2><p>Sem depoimentos inventados. Esta área será preenchida quando existirem relatos reais autorizados.</p></section>
  <section className="final-cta"><div><span className="eyebrow">CRM PLUS Store</span><h2>Encontre a ferramenta que combina com a sua operação.</h2></div><div><Link className="primary" href="/aplicativos">Explorar Store</Link><Link className="ghost" href="/login">Acessar conta</Link></div></section>
 </>;
}
