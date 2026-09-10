'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Copy, CreditCard, ExternalLink, MessageCircle, QrCode, RefreshCw, WalletCards } from 'lucide-react';
import type { AppId } from '@/lib/operations/model';
import { event, money, paid, receiveTablePayment, tableBalance, tableOrders, total } from '@/lib/operations/model';
import type { Workspace } from '@/lib/operations/storage';
import { mercadoPagoConnectRequest, type MercadoPagoConnectStatus } from '@/lib/mercadopagoConnect';
import { mercadoPagoChargeRequest, type MercadoPagoCharge, type MercadoPagoChargeItem } from '@/lib/mercadopagoCharge';
import { mercadoPagoInPersonRequest, type MercadoPagoInPersonCapabilities } from '@/lib/mercadopagoInPerson';
import { Badge, Button, Empty, Section } from './ui';

type ChargePanelProps = {
  accountId: string;
  appId: 'zeus' | 'artemis';
  sourceId: string;
  reference: string;
  amountCents: number;
  items: MercadoPagoChargeItem[];
  phone?: string;
  onApproved?: () => void | Promise<void> | Promise<boolean>;
};

function phoneForWhatsapp(phone: string) {
  let value = phone.replace(/\D/g, '');
  if ((value.length === 10 || value.length === 11) && !value.startsWith('55')) value = `55${value}`;
  return value;
}

function statusLabel(status: MercadoPagoCharge['status']) {
  return status === 'approved' ? 'Pago'
    : status === 'pending' ? 'Aguardando pagamento'
      : status === 'rejected' ? 'Pagamento recusado'
        : status === 'cancelled' ? 'Cancelado'
          : status === 'refunded' ? 'Estornado'
            : 'Falha na cobrança';
}

function MercadoPagoChargePanel(props: ChargePanelProps) {
  const { accountId, appId, sourceId, reference, amountCents, items, phone, onApproved } = props;
  const [integration, setIntegration] = useState<MercadoPagoConnectStatus | null>(null);
  const [capabilities, setCapabilities] = useState<MercadoPagoInPersonCapabilities | null>(null);
  const [charge, setCharge] = useState<MercadoPagoCharge | null>(null);
  const [terminalId, setTerminalId] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const approvedHandled = useRef(false);

  const load = useCallback(async () => {
    if (!accountId) return;
    const status = await mercadoPagoConnectRequest<MercadoPagoConnectStatus>({ action: 'status', accountId });
    setIntegration(status);
    const enabled = status.connection?.status === 'active' && status.appSettings.some(setting => setting.appId === appId && setting.enabled);
    if (!enabled) return;

    const inPerson = await mercadoPagoInPersonRequest<{ charge: MercadoPagoCharge | null }>({ action: 'status', accountId, appId, sourceId });
    let latest = inPerson.charge || null;
    if (latest?.channel === 'checkout' || (!latest?.channel && latest?.init_point)) {
      const checkout = await mercadoPagoChargeRequest<{ charge: MercadoPagoCharge | null }>({ action: 'status', accountId, appId, sourceId });
      latest = checkout.charge || latest;
    }
    setCharge(latest);

    try {
      const available = await mercadoPagoInPersonRequest<MercadoPagoInPersonCapabilities>({ action: 'capabilities', accountId, appId, sourceId });
      setCapabilities(available);
      const firstPdv = available.terminals.find(item => item.operatingMode.toUpperCase() === 'PDV');
      setTerminalId(current => current || firstPdv?.id || '');
    } catch {
      setCapabilities({ pos: [], terminals: [], qrReady: false, pointReady: false });
    }
  }, [accountId, appId, sourceId]);

  useEffect(() => {
    void load().catch(reason => setError(reason instanceof Error ? reason.message : 'Não foi possível consultar a cobrança.'));
  }, [load]);

  useEffect(() => {
    if (charge?.status !== 'pending') return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load().catch(() => undefined);
    }, 6000);
    return () => window.clearInterval(interval);
  }, [charge?.status, load]);

  useEffect(() => {
    if (charge?.status !== 'approved' || approvedHandled.current) return;
    approvedHandled.current = true;
    void Promise.resolve(onApproved?.()).catch(() => undefined);
  }, [charge?.status, onApproved]);

  const appEnabled = !!integration?.appSettings.some(setting => setting.appId === appId && setting.enabled);
  const connected = integration?.connection?.status === 'active';
  if (!integration) return <Section title="Cobrança pelo Mercado Pago"><p className="op-muted"><RefreshCw size={14} /> Conferindo integração…</p></Section>;
  if (!connected || !appEnabled) return null;

  const createCheckout = async () => {
    if (busy || amountCents <= 0) return;
    setBusy('checkout');
    setError('');
    try {
      const result = await mercadoPagoChargeRequest<{ charge: MercadoPagoCharge }>({ action: 'create', accountId, appId, sourceId, reference, amountCents, items });
      setCharge(result.charge);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível gerar a cobrança.');
    } finally { setBusy(''); }
  };

  const createInPerson = async (channel: 'qr' | 'point') => {
    if (busy || amountCents <= 0) return;
    setBusy(channel);
    setError('');
    try {
      const result = await mercadoPagoInPersonRequest<{ charge: MercadoPagoCharge }>({
        action: 'create', accountId, appId, sourceId, channel, reference, amountCents, items,
        terminalId: channel === 'point' ? terminalId : undefined,
      });
      setCharge(result.charge);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível gerar a cobrança presencial.');
    } finally { setBusy(''); }
  };

  const copyLink = async () => {
    if (!charge?.init_point) return;
    await navigator.clipboard.writeText(charge.init_point);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const whatsapp = () => {
    if (!charge?.init_point || !phone) return;
    const target = phoneForWhatsapp(phone);
    const text = `${reference}\nValor: ${money(amountCents)}\nPagamento seguro pelo Mercado Pago:\n${charge.init_point}`;
    window.open(`https://wa.me/${target}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const pdvTerminals = capabilities?.terminals.filter(item => item.operatingMode.toUpperCase() === 'PDV') || [];

  return <Section title="Cobrar cliente pelo Mercado Pago" action={charge?.status === 'approved' ? <Badge>Pago</Badge> : undefined}>
    <div className="op-callout"><strong>Valor puxado do atendimento</strong><span> O valor abaixo vem dos serviços/produtos registrados no CRM PLUS e não pode ser alterado nesta cobrança.</span></div>
    <div className="op-callout"><strong>CRM PLUS recebe R$ 0,00</strong><span> Nenhuma taxa, comissão ou parte do pagamento é repassada ao CRM PLUS. Taxas e condições de cobrança são exclusivamente da relação entre o estabelecimento e o Mercado Pago/Mercado Livre, conforme a conta e o meio de pagamento usados.</span></div>
    <div className="op-document-lines">
      {items.filter(item => item.lineTotalCents !== 0).map((item, index) => <div key={`${item.description}-${index}`}><span><strong>{item.description}</strong><small>{item.kind}{item.quantity !== 1 ? ` · ${item.quantity}×` : ''}</small></span><b>{money(item.lineTotalCents)}</b></div>)}
    </div>
    <div className="op-document-total"><span>Total a cobrar</span><strong>{money(amountCents)}</strong></div>

    {error && <p className="op-error">{error}</p>}

    {!charge && <>
      {pdvTerminals.length > 1 && <label className="op-field" style={{ maxWidth: 520 }}><span>Point que receberá a cobrança</span><select value={terminalId} onChange={event => setTerminalId(event.target.value)}>{pdvTerminals.map(item => <option key={item.id} value={item.id}>{item.id.split('__').pop() || item.id}</option>)}</select></label>}
      <div className="op-actions" style={{ flexWrap: 'wrap' }}>
        <Button disabled={!!busy || amountCents <= 0} onClick={() => { void createCheckout(); }}><WalletCards size={16} />{busy === 'checkout' ? 'Gerando…' : 'Enviar link'}</Button>
        <Button variant="secondary" disabled={!!busy || amountCents <= 0 || capabilities?.qrReady === false} onClick={() => { void createInPerson('qr'); }}><QrCode size={16} />{busy === 'qr' ? 'Gerando QR…' : 'Mostrar QR Code'}</Button>
        <Button variant="secondary" disabled={!!busy || amountCents <= 0 || capabilities?.pointReady === false || !terminalId} onClick={() => { void createInPerson('point'); }}><CreditCard size={16} />{busy === 'point' ? 'Enviando…' : 'Cobrar na Point'}</Button>
      </div>
      {capabilities && !capabilities.qrReady && <p className="op-muted">QR Code presencial: configure uma loja e ao menos um caixa no Mercado Pago. O QR integrado depende desse cadastro do próprio Mercado Pago.</p>}
      {capabilities && !capabilities.pointReady && <p className="op-muted">Point: é necessário ter uma maquininha compatível associada à conta, loja e caixa e configurada em modo PDV no Mercado Pago.</p>}
    </>}

    {charge && <div className="op-actions" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <Badge tone={charge.status === 'approved' ? '' : charge.status === 'pending' ? 'warning' : ''}>{statusLabel(charge.status)}</Badge>
      {(charge.channel === 'checkout' || (!charge.channel && charge.init_point)) && charge.init_point && charge.status !== 'approved' && <>
        <Button variant="secondary" onClick={() => window.open(charge.init_point!, '_blank', 'noopener,noreferrer')}><ExternalLink size={16} />Abrir link</Button>
        <Button variant="secondary" onClick={() => { void copyLink(); }}><Copy size={16} />{copied ? 'Link copiado' : 'Copiar link'}</Button>
        {phone && <Button variant="secondary" onClick={whatsapp}><MessageCircle size={16} />Enviar pelo WhatsApp</Button>}
      </>}
      {charge.channel === 'point' && charge.status === 'pending' && <span className="op-muted"><CreditCard size={15} /> Cobrança enviada para a Point{charge.terminal_id ? ` · ${charge.terminal_id.split('__').pop()}` : ''}. Finalize no terminal.</span>}
      {charge.status === 'pending' && <Button variant="text" disabled={!!busy} onClick={() => { void load(); }}><RefreshCw size={15} />Atualizar pagamento</Button>}
      {charge.status === 'approved' && <span className="op-muted"><CheckCircle2 size={15} /> Pagamento confirmado pelo Mercado Pago.</span>}
    </div>}

    {charge?.channel === 'qr' && charge.status === 'pending' && <div style={{ marginTop: 18 }}>
      {charge.qr_image ? <div style={{ display: 'grid', gap: 10, justifyItems: 'start' }}><img src={charge.qr_image} alt="QR Code Mercado Pago para pagamento" width={240} height={240} style={{ maxWidth: '100%', height: 'auto', background: '#fff', padding: 10 }} /><strong>Escaneie para pagar {money(amountCents)}</strong></div> : <p className="op-muted">QR Code criado no Mercado Pago. Use o QR do caixa configurado no estabelecimento para concluir o pagamento.</p>}
    </div>}
  </Section>;
}

function ZeusCompletedPayment({ w, recordId }: { w: Workspace; recordId: string }) {
  const job = w.data.jobs.find(item => item.id === recordId);
  if (!job || job.status !== 'Encerrado' || !job.quote?.lines?.length) return null;
  const customer = w.data.customers.find(item => item.id === job.customerId);
  let amountCents = 0;
  try { amountCents = total(job.quote.lines, job.quote.discount); } catch { return null; }
  if (amountCents <= 0) return <Section title="Cobrança"><Empty>Esta OS foi concluída sem valor financeiro registrado para cobrança.</Empty></Section>;

  const items: MercadoPagoChargeItem[] = job.quote.lines.map(line => ({ description: line.description, kind: line.kind, quantity: line.quantity, lineTotalCents: Math.round(line.price * line.quantity) }));
  if (job.quote.discount > 0) items.push({ description: 'Desconto', kind: 'Desconto', quantity: 1, lineTotalCents: -job.quote.discount });
  const reference = `OS ${String(job.number).padStart(4, '0')} · ${customer?.name || 'Cliente'}`;

  return <MercadoPagoChargePanel accountId={w.accountId} appId="zeus" sourceId={`os:${job.id}`} reference={reference} amountCents={amountCents} items={items} phone={customer?.phone} onApproved={() => w.mutate(data => {
    const current = data.jobs.find(item => item.id === job.id);
    if (!current) return;
    if (!current.events.some(item => item.text.includes('Pagamento Mercado Pago confirmado'))) current.events.push(event(`Pagamento Mercado Pago confirmado: ${money(amountCents)}`));
  }, 'Pagamento confirmado pelo Mercado Pago.')} />;
}

function ArtemisReadyPayments({ w }: { w: Workspace }) {
  const ready = useMemo(() => w.data.tables.filter(table => {
    if (!table.openedAt) return false;
    const orders = tableOrders(w.data, table).filter(order => order.status !== 'Cancelado');
    return orders.length > 0 && orders.every(order => order.status === 'Concluído') && tableBalance(w.data, table) > 0;
  }), [w.data]);

  if (!ready.length) return null;
  if (!w.data.shifts.some(shift => !shift.closedAt)) return <Section title="Cobrança de comandas pelo Mercado Pago"><Empty>Abra o caixa do Artemis antes de receber a comanda. O pagamento digital será registrado no turno aberto.</Empty></Section>;

  return <section style={{ marginTop: 20 }}>
    {ready.map(table => {
      const orders = tableOrders(w.data, table).filter(order => order.status !== 'Cancelado');
      const amountCents = tableBalance(w.data, table);
      const items: MercadoPagoChargeItem[] = [];
      for (const order of orders) {
        for (const line of order.lines) items.push({ description: `${line.description} · Pedido #${order.number}`, kind: 'Produto', quantity: line.quantity, lineTotalCents: Math.round(line.price * line.quantity) });
        if (order.fee > 0) items.push({ description: `Taxa · Pedido #${order.number}`, kind: 'Taxa', quantity: 1, lineTotalCents: order.fee });
        if (order.discount > 0) items.push({ description: `Desconto · Pedido #${order.number}`, kind: 'Desconto', quantity: 1, lineTotalCents: -order.discount });
      }
      const received = orders.reduce((sum, order) => sum + paid(w.data, order.id), 0);
      if (received > 0) items.push({ description: 'Valores já recebidos', kind: 'Recebido', quantity: 1, lineTotalCents: -received });
      const sourceId = `comanda:${table.id}:${table.openedAt}`;
      return <div key={sourceId} style={{ marginBottom: 18 }}><MercadoPagoChargePanel accountId={w.accountId} appId="artemis" sourceId={sourceId} reference={`Comanda ${table.name}`} amountCents={amountCents} items={items} onApproved={() => w.mutate(data => receiveTablePayment(data, table.id, amountCents, 'Mercado Pago'), 'Pagamento da comanda confirmado pelo Mercado Pago.')} /></div>;
    })}
  </section>;
}

export function PostCompletionPayments({ w, app, page, recordId }: { w: Workspace; app: AppId; page: string; recordId: string }) {
  if (!w.accountId || w.accountId === 'guest') return null;
  if (app === 'zeus' && recordId) return <ZeusCompletedPayment w={w} recordId={recordId} />;
  if (app === 'artemis' && page === 'mesas' && !recordId) return <ArtemisReadyPayments w={w} />;
  return null;
}
