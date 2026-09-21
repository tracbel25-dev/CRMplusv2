'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bike, ChefHat, Copy, Flame, Link2, Maximize2 } from 'lucide-react';

import { useOperationPreferences } from '@/lib/operations/configuration';
import type { Workspace } from '@/lib/operations/storage';
import { Artemis } from './Artemis';
import { ArtemisMenuManager } from './ArtemisMenuManager';
import { ArtemisMenuImport } from './ArtemisMenuImport';
import { ArtemisMenuIntelligence } from './ArtemisMenuIntelligence';
import { Badge, Button, Title } from './ui';
import { useArtemisCloud } from './useArtemisCloud';
import { ArtemisPendingDecisions } from './ArtemisPendingDecisions';
import './artemis-direct.css';

type ServiceView = 'pedidos' | 'mesas' | 'caixa';
const servicePages = new Set(['atendimento','pedidos','mesas','caixa']);

function tryOrderSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.32);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.34);
    oscillator.addEventListener('ended', () => void context.close());
  } catch {
    // Navegadores podem bloquear áudio antes da primeira interação do operador.
  }
}

function SharePanel({ slug, cloudError, deliveryEnabled, pickupEnabled }: { slug: string; cloudError: string; deliveryEnabled: boolean; pickupEnabled: boolean }) {
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const menuUrl = origin && slug ? `${origin}/artemis/menu/${slug}` : '';
  const deliveryUrl = origin && slug ? `${origin}/artemis/delivery/${slug}` : '';
  const copy = async (label: string, value: string) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(''), 1800);
  };

  return <section className="artemis-share-panel">
    <div className="artemis-share-head"><div><span className="op-kicker">Publicação</span><h2>Cardápio do cliente</h2><p>O mesmo cardápio abastece QR Code, delivery e retirada. A equipe interna trabalha em outras visões.</p></div>{slug ? <Badge>Publicado</Badge> : <Badge>Local</Badge>}</div>
    {slug && menuUrl ? <div className="artemis-share-links">
      <div><Link2 size={18}/><span><strong>Menu / QR Code</strong><small>{menuUrl}</small></span><button className="op-icon" onClick={() => void copy('menu', menuUrl)} aria-label="Copiar link do cardápio"><Copy size={17}/></button></div>
      {(deliveryEnabled || pickupEnabled) && <div><Bike size={18}/><span><strong>Delivery / retirada</strong><small>{deliveryUrl}</small></span><button className="op-icon" onClick={() => void copy('delivery', deliveryUrl)} aria-label="Copiar link de delivery"><Copy size={17}/></button></div>}
      {copied && <p className="artemis-copy-notice">Link copiado.</p>}
    </div> : <p className="op-callout">{cloudError || 'Entre com a conta do restaurante para publicar o cardápio.'}</p>}
  </section>;
}

export function ArtemisDirect({ w, page, recordId = '' }: { w: Workspace; page: string; recordId?: string }) {
  const operation = useOperationPreferences('artemis');
  const cloud = useArtemisCloud(w);
  const serviceMode = servicePages.has(page);
  const kitchenMode = page === 'cozinha';
  const initialServiceView: ServiceView = page === 'mesas' ? 'mesas' : page === 'caixa' ? 'caixa' : 'pedidos';
  const [serviceView, setServiceView] = useState<ServiceView>(initialServiceView);
  const [rushMode, setRushMode] = useState(false);
  const lastAlerted = useRef('');

  const activeOrders = useMemo(
    () => w.data.orders.filter(order => !['Concluído', 'Cancelado'].includes(order.status)),
    [w.data.orders]
  );
  const serviceWaiting = useMemo(() => activeOrders.filter(order => order.status === 'Novo' && (order.channel !== 'Delivery' || (w.data.settings.deliveryAcceptanceView || 'atendimento') === 'atendimento')), [activeOrders, w.data.settings.deliveryAcceptanceView]);
  const kitchenWaiting = useMemo(() => activeOrders.filter(order => order.status === 'Novo' && order.channel === 'Delivery' && w.data.settings.deliveryAcceptanceView === 'cozinha'), [activeOrders, w.data.settings.deliveryAcceptanceView]);
  const audibleWaiting = serviceMode ? serviceWaiting : kitchenMode ? kitchenWaiting : [];
  const nextWaiting = audibleWaiting[0];

  const physicalEnabled = operation.actionVisible('dineIn') || operation.actionVisible('counter');
  const deliveryEnabled = operation.actionVisible('delivery');
  const pickupEnabled = operation.actionVisible('pickup');
  const kitchenEnabled = operation.actionVisible('kitchenView');
  const cashEnabled = operation.actionVisible('module:caixa');
  const soundEnabled = operation.actionVisible('newOrderSound');

  useEffect(() => {
    if ((!serviceMode && !kitchenMode) || !nextWaiting || !soundEnabled || nextWaiting.id === lastAlerted.current) return;
    lastAlerted.current = nextWaiting.id;
    tryOrderSound();
  }, [serviceMode, kitchenMode, nextWaiting, soundEnabled]);

  useEffect(() => {
    if (serviceView === 'mesas' && !physicalEnabled) setServiceView('pedidos');
    if (serviceView === 'caixa' && !cashEnabled) setServiceView('pedidos');
  }, [serviceView, physicalEnabled, cashEnabled]);

  if (!serviceMode && !kitchenMode) {
    if (page === 'cardapio') {
      return <><SharePanel slug={cloud.slug} cloudError={cloud.cloudError} deliveryEnabled={deliveryEnabled} pickupEnabled={pickupEnabled}/><ArtemisMenuImport w={w}/><ArtemisMenuIntelligence w={w}/><ArtemisMenuManager w={w}/></>;
    }
    return <Artemis w={w} page={page} recordId={recordId}/>;
  }

  if (!w.data.products.length) {
    return <section className="artemis-role-empty">
      <span><ChefHat size={25}/></span>
      <div><strong>Cardápio ainda não configurado</strong><p>{kitchenMode ? 'A cozinha será liberada assim que a gestão cadastrar os produtos.' : 'Peça à gestão do restaurante para cadastrar o cardápio antes de iniciar o atendimento.'}</p></div>
    </section>;
  }

  const fullscreenKitchen = async () => {
    setRushMode(true);
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    } catch {
      w.setNotice('A cozinha foi focada. O navegador não liberou tela cheia.');
    }
  };

  if (kitchenMode) {
    if (!kitchenEnabled) return <section className="artemis-role-empty"><span><ChefHat size={25}/></span><div><strong>Cozinha desativada</strong><p>A gestão do restaurante desativou a visão de preparo nas configurações do Artemis.</p></div></section>;
    const preparing = activeOrders.filter(order => ['Aceito','Em preparo'].includes(order.status)).length;
    const ready = activeOrders.filter(order => order.status === 'Pronto').length;
    return <>
      <Title eyebrow={rushMode ? 'Cozinha · modo intenso' : 'Cozinha'} title={rushMode ? 'Foco no que precisa sair agora' : 'Produção agora'} action={<div className="artemis-primary-actions"><Button variant={rushMode ? 'primary' : 'secondary'} onClick={() => setRushMode(value => !value)}><Flame size={16}/>{rushMode ? 'Sair do modo intenso' : 'Modo intenso'}</Button><Button variant="secondary" onClick={() => void fullscreenKitchen()}><Maximize2 size={16}/>Tela cheia</Button></div>}>
        {preparing} em preparo{ready ? ` · ${ready} pronto(s) para saída` : ''}.
      </Title>
      {w.syncState === 'failed' && <div className="artemis-sync-warning" role="alert">Falha ao salvar alterações. Verifique a conexão antes de continuar.</div>}
      <ArtemisPendingDecisions w={w} view="cozinha" />
      <div className={`artemis-operation-body ${rushMode ? 'is-rush' : ''}`}><Artemis key="cozinha" w={w} page="cozinha" embedded rushMode={rushMode} publicSlug={cloud.slug}/></div>
    </>;
  }

  return <>
    <Title eyebrow="Atendimento" title="Pedidos e mesas">
      Registre, confirme e encerre o atendimento sem ferramentas administrativas na tela.
    </Title>

    {w.syncState === 'failed' && <div className="artemis-sync-warning" role="alert">Falha ao salvar alterações. Verifique a conexão antes de continuar.</div>}

    <ArtemisPendingDecisions w={w} view="atendimento" />

    <nav className="artemis-view-tabs" aria-label="Atendimento">
      <button className={serviceView === 'pedidos' ? 'active' : ''} onClick={() => setServiceView('pedidos')}><span>Pedidos</span><b>{activeOrders.length}</b>{serviceWaiting.length > 0 && <em>{serviceWaiting.length} novo(s)</em>}</button>
      {physicalEnabled && <button className={serviceView === 'mesas' ? 'active' : ''} onClick={() => setServiceView('mesas')}><span>Mesas</span><b>{w.data.tables.filter(table => table.openedAt).length}</b></button>}
      {cashEnabled && <button className={serviceView === 'caixa' ? 'active' : ''} onClick={() => setServiceView('caixa')}><span>Caixa</span></button>}
    </nav>

    <div className="artemis-operation-body"><Artemis key={serviceView} w={w} page={serviceView} embedded publicSlug={cloud.slug}/></div>
  </>;
}
