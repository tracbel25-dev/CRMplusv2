'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, Bike, ChefHat, Copy, Flame, Link2, Maximize2, QrCode } from 'lucide-react';
import { advanceOrder, cancelOrder, money, orderTotal } from '@/lib/operations/model';
import { useOperationPreferences } from '@/lib/operations/configuration';
import type { Workspace } from '@/lib/operations/storage';
import { Artemis } from './Artemis';
import { ArtemisMenuManager } from './ArtemisMenuManager';
import { ArtemisMenuImport } from './ArtemisMenuImport';
import { ArtemisMenuIntelligence } from './ArtemisMenuIntelligence';
import { Badge, Button, Title } from './ui';
import { useArtemisCloud } from './useArtemisCloud';
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
  const waiting = useMemo(() => [...activeOrders].filter(order => order.status === 'Novo').sort((a, b) => {
    if (!!a.priorityAt !== !!b.priorityAt) return a.priorityAt ? -1 : 1;
    if (a.priorityAt && b.priorityAt && a.priorityAt !== b.priorityAt) return b.priorityAt.localeCompare(a.priorityAt);
    return a.createdAt.localeCompare(b.createdAt);
  }), [activeOrders]);
  const nextWaiting = waiting[0];
  const oldestWaiting = useMemo(() => [...waiting].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0], [waiting]);
  const age = (createdAt?: string) => {
    if (!createdAt) return '0 min';
    const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
    return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
  };

  const physicalEnabled = operation.actionVisible('dineIn') || operation.actionVisible('counter');
  const deliveryEnabled = operation.actionVisible('delivery');
  const pickupEnabled = operation.actionVisible('pickup');
  const kitchenEnabled = operation.actionVisible('kitchenView');
  const cashEnabled = operation.actionVisible('module:caixa');
  const soundEnabled = operation.actionVisible('newOrderSound');

  useEffect(() => {
    if (!serviceMode || !nextWaiting || !soundEnabled || nextWaiting.id === lastAlerted.current) return;
    lastAlerted.current = nextWaiting.id;
    tryOrderSound();
  }, [serviceMode, nextWaiting, soundEnabled]);

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

  const acceptNext = () => {
    if (!nextWaiting) return;
    void w.mutate(data => advanceOrder(data, nextWaiting.id, 'Novo'), `Pedido #${nextWaiting.number} confirmado.`);
  };

  const rejectNext = () => {
    if (!nextWaiting) return;
    const reason = window.prompt('Motivo da recusa do pedido:')?.trim() || '';
    if (!reason) return;
    void w.mutate(data => cancelOrder(data, nextWaiting.id, reason), `Pedido #${nextWaiting.number} recusado.`);
  };

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
      <div className={`artemis-operation-body ${rushMode ? 'is-rush' : ''}`}><Artemis key="cozinha" w={w} page="cozinha" embedded rushMode={rushMode} publicSlug={cloud.slug}/></div>
    </>;
  }

  return <>
    <Title eyebrow="Atendimento" title="Pedidos e mesas">
      Registre, confirme e encerre o atendimento sem ferramentas administrativas na tela.
    </Title>

    {w.syncState === 'failed' && <div className="artemis-sync-warning" role="alert">Falha ao salvar alterações. Verifique a conexão antes de continuar.</div>}

    {nextWaiting ? <section className="artemis-order-alert" role="alert" aria-live="assertive">
      <div className="artemis-alert-icon"><BellRing size={26}/></div>
      <div className="artemis-alert-copy">
        <span>{waiting.length} aguardando · mais antigo há {age(oldestWaiting?.createdAt)}</span>
        <strong>Próximo: #{String(nextWaiting.number).padStart(3, '0')} · {nextWaiting.channel}{nextWaiting.priorityAt ? ' · prioridade manual' : ''}</strong>
        <small>{nextWaiting.customerName || 'Cliente não identificado'} · {nextWaiting.lines.reduce((sum, line) => sum + line.quantity, 0)} item(ns) · {money(orderTotal(nextWaiting))}{nextWaiting.priorityReason ? ` · ${nextWaiting.priorityReason}` : ''}</small>
      </div>
      <div className="artemis-alert-actions"><Button onClick={acceptNext}>Confirmar pedido</Button><Button variant="secondary" onClick={rejectNext}>Recusar</Button></div>
    </section> : null}

    <nav className="artemis-view-tabs" aria-label="Atendimento">
      <button className={serviceView === 'pedidos' ? 'active' : ''} onClick={() => setServiceView('pedidos')}><span>Pedidos</span><b>{activeOrders.length}</b>{waiting.length > 0 && <em>{waiting.length} novo(s)</em>}</button>
      {physicalEnabled && <button className={serviceView === 'mesas' ? 'active' : ''} onClick={() => setServiceView('mesas')}><span>Mesas</span><b>{w.data.tables.filter(table => table.openedAt).length}</b></button>}
      {cashEnabled && <button className={serviceView === 'caixa' ? 'active' : ''} onClick={() => setServiceView('caixa')}><span>Caixa</span></button>}
    </nav>

    <div className="artemis-operation-body"><Artemis key={serviceView} w={w} page={serviceView} embedded publicSlug={cloud.slug}/></div>
  </>;
}
