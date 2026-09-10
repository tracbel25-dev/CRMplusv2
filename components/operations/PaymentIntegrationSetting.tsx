'use client';

import Link from 'next/link';
import { CheckCircle2, ExternalLink, LockKeyhole, WalletCards } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { AppId } from '@/lib/operations/model';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { mercadoPagoConnectRequest, type MercadoPagoConnectStatus } from '@/lib/mercadopagoConnect';
import { Badge, Section } from './ui';

export function PaymentIntegrationSetting({ app }: { app: AppId }) {
  const access = useStoreAccess();
  const accountId = access.account?.id;
  const entitlement = access.account?.apps.find(item => item.appId === app);
  const trialing = entitlement?.status === 'trialing' && !!entitlement.currentPeriodEnd && Date.parse(entitlement.currentPeriodEnd) > Date.now();
  const [status, setStatus] = useState<MercadoPagoConnectStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!accountId || trialing) return;
    const result = await mercadoPagoConnectRequest<MercadoPagoConnectStatus>({ action: 'status', accountId });
    setStatus(result);
  }, [accountId, trialing]);

  useEffect(() => {
    if (!accountId || trialing) return;
    void load().catch(reason => setError((reason as Error).message || 'Não foi possível consultar pagamentos.'));
  }, [accountId, load, trialing]);

  const enabled = status?.appSettings.some(item => item.appId === app && item.enabled) === true;
  const connected = status?.connection?.status === 'active';
  const canConfigure = access.canConfigureApp(app) && !trialing;

  async function toggle(next: boolean) {
    if (!accountId || busy || !canConfigure || trialing) return;
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await mercadoPagoConnectRequest({ action: 'set-app-enabled', accountId, appId: app, enabled: next });
      await load();
      setSaved(true);
    } catch (reason) {
      setError((reason as Error).message || 'Não foi possível alterar pagamentos.');
    } finally {
      setBusy(false);
    }
  }

  if (trialing) return <Section title="Pagamentos pelo Mercado Pago">
    <div className="op-config-group">
      <div className="op-row"><span className="op-config-choice-icon"><LockKeyhole size={18} /></span><div className="op-grow"><strong>Integração protegida no modo teste</strong><small>Conexão, configuração e uso do Mercado Pago ficam disponíveis após a ativação da assinatura.</small></div><Badge>Assinatura necessária</Badge></div>
      <Link className="op-button secondary" href="/assinaturas">Assine agora para liberar <ExternalLink size={15} /></Link>
    </div>
  </Section>;

  return <Section title="Pagamentos pelo Mercado Pago">
    <p className="op-muted">A conta Mercado Pago é conectada uma única vez na área financeira do CRM PLUS. Depois, cada aplicativo decide se pode usar essa conta para criar cobranças.</p>
    {error && <div className="op-error">{error}</div>}
    {!status ? <p className="op-muted">Conferindo conexão…</p> : !connected ? <div className="op-config-group">
      <div className="op-row"><span className="op-config-choice-icon"><WalletCards size={18} /></span><div className="op-grow"><strong>Mercado Pago não conectado</strong><small>O titular precisa aceitar o termo e autorizar a conta antes de habilitar cobranças neste aplicativo.</small></div><Badge>Desconectado</Badge></div>
      <Link className="op-button secondary" href="/assinaturas">Conectar na área financeira <ExternalLink size={15} /></Link>
    </div> : <label className="op-module-choice">
      <input type="checkbox" checked={enabled} disabled={!canConfigure || busy} onChange={event => void toggle(event.target.checked)} />
      <span className="op-config-choice-icon"><WalletCards size={18} /></span>
      <span><strong>Permitir cobranças neste aplicativo</strong><small>Quando ativo, o aplicativo poderá usar a conta Mercado Pago conectada para cobrar seus próprios clientes. Os valores não passam pela conta do CRM PLUS.</small></span>
      <Badge>{busy ? 'Salvando…' : enabled ? 'Ativo' : 'Desativado'}</Badge>
    </label>}
    {saved && <p className="op-muted"><CheckCircle2 size={14} /> Configuração de pagamento atualizada.</p>}
    {status && !canConfigure && <p className="op-muted">Você pode consultar esta configuração, mas apenas o titular ou um usuário com permissão de configuração do aplicativo pode alterá-la.</p>}
  </Section>;
}
