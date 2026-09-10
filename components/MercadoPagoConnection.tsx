'use client';

import { AlertTriangle, CheckCircle2, ExternalLink, RefreshCw, ShieldCheck, Unplug, WalletCards } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { mercadoPagoConnectRequest, type MercadoPagoConnectStatus } from '@/lib/mercadopagoConnect';

const formatDateTime = (value: string | null | undefined) => value
  ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  : '—';

export function MercadoPagoConnection({ returned }: { returned?: string }) {
  const access = useStoreAccess();
  const accountId = access.account?.id;
  const [status, setStatus] = useState<MercadoPagoConnectStatus | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(
    returned === 'connected'
      ? 'Conta Mercado Pago conectada. Agora habilite pagamentos dentro do aplicativo que vai usar a cobrança.'
      : returned === 'denied'
        ? 'A autorização foi cancelada no Mercado Pago.'
        : returned === 'error' || returned === 'invalid'
          ? 'Não foi possível concluir a conexão. Tente novamente.'
          : ''
  );

  const load = useCallback(async () => {
    if (!accountId) return;
    const result = await mercadoPagoConnectRequest<MercadoPagoConnectStatus>({ action: 'status', accountId });
    setStatus(result);
  }, [accountId]);

  useEffect(() => {
    if (!accountId) return;
    void load().catch(reason => setError((reason as Error).message || 'Não foi possível consultar a integração.'));
  }, [accountId, load]);

  async function connect() {
    if (!accountId || !status || busy) return;
    if (!accepted) {
      setError('Leia e aceite o Termo de Integração de Pagamentos para continuar.');
      return;
    }
    setBusy('connect');
    setError('');
    setNotice('');
    try {
      const result = await mercadoPagoConnectRequest<{ url: string }>({
        action: 'authorize',
        accountId,
        acceptedTerms: true,
        termsVersion: status.terms.version,
      });
      window.location.assign(result.url);
    } catch (reason) {
      setError((reason as Error).message || 'Não foi possível iniciar a autorização.');
      setBusy('');
    }
  }

  async function disconnect() {
    if (!accountId || busy) return;
    if (!window.confirm('Desconectar o Mercado Pago do CRM PLUS? Os aplicativos deixarão de poder iniciar novas cobranças por esta integração.')) return;
    setBusy('disconnect');
    setError('');
    setNotice('');
    try {
      await mercadoPagoConnectRequest({ action: 'disconnect', accountId });
      await load();
      setAccepted(false);
      setNotice('Mercado Pago desconectado do CRM PLUS. Os pagamentos foram desabilitados nos aplicativos.');
    } catch (reason) {
      setError((reason as Error).message || 'Não foi possível desconectar a conta.');
    } finally {
      setBusy('');
    }
  }

  if (!access.ready || !access.user || !access.account) return null;

  return <section className="mp-connect-card" aria-labelledby="mp-connect-title">
    <div className="mp-connect-heading">
      <div className="mp-connect-icon"><WalletCards size={22} /></div>
      <div>
        <span className="account-kicker">Recebimentos dos seus clientes</span>
        <h2 id="mp-connect-title">Conectar Mercado Pago</h2>
        <p>Autorize o CRM PLUS a criar cobranças na sua própria conta Mercado Pago. O dinheiro é processado e recebido na conta que você conectar.</p>
      </div>
    </div>

    <div className="mp-connect-facts" aria-label="Como funciona">
      <div><ShieldCheck size={17} /><span><strong>Conexão por login OAuth</strong><small>Não pedimos sua senha, chave Pix, dados bancários ou Access Token.</small></span></div>
      <div><CheckCircle2 size={17} /><span><strong>CRM PLUS recebe R$ 0,00</strong><small>O CRM PLUS não recebe valor da venda, comissão, percentual, split, tarifa ou repasse da transação.</small></span></div>
      <div><AlertTriangle size={17} /><span><strong>Taxas não são do CRM PLUS</strong><small>Tarifas, taxas, prazos, retenções, chargebacks e demais condições são exclusivamente definidos pelo Mercado Pago/Mercado Livre para a conta conectada. O relacionamento financeiro é entre o estabelecimento e o provedor.</small></span></div>
    </div>

    <div className="billing-portal-message is-warning"><AlertTriangle size={17} /><span><strong>Importante:</strong> o CRM PLUS apenas envia a solicitação de cobrança em nome da conta conectada. Não recebe nem movimenta o dinheiro do estabelecimento e não se responsabiliza pelas taxas cobradas pelo Mercado Pago/Mercado Livre.</span></div>

    {error && <div className="billing-portal-message is-error"><p>{error}</p></div>}
    {notice && <div className="billing-portal-message"><CheckCircle2 size={17} /><span>{notice}</span></div>}

    {!status ? <div className="mp-connect-loading"><RefreshCw size={16} /> Conferindo integração…</div> : status.connection?.status === 'active' ? <div className="mp-connected-state">
      <div className="mp-connected-summary">
        <span className="billing-status is-good">Conectado</span>
        <div><strong>Conta Mercado Pago autorizada</strong><small>ID Mercado Pago: {status.connection.providerUserId}</small></div>
      </div>
      <div className="mp-connected-meta">
        <div><span>Conectada em</span><strong>{formatDateTime(status.connection.connectedAt)}</strong></div>
        <div><span>Autorização atual</span><strong>Leitura, escrita e acesso offline</strong></div>
        <div><span>Validade do token atual</span><strong>{formatDateTime(status.connection.tokenExpiresAt)}</strong></div>
      </div>
      {status.isOwner ? <button className="mp-disconnect-button" type="button" disabled={!!busy} onClick={() => void disconnect()}>
        <Unplug size={15} /> {busy === 'disconnect' ? 'Desconectando…' : 'Desconectar do CRM PLUS'}
      </button> : <p className="mp-owner-note">Somente o titular da conta pode alterar esta conexão.</p>}
    </div> : <div className="mp-connect-setup">
      {!status.ready && <div className="billing-portal-message is-warning">A estrutura está pronta, mas a credencial OAuth de produção do Mercado Pago ainda precisa ser configurada pelo CRM PLUS.</div>}

      <details className="mp-terms">
        <summary>Ler Termo de Integração de Pagamentos <ExternalLink size={14} /></summary>
        <div className="mp-terms-body">
          {status.terms.text.split('\n\n').map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          <small>Versão {status.terms.version}</small>
        </div>
      </details>

      {status.isOwner ? <>
        <label className="mp-acceptance">
          <input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} />
          <span>Li e aceito o Termo de Integração de Pagamentos e autorizo a conexão da conta Mercado Pago da empresa ao CRM PLUS.</span>
        </label>
        <button className="primary mp-connect-button" type="button" disabled={!accepted || !status.ready || !!busy} onClick={() => void connect()}>
          <WalletCards size={17} /> {busy === 'connect' ? 'Abrindo Mercado Pago…' : 'Aceitar termo e conectar Mercado Pago'}
        </button>
        <p className="mp-legal-note">Ao continuar, você será direcionado ao Mercado Pago para entrar na sua própria conta e conceder a autorização. O CRM PLUS não recebe a senha da sua conta.</p>
      </> : <p className="mp-owner-note">Somente o titular da empresa pode aceitar o termo e conectar uma conta Mercado Pago.</p>}
    </div>}
  </section>;
}
