'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, Bike, ChefHat, Copy, Flame, Link2, Maximize2, QrCode, Store, Volume2, VolumeX } from 'lucide-react';
import { advanceOrder, cancelOrder, money, orderTotal, orderingPaused } from '@/lib/operations/model';
import { useOperationPreferences } from '@/lib/operations/configuration';
import type { Workspace } from '@/lib/operations/storage';
import { Artemis } from './Artemis';
import { ArtemisMenuManager } from './ArtemisMenuManager';
import { ArtemisMenuImport } from './ArtemisMenuImport';
import { ArtemisMenuIntelligence } from './ArtemisMenuIntelligence';
import { ArtemisGuidedTest } from './ArtemisGuidedTest';
import { Badge, Button, Title } from './ui';
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
    <div className="artemis-share-head"><div><span className="op-kicker">Publicação</span><h2>Seu cardápio em um único link</h2><p>Use na bio, no site ou transforme o link da mesa em QR Code. Alterações do cardápio são sincronizadas para o público.</p></div>{slug ? <Badge>Publicado</Badge> : <Badge>Local</Badge>}</div>
    {slug && menuUrl ? <div className="artemis-share-links">
      <div><Link2 size={18} /><span><strong>Cardápio público</strong><small>{menuUrl}</small></span><button className="op-icon" onClick={() => void copy('menu', menuUrl)} aria-label="Copiar link do cardápio"><Copy size={17} /></button></div>
      {(deliveryEnabled || pickupEnabled) && <div><Bike size={18} /><span><strong>Delivery / retirada</strong><small>{deliveryUrl}</small></span><button className="op-icon" onClick={() => void copy('delivery', deliveryUrl)} aria-label="Copiar link de delivery"><Copy size={17} /></button></div>}
      {copied && <p className="artemis-copy-notice">Link copiado.</p>}
    </div> : <p className="op-callout">{cloudError || 'Entre com a conta do restaurante para publicar o cardápio em outros dispositivos.'}</p>}
  </section>;
}

export function ArtemisDirect({ w, page, recordId = '' }: { w: Workspace; page: string; recordId?: string }) {
  const operation = useOperationPreferences('artemis');
  const cloud = useArtemisCloud(w);
  const initialView: OperationView = page === 'mesas' ? 'mesas' : page === 'cozinha' ? 'cozinha' : 'pedidos';
  const [view, setView] = useState<OperationView>(initialView);
  const [rushMode, setRushMode] = useState(false);
  const [pauseMinutes, setPauseMinutes] = useState('30');
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
  const soundEnabled = operation.actionVisible('newOrderSound');

  useEffect(() => {
    if (!nextWaiting || !soundEnabled || nextWaiting.id === lastAlerted.current) return;
    lastAlerted.current = nextWaiting.id;
    tryOrderSound();
  }, [nextWaiting, soundEnabled]);

  useEffect(() => {
    if (view === 'mesas' && !physicalEnabled) setView('pedidos');
    if (view === 'cozinha' && !kitchenEnabled) setView('pedidos');
  }, [view, physicalEnabled, kitchenEnabled]);

  if (!operationPages.has(page)) {
    if (page === 'cardapio') {
      return <><SharePanel slug={cloud.slug} cloudError={cloud.cloudError} deliveryEnabled={deliveryEnabled} pickupEnabled={pickupEnabled} /><ArtemisMenuImport w={w} /><ArtemisMenuIntelligence w={w} /><ArtemisMenuManager w={w} /></>;
    }
    return <Artemis w={w} page={page} recordId={recordId} />;
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

  const acceptNext = () => {
    if (!nextWaiting) return;
    void w.mutate(data => advanceOrder(data, nextWaiting.id, 'Novo'), \`Pedido #\${nextWaiting.number} confirmado.\`);
  };

  const rejectNext = () => {
    if (!nextWaiting) return;
    const reason = window.prompt('Motivo da recusa do pedido:')?.trim() || '';
    if (!reason) return;
    void w.mutate(data => cancelOrder(data, nextWaiting.id, reason), \`Pedido #\${nextWaiting.number} recusado.\`);
  };

  const paused = orderingPaused(w.data.settings);
  const pauseOrders = () => {
    const minutes = Number(pauseMinutes);
    void w.mutate(data => {
      data.settings.onlinePaused = true;
      data.settings.onlinePausedUntil = Number.isFinite(minutes) && minutes > 0 ? new Date(Date.now() + minutes * 60000).toISOString() : '';
    }, Number.isFinite(minutes) && minutes > 0 ? \`Pedidos pausados por \${minutes} minutos.\` : 'Pedidos pausados até retomada manual.');
  };
  const resumeOrders = () => void w.mutate(data => {
    data.settings.onlinePaused = false;
    data.settings.onlinePausedUntil = '';
  }, 'Pedidos online retomados.');
  const fullscreenKitchen = async () => {
    setView('cozinha');
    setRushMode(true);
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    } catch {
      w.setNotice('A cozinha foi focada. O navegador não liberou tela cheia.');
    }
  };

  return <>
    <Title eyebrow={rushMode ? 'Modo movimento intenso' : 'Operação'} title={rushMode ? 'Foco no que precisa sair agora' : 'Pedidos em andamento'} action={<div className="op-actions"><ArtemisGuidedTest w={w} /><Button variant={rushMode ? 'primary' : 'secondary'} onClick={() => setRushMode(value => !value)}><Flame size={16} />{rushMode ? 'Sair do modo intenso' : 'Modo intenso'}</Button>{kitchenEnabled && <Button variant="secondary" onClick={() => void fullscreenKitchen()}><Maximize2 size={16} />Cozinha em tela cheia</Button>}{!rushMode && <><Link className="op-button secondary" href="/artemis/cardapio">Cardápio</Link><Link className="op-button secondary" href="/artemis/configuracoes">Ajustar operação</Link></>}</div>}>
      {rushMode ? 'Aguardando, atrasados e prontos ficam em primeiro plano. Controles administrativos são reduzidos.' : 'Um fluxo para receber, confirmar, preparar e concluir pedidos — sem espalhar a rotina em várias telas.'}
    </Title>

    <div className="artemis-channel-strip" aria-label="Canais ativos">
      {!rushMode && physicalEnabled && <span><Store size={16} />Loja física</span>}
      {!rushMode && deliveryEnabled && <span><Bike size={16} />Delivery</span>}
      {!rushMode && pickupEnabled && <span><QrCode size={16} />Retirada</span>}
      {!rushMode && <span className={soundEnabled ? 'is-on' : ''}>{soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}{soundEnabled ? 'Alerta sonoro ativo' : 'Alerta sonoro desativado'}</span>}
      {cloud.connected && <span className="is-on"><Link2 size={16} />Online conectado</span>}
      <span className={w.syncState === 'failed' ? 'is-error' : w.syncState === 'saving' ? 'is-saving' : 'is-on'}>{w.syncState === 'saving' ? 'Salvando alterações…' : w.syncState === 'failed' ? 'Falha ao salvar' : 'Alterações confirmadas'}</span>
    </div>

    {(deliveryEnabled || pickupEnabled) && <div className="artemis-online-control">
      <div><strong>{paused ? 'Pedidos online pausados' : 'Recebendo pedidos online'}</strong><small>{paused ? (w.data.settings.onlinePausedUntil ? \`Retomada prevista: \${new Date(w.data.settings.onlinePausedUntil).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}\` : 'Retomada manual') : 'Delivery e retirada usam o mesmo controle.'}</small></div>
      {paused ? <Button onClick={resumeOrders}>Retomar agora</Button> : <><select value={pauseMinutes} onChange={event => setPauseMinutes(event.target.value)} aria-label="Tempo da pausa"><option value="30">30 min</option><option value="60">1 hora</option><option value="120">2 horas</option><option value="0">Até eu retomar</option></select><Button variant="secondary" onClick={pauseOrders}>Pausar pedidos</Button></>}
    </div>}

    {nextWaiting ? <section className="artemis-order-alert" role="alert" aria-live="assertive">
      <div className="artemis-alert-icon"><BellRing size={26} /></div>
      <div className="artemis-alert-copy">
        <span>{waiting.length} aguardando · mais antigo há {age(oldestWaiting?.createdAt)}</span>
        <strong>Próximo: #{String(nextWaiting.number).padStart(3, '0')} · {nextWaiting.channel}{nextWaiting.priorityAt ? ' · prioridade manual' : ''}</strong>
        <small>{nextWaiting.customerName || 'Cliente não identificado'} · {nextWaiting.lines.reduce((sum, line) => sum + line.quantity, 0)} item(ns) · {money(orderTotal(nextWaiting))}{nextWaiting.priorityReason ? \` · \${nextWaiting.priorityReason}\` : ''}</small>
      </div>
      <div className="artemis-alert-actions"><Button onClick={acceptNext}>Confirmar pedido</Button><Button variant="secondary" onClick={rejectNext}>Recusar</Button></div>
    </section> : <div className="artemis-no-alert"><BellRing size={18} /><span>Nenhum pedido aguardando confirmação.</span></div>}

    <div className="artemis-demand-summary">
      <button className={view === 'pedidos' ? 'active' : ''} onClick={() => setView('pedidos')}><span>Pedidos</span><strong>{activeOrders.length}</strong><small>{waiting.length ? \`\${waiting.length} aguardando · mais antigo \${age(oldestWaiting?.createdAt)}\` : 'sem fila de confirmação'}</small></button>
      {physicalEnabled && <button className={view === 'mesas' ? 'active' : ''} onClick={() => setView('mesas')}><span>Mesas</span><strong>{w.data.tables.filter(table => table.openedAt).length}</strong><small>mesas/comandas abertas</small></button>}
      {kitchenEnabled && <button className={view === 'cozinha' ? 'active' : ''} onClick={() => setView('cozinha')}><span>Cozinha</span><strong>{activeOrders.filter(order => ['Aceito', 'Em preparo'].includes(order.status)).length}</strong><small>{activeOrders.filter(order => order.status === 'Pronto').length} pronto(s)</small></button>}
    </div>

    <div className={\`artemis-operation-body \${rushMode ? 'is-rush' : ''}\`}><Artemis key={view} w={w} page={view} embedded rushMode={rushMode} publicSlug={cloud.slug} /></div>
  </>;
}
