'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, Bike, ChefHat, Copy, Link2, QrCode, Store, Volume2, VolumeX } from 'lucide-react';
import { advanceOrder, cancelOrder, money, orderTotal } from '@/lib/operations/model';
import { useOperationPreferences } from '@/lib/operations/configuration';
import type { Workspace } from '@/lib/operations/storage';
import { Artemis } from './Artemis';
import { Badge, Button, Empty, Title } from './ui';
import { useArtemisCloud } from './useArtemisCloud';
import './artemis-direct.css';

type OperationView = 'pedidos' | 'mesas' | 'cozinha';

const operationPages = new Set(['inicio', 'pedidos', 'mesas', 'cozinha']);

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

function SharePanel({ w, slug, cloudError, deliveryEnabled, pickupEnabled }: { w: Workspace; slug: string; cloudError: string; deliveryEnabled: boolean; pickupEnabled: boolean }) {
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
    <div className="artemis-share-head"><div><span className="op-kicker">Publicação</span><h2>Seu cardápio em um único link</h2><p>Use na bio, no site ou transforme o link da mesa em QR Code. Alterações do cardápio são sincronizadas para o público.</p></div>{slug ? <Badge>Publicado</Badge> : <Badge>Local</Badge>}</div>
    {slug && menuUrl ? <div className="artemis-share-links">
      <div><Link2 size={18} /><span><strong>Cardápio público</strong><small>{menuUrl}</small></span><button className="op-icon" onClick={() => void copy('menu', menuUrl)} aria-label="Copiar link do cardápio"><Copy size={17} /></button></div>
      {(deliveryEnabled || pickupEnabled) && <div><Bike size={18} /><span><strong>Delivery / retirada</strong><small>{deliveryUrl}</small></span><button className="op-icon" onClick={() => void copy('delivery', deliveryUrl)} aria-label="Copiar link de delivery"><Copy size={17} /></button></div>}
      {w.data.tables.map(table => <div key={table.id}><QrCode size={18} /><span><strong>{table.name}</strong><small>{`${menuUrl}?mesa=${table.id}`}</small></span><button className="op-icon" onClick={() => void copy(table.id, `${menuUrl}?mesa=${table.id}`)} aria-label={`Copiar link de QR Code da ${table.name}`}><Copy size={17} /></button></div>)}
      {copied && <p className="artemis-copy-notice">Link copiado.</p>}
    </div> : <p className="op-callout">{cloudError || 'Entre com a conta do restaurante para publicar o cardápio em outros dispositivos.'}</p>}
  </section>;
}

export function ArtemisDirect({ w, page, recordId = '' }: { w: Workspace; page: string; recordId?: string }) {
  const operation = useOperationPreferences('artemis');
  const cloud = useArtemisCloud(w);
  const initialView: OperationView = page === 'mesas' ? 'mesas' : page === 'cozinha' ? 'cozinha' : 'pedidos';
  const [view, setView] = useState<OperationView>(initialView);
  const lastAlerted = useRef('');

  const activeOrders = useMemo(
    () => w.data.orders.filter(order => !['Concluído', 'Cancelado'].includes(order.status)),
    [w.data.orders]
  );
  const newest = useMemo(
    () => [...activeOrders].filter(order => order.status === 'Novo').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],
    [activeOrders]
  );

  const physicalEnabled = operation.actionVisible('dineIn') || operation.actionVisible('counter');
  const deliveryEnabled = operation.actionVisible('delivery');
  const pickupEnabled = operation.actionVisible('pickup');
  const kitchenEnabled = operation.actionVisible('kitchenView');
  const soundEnabled = operation.actionVisible('newOrderSound');

  useEffect(() => {
    if (!newest || !soundEnabled || newest.id === lastAlerted.current) return;
    lastAlerted.current = newest.id;
    tryOrderSound();
  }, [newest, soundEnabled]);

  useEffect(() => {
    if (view === 'mesas' && !physicalEnabled) setView('pedidos');
    if (view === 'cozinha' && !kitchenEnabled) setView('pedidos');
  }, [view, physicalEnabled, kitchenEnabled]);

  if (!operationPages.has(page)) {
    return <>{page === 'cardapio' && <SharePanel w={w} slug={cloud.slug} cloudError={cloud.cloudError} deliveryEnabled={deliveryEnabled} pickupEnabled={pickupEnabled} />}<Artemis w={w} page={page} recordId={recordId} /></>;
  }

  if (!w.data.products.length && !w.data.orders.length) {
    return <>
      <Title eyebrow="Primeiro passo" title="Cadastre seu cardápio">
        O Artemis começa pelo que o restaurante vende. Depois o mesmo cardápio alimenta o salão, o link de delivery e a operação.
      </Title>
      <section className="artemis-first-step">
        <div className="artemis-first-step-main">
          <span className="artemis-first-icon"><ChefHat size={28} /></span>
          <div><strong>Seu menu ainda está vazio</strong><p>Cadastre categorias, produtos, preços e disponibilidade. Não é necessário configurar o restante antes disso.</p></div>
          <Link className="op-button" href="/artemis/cardapio">Cadastrar cardápio</Link>
        </div>
        <div className="artemis-first-options">
          <span><QrCode size={18} /><b>Loja física</b><small>QR Code usa o mesmo cardápio.</small></span>
          <span><Bike size={18} /><b>Delivery</b><small>O link usa os mesmos produtos e preços.</small></span>
          <span><BellRing size={18} /><b>Operação</b><small>Pedidos chegam em um único lugar.</small></span>
        </div>
      </section>
    </>;
  }

  const acceptNewest = () => {
    if (!newest) return;
    void w.mutate(data => advanceOrder(data, newest.id, 'Novo'), `Pedido #${newest.number} confirmado.`);
  };

  const rejectNewest = () => {
    if (!newest) return;
    const reason = window.prompt('Motivo da recusa do pedido:')?.trim() || '';
    if (!reason) return;
    void w.mutate(data => cancelOrder(data, newest.id, reason), `Pedido #${newest.number} recusado.`);
  };

  return <>
    <Title eyebrow="Operação" title="Pedidos em andamento" action={<div className="op-actions"><Link className="op-button secondary" href="/artemis/cardapio">Cardápio</Link><Link className="op-button secondary" href="/artemis/configuracoes">Ajustar operação</Link></div>}>
      Um fluxo para receber, confirmar, preparar e concluir pedidos — sem espalhar a rotina em várias telas.
    </Title>

    <div className="artemis-channel-strip" aria-label="Canais ativos">
      {physicalEnabled && <span><Store size={16} />Loja física</span>}
      {deliveryEnabled && <span><Bike size={16} />Delivery</span>}
      {pickupEnabled && <span><QrCode size={16} />Retirada</span>}
      <span className={soundEnabled ? 'is-on' : ''}>{soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}{soundEnabled ? 'Alerta sonoro ativo' : 'Alerta sonoro desativado'}</span>
      {cloud.connected && <span className="is-on"><Link2 size={16} />Pedidos online conectados</span>}
    </div>

    {newest ? <section className="artemis-order-alert" role="alert" aria-live="assertive">
      <div className="artemis-alert-icon"><BellRing size={26} /></div>
      <div className="artemis-alert-copy">
        <span>Novo pedido recebido</span>
        <strong>#{String(newest.number).padStart(3, '0')} · {newest.channel}</strong>
        <small>{newest.customerName || 'Cliente não identificado'} · {newest.lines.reduce((sum, line) => sum + line.quantity, 0)} item(ns) · {money(orderTotal(newest))}</small>
      </div>
      <div className="artemis-alert-actions"><Button onClick={acceptNewest}>Confirmar pedido</Button><Button variant="secondary" onClick={rejectNewest}>Recusar</Button></div>
    </section> : <div className="artemis-no-alert"><BellRing size={18} /><span>Nenhum pedido aguardando confirmação.</span></div>}

    <div className="artemis-demand-summary">
      <button className={view === 'pedidos' ? 'active' : ''} onClick={() => setView('pedidos')}><span>Demandas</span><strong>{activeOrders.length}</strong><small>{activeOrders.filter(order => order.status === 'Novo').length} aguardando confirmação</small></button>
      {physicalEnabled && <button className={view === 'mesas' ? 'active' : ''} onClick={() => setView('mesas')}><span>Loja física</span><strong>{w.data.tables.filter(table => table.openedAt).length}</strong><small>mesas/comandas abertas</small></button>}
      {kitchenEnabled && <button className={view === 'cozinha' ? 'active' : ''} onClick={() => setView('cozinha')}><span>Preparo</span><strong>{activeOrders.filter(order => ['Aceito', 'Em preparo'].includes(order.status)).length}</strong><small>{activeOrders.filter(order => order.status === 'Pronto').length} pronto(s)</small></button>}
    </div>

    <div className="artemis-operation-body"><Artemis key={view} w={w} page={view} /></div>
  </>;
}

