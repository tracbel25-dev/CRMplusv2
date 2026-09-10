'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, Pause, Play, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { apps, featured } from '@/lib/catalog';
import { AppArtwork } from './AppArtwork';
import { AppAsset } from './AppAsset';

type Impact = {
  label: string;
  body: string;
  source?: string;
  author?: string;
  role?: string;
  kind: 'external' | 'crmplus';
};

const impacts: Impact[] = [
  {
    label: 'OCDE',
    body: 'A OCDE aponta que tecnologias digitais podem reduzir custos operacionais, melhorar a tomada de decisão e gerar ganhos de produtividade, especialmente em pequenas e médias empresas.',
    source: 'OCDE',
    kind: 'external',
  },
  {
    label: 'Sebrae',
    body: 'O Sebrae destaca que automatizar tarefas repetitivas pode tornar o atendimento mais rápido e liberar a equipe para atividades que exigem análise.',
    source: 'Sebrae',
    kind: 'external',
  },
  {
    label: 'Sebrae',
    body: 'O Sebrae também destaca que tecnologias antes restritas a grandes empresas passaram a ser acessíveis a pequenos negócios em tarefas como atendimento, vendas e marketing.',
    source: 'Sebrae',
    kind: 'external',
  },
  {
    label: 'Visão CRM PLUS',
    body: 'Pensamos o CRM PLUS tanto para quem está começando e precisa de apoio para organizar a empresa quanto para quem já conhece bem a própria operação e sabe o que procura. O objetivo é entregar informações que realmente contribuam para acompanhar o negócio e tomar decisões.',
    author: 'Deivid Lohan',
    role: 'Sócio e desenvolvedor — CRM PLUS',
    kind: 'crmplus',
  },
  {
    label: 'Visão CRM PLUS',
    body: 'Eu não queria criar um sistema engessado por processos. Queria uma estrutura que transmitisse confiança no dia a dia e, ao mesmo tempo, respeitasse a forma de trabalhar de cada negócio. Ao estudar diferentes operações, ficou claro que a personalização precisava fazer parte do produto. Agora, a inteligência artificial entra para agregar ainda mais a essa estrutura.',
    author: 'Alisson Mafra',
    role: 'Sócio e fundador — CRM PLUS',
    kind: 'crmplus',
  },
];

export function HomeExperience({ pricing }: { pricing?: ReactNode }) {
  const [hero, setHero] = useState(0);
  const [impact, setImpact] = useState(0);
  const [query, setQuery] = useState('');
  const [segment, setSegment] = useState('Todos');
  const [heroPaused, setHeroPaused] = useState(false);
  const [heroInteracting, setHeroInteracting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const heroCount = featured.length + 1;

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (heroPaused || heroInteracting || reducedMotion) return;
    const id = setInterval(() => setHero((value) => (value + 1) % heroCount), 5000);
    return () => clearInterval(id);
  }, [heroPaused, heroInteracting, reducedMotion, heroCount]);

  useEffect(() => {
    const id = setInterval(() => setImpact((value) => (value + 1) % impacts.length), 6500);
    return () => clearInterval(id);
  }, []);

  const segments = ['Todos', ...Array.from(new Set(apps.map((app) => app.segment)))];
  const filtered = useMemo(
    () =>
      apps.filter((app) => {
        const q = query.toLowerCase();
        return (
          (segment === 'Todos' || app.segment === segment) &&
          `${app.name} ${app.category} ${app.segment}`.toLowerCase().includes(q)
        );
      }),
    [query, segment],
  );

  const isEditorialHero = hero === featured.length;
  const current = featured[hero];
  const currentImpact = impacts[impact];

  return (
    <>
      <section className="store-cover" aria-labelledby="store-cover-title">
        <Image className="store-cover-image" src="/images/store-cover.webp" alt="" fill sizes="100vw" preload />
        <div className="store-cover-inner">
          <div className="store-cover-copy">
            <span className="eyebrow">CRM PLUS Store</span>
            <h1 id="store-cover-title">
              O controle do seu negócio na palma da mão. <em>E no seu bolso.</em>
            </h1>
            <p>Escolha a ferramenta que entende a sua operação — sem transformar tudo no mesmo sistema.</p>
            <div className="store-cover-actions">
              <Link className="primary" href="/aplicativos">Explorar aplicativos</Link>
              <Link className="ghost" href="/planos">Ver planos</Link>
              <Link className="ghost" href="/login">Já sou cliente</Link>
            </div>
          </div>
        </div>
      </section>

      <section
        className="store-featured"
        aria-label="Aplicativos e proposta em destaque"
        aria-roledescription="carrossel"
        onMouseEnter={() => setHeroInteracting(true)}
        onMouseLeave={() => setHeroInteracting(false)}
        onFocusCapture={() => setHeroInteracting(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHeroInteracting(false);
        }}
      >
        <div className={`product-spotlight product-spotlight-${current?.tone ?? 'editorial'}`}>
          <div className="spotlight-images" aria-hidden="true">
            {featured.map((app, index) => (
              <AppAsset
                key={app.slug}
                app={app.slug}
                kind="cover"
                className={`spotlight-image spotlight-image-${app.tone}${hero === index ? ' is-active' : ''}`}
                alt=""
                style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}}
              />
            ))}
          </div>
          <div className="spotlight-body">
            <span className="eyebrow">
              {isEditorialHero ? 'Como desenvolvemos' : hero === 0 ? 'Em destaque agora' : 'Descubra agora'}
            </span>

            {isEditorialHero ? (
              <div className="spotlight-copy spotlight-copy-editorial">
                <span className="spotlight-kind">CRM PLUS Store</span>
                <h2>Menos burocracia.</h2>
                <p>Estudamos cada segmento para transformar processos do dia a dia em ações mais simples, com menos etapas e menos cliques, contando também com o auxílio da inteligência artificial onde ela realmente agrega valor.</p>
              </div>
            ) : current ? (
              <div className="spotlight-copy">
                <span className="spotlight-kind">{current.short}</span>
                <h2>{current.name}</h2>
                <ul>{current.features.slice(0, 3).map((feature) => <li key={feature}>{feature}</li>)}</ul>
                <Link className="primary" href={`/aplicativos/${current.slug}`}>Conheça agora <ArrowRight size={17} /></Link>
              </div>
            ) : null}
          </div>
          <div className="spotlight-controls">
            <span className="spotlight-position">{String(hero + 1).padStart(2, '0')} / {String(heroCount).padStart(2, '0')}</span>
            {!reducedMotion && (
              <button onClick={() => setHeroPaused((value) => !value)} aria-label={heroPaused ? 'Retomar destaques automáticos' : 'Pausar destaques automáticos'}>
                {heroPaused ? <Play size={16} /> : <Pause size={16} />}
              </button>
            )}
            <button onClick={() => setHero((value) => (value - 1 + heroCount) % heroCount)} aria-label="Destaque anterior"><ArrowLeft size={19} /></button>
            <button onClick={() => setHero((value) => (value + 1) % heroCount)} aria-label="Próximo destaque"><ArrowRight size={19} /></button>
          </div>
        </div>
      </section>

      <section className="catalog-preview">
        <div className="section-heading">
          <div><span className="eyebrow">Aplicativos</span><h2>Escolha sua próxima ferramenta.</h2></div>
          <Link href="/aplicativos">Ver catálogo completo <ArrowRight size={16} /></Link>
        </div>
        <div className="catalog-tools">
          <label className="search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por aplicativo ou segmento" /></label>
          <div className="filters">{segments.map((item) => <button key={item} className={segment === item ? 'active' : ''} onClick={() => setSegment(item)}>{item}</button>)}</div>
        </div>
        <div className="shelf">
          {filtered.map((app) => (
            <article className="app-cover" key={app.slug}>
              <AppArtwork tone={app.tone} compact />
              <div className="cover-copy">
                <span>{app.category}</span>
                <h3>{app.name}</h3>
                <p>{app.description}</p>
                <div className="cover-actions">
                  <Link className="ghost small" href={`/aplicativos/${app.slug}`}>Conhecer</Link>
                  <Link className="primary small" href={`/planos?app=${encodeURIComponent(app.slug)}`}>Ver preços</Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {pricing}

      <section className="store-story" id="sobre">
        <div className="story-number">01</div>
        <div>
          <span className="eyebrow">Estrutura pronta, operação personalizada</span>
          <h2>O sistema se adapta ao seu modelo de operação.</h2>
        </div>
        <p>Cada aplicativo possui uma configuração padrão, mas você mesmo pode personalizá-lo. E, se precisar, oferecemos suporte para ajudar na configuração.</p>
      </section>

      <section className="impact" aria-label="Tecnologia na prática e visão CRM PLUS">
        <span className="eyebrow">{currentImpact.label}</span>
        <div className="impact-slider">
          <button onClick={() => setImpact((impact - 1 + impacts.length) % impacts.length)} aria-label="Citação anterior"><ArrowLeft /></button>
          <blockquote>“{currentImpact.body}”</blockquote>
          <button onClick={() => setImpact((impact + 1) % impacts.length)} aria-label="Próxima citação"><ArrowRight /></button>
        </div>
        <div className="impact-source">
          {currentImpact.kind === 'external' ? (
            <>Fonte indicada no projeto: <strong>{currentImpact.source}</strong>.</>
          ) : (
            <><strong>{currentImpact.author}</strong><span>{currentImpact.role}</span></>
          )}
        </div>
        <Link className="primary" href="/aplicativos">Conheça nossas ferramentas</Link>
      </section>

      <section className="testimonials">
        <span className="eyebrow">Clientes</span>
        <h2>Em breve teremos novidades.</h2>
        <p>Sem depoimentos inventados. Esta área será preenchida quando existirem relatos reais autorizados.</p>
      </section>

      <section className="final-cta">
        <div><span className="eyebrow">CRM PLUS Store</span><h2>Encontre a ferramenta que combina com a sua operação.</h2></div>
        <div><Link className="primary" href="/aplicativos">Explorar Store</Link><Link className="ghost" href="/login">Acessar conta</Link></div>
      </section>
    </>
  );
}
