'use client';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, Pause, Play, Search } from 'lucide-react';
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
 const [heroPaused,setHeroPaused]=useState(false);
 const [heroInteracting,setHeroInteracting]=useState(false);
 const [reducedMotion,setReducedMotion]=useState(false);
 useEffect(()=>{
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  const sync=()=>setReducedMotion(media.matches);
  sync(); media.addEventListener('change',sync);
  return()=>media.removeEventListener('change',sync);
 },[]);
 useEffect(()=>{
  if(heroPaused||heroInteracting||reducedMotion)return;
  const id=setInterval(()=>setHero(v=>(v+1)%featured.length),5000);
  return()=>clearInterval(id);
 },[heroPaused,heroInteracting,reducedMotion]);
 useEffect(()=>{const id=setInterval(()=>setImpact(v=>(v+1)%impacts.length),6500);return()=>clearInterval(id)},[]);
 const segments=['Todos',...Array.from(new Set(apps.map(a=>a.segment)))];
 const filtered=useMemo(()=>apps.filter(app=>{const q=query.toLowerCase(); return (segment==='Todos'||app.segment===segment)&&`${app.name} ${app.category} ${app.segment}`.toLowerCase().includes(q)}),[query,segment]);
 const current=featured[hero];
 return <>
  <section className="store-cover" aria-labelledby="store-cover-title">
   <Image className="store-cover-image" src="/images/store-cover.webp" alt="" fill sizes="100vw" preload/>
   <div className="store-cover-inner"><div className="store-cover-copy"><span className="eyebrow">CRM PLUS Store</span><h1 id="store-cover-title">O controle do seu negócio na palma da mão. <em>E no seu bolso.</em></h1><p>Escolha a ferramenta que entende a sua operação — sem transformar tudo no mesmo sistema.</p><div className="store-cover-actions"><Link className="primary" href="/aplicativos">Explorar aplicativos</Link><Link className="ghost" href="/login">Já sou cliente</Link></div></div></div>
  </section>
  <section className="store-featured" aria-label="Aplicativos em destaque" aria-roledescription="carrossel" onMouseEnter={()=>setHeroInteracting(true)} onMouseLeave={()=>setHeroInteracting(false)} onFocusCapture={()=>setHeroInteracting(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setHeroInteracting(false)}}>
   <div className={`product-spotlight product-spotlight-${current.tone}`}>
    <div className="spotlight-images" aria-hidden="true">{featured.map((app,index)=><Image key={app.slug} className={`spotlight-image spotlight-image-${app.tone}${hero===index?' is-active':''}`} src={`/images/${app.slug}-cover.webp`} alt="" fill sizes="(max-width: 1360px) 100vw, 1304px"/>)}</div>
    <div className="spotlight-body"><span className="eyebrow">{hero===0?'Em destaque agora':'Descubra agora'}</span><div className="spotlight-copy"><span className="spotlight-kind">{current.short}</span><h2>{current.name}</h2><ul>{current.features.slice(0,3).map(feature=><li key={feature}>{feature}</li>)}</ul><Link className="primary" href={`/aplicativos/${current.slug}`}>Conheça agora <ArrowRight size={17}/></Link></div></div>
    <div className="spotlight-controls"><span className="spotlight-position">{String(hero+1).padStart(2,'0')} / {String(featured.length).padStart(2,'0')}</span>{!reducedMotion&&<button onClick={()=>setHeroPaused(v=>!v)} aria-label={heroPaused?'Retomar destaques automáticos':'Pausar destaques automáticos'}>{heroPaused?<Play size={16}/>:<Pause size={16}/>}</button>}<button onClick={()=>setHero(v=>(v-1+featured.length)%featured.length)} aria-label="Destaque anterior"><ArrowLeft size={19}/></button><button onClick={()=>setHero(v=>(v+1)%featured.length)} aria-label="Próximo destaque"><ArrowRight size={19}/></button></div>
   </div>
  </section>
  <section className="catalog-preview"><div className="section-heading"><div><span className="eyebrow">Aplicativos</span><h2>Escolha sua próxima ferramenta.</h2></div><Link href="/aplicativos">Ver catálogo completo <ArrowRight size={16}/></Link></div><div className="catalog-tools"><label className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar por aplicativo ou segmento"/></label><div className="filters">{segments.map(item=><button key={item} className={segment===item?'active':''} onClick={()=>setSegment(item)}>{item}</button>)}</div></div><div className="shelf">{filtered.map(app=><article className="app-cover" key={app.slug}><AppArtwork tone={app.tone} compact/><div className="cover-copy"><span>{app.category}</span><h3>{app.name}</h3><p>{app.description}</p><div className="cover-actions"><Link className="ghost small" href={`/${app.slug}`}>Abrir app</Link><Link className="primary small" href={`/aplicativos/${app.slug}`}>Conheça agora</Link></div></div></article>)}</div></section>
  <section className="store-story" id="sobre"><div className="story-number">01</div><div><span className="eyebrow">Uma Store, produtos próprios</span><h2>Você não precisa adaptar seu negócio a um software genérico.</h2></div><p>Cada aplicativo nasce para uma rotina diferente. A Store é o lugar para descobrir, comparar e entrar no produto que corresponde ao seu trabalho.</p></section>
  <section className="impact"><span className="eyebrow">Tecnologia na prática</span><div className="impact-slider"><button onClick={()=>setImpact((impact-1+impacts.length)%impacts.length)}><ArrowLeft/></button><blockquote>{impacts[impact]}</blockquote><button onClick={()=>setImpact((impact+1)%impacts.length)}><ArrowRight/></button></div><div className="impact-source">Referências indicadas no projeto: OCDE e Sebrae.</div><Link className="primary" href="/aplicativos">Conheça nossas ferramentas</Link></section>
  <section className="testimonials"><span className="eyebrow">Clientes</span><h2>Em breve teremos novidades.</h2><p>Sem depoimentos inventados. Esta área será preenchida quando existirem relatos reais autorizados.</p></section>
  <section className="final-cta"><div><span className="eyebrow">CRM PLUS Store</span><h2>Encontre a ferramenta que combina com a sua operação.</h2></div><div><Link className="primary" href="/aplicativos">Explorar Store</Link><Link className="ghost" href="/login">Acessar conta</Link></div></section>
 </>;
}
