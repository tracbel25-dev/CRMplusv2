'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { StoreAccount } from '@/lib/account/storeAccess';
import { createStoreClient } from '@/lib/supabase/storeClient';
import { STORE_SUPABASE } from '@/lib/supabase/fixedProjects';

const errors: Record<string, string> = {
  trial_already_used: 'O teste grátis deste aplicativo já foi utilizado. Escolha um plano para continuar.',
  trial_phone_required: 'Confirme seu telefone antes de iniciar o teste.',
  trial_email_required: 'Confirme seu e-mail antes de iniciar o teste.',
  trial_document_invalid: 'Informe um CPF ou CNPJ numérico válido.',
  trial_identity_changed: 'Use o mesmo documento e telefone do primeiro teste da empresa.',
  trial_owner_required: 'Somente o titular de uma empresa ativa pode iniciar o teste.',
  trial_already_active: 'Sua empresa já tem acesso ativo a este aplicativo.',
  trial_unavailable: 'O teste não está disponível para esta conta.',
};

export function TrialActivation({ app, user, account, owner, refresh }: {
  app: string; user: User; account: StoreAccount; owner: boolean; refresh: () => Promise<void>;
}) {
  const [document, setDocument] = useState('');
  const [phone, setPhone] = useState('');
  const [sentPhone, setSentPhone] = useState('');
  const [code, setCode] = useState('');
  const [smsEnabled, setSmsEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const entitlement = account.apps.find(item => item.appId === app);
  const verified = !!user.phone && !!user.phone_confirmed_at;
  const expires = entitlement?.currentPeriodEnd;
  const activeTrial = entitlement?.status === 'trialing' && !!expires && Date.parse(expires) > Date.now();

  useEffect(() => {
    let alive = true;
    void fetch(`${STORE_SUPABASE.url}/auth/v1/settings`, { headers: { apikey: STORE_SUPABASE.publishableKey } })
      .then(response => response.ok ? response.json() : null)
      .then(settings => { if (alive) setSmsEnabled(settings?.external?.phone === true && settings?.phone_autoconfirm === false); })
      .catch(() => { if (alive) setSmsEnabled(false); });
    return () => { alive = false; };
  }, []);
  useEffect(() => { setMessage(''); }, [app]);

  if (!['zeus', 'artemis'].includes(app)) return null;
  if (entitlement?.status === 'active') return null;
  if (entitlement) return <section className="billing-panel"><h2>{activeTrial ? 'Seu teste de 7 dias está ativo' : 'Teste grátis indisponível'}</h2>
    <p>{activeTrial ? `Disponível até ${new Date(expires!).toLocaleString('pt-BR')}. Sem cobrança automática.` : 'O teste não pode ser reiniciado. Seus dados são preservados; escolha um plano para liberar o acesso.'}</p>
    {activeTrial && <Link className="primary" href={`/${app}`}>Abrir aplicativo</Link>}
  </section>;
  if (!owner) return <p>Peça ao titular da empresa para iniciar o teste grátis.</p>;

  async function run(action: 'send' | 'verify' | 'start') {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const client = createStoreClient();
      if (action === 'send') {
        const digits = phone.replace(/\D/g, '');
        const normalized = digits.length === 11 ? `55${digits}` : digits;
        if (!/^55\d{11}$/.test(normalized)) throw new Error('Informe um celular brasileiro com DDD.');
        const result = await client.auth.updateUser({ phone: `+${normalized}` });
        if (result.error) throw result.error;
        setSentPhone(`+${normalized}`); setMessage('Código enviado. Digite o código recebido por SMS.');
      } else if (action === 'verify') {
        const result = await client.auth.verifyOtp({ phone: sentPhone, token: code.trim(), type: 'phone_change' });
        if (result.error) throw result.error;
        await refresh(); setSentPhone(''); setCode(''); setMessage('Telefone confirmado. Você já pode iniciar o teste.');
      } else {
        const result = await client.rpc('start_app_trial', { target_account: account.id, target_app: app, document });
        if (result.error) throw result.error;
        await refresh();
      }
    } catch (reason) {
      const raw = (reason as Error).message;
      setMessage(errors[raw] || (action === 'start' ? 'Não foi possível iniciar o teste. Tente novamente ou fale com o suporte.' : 'Não foi possível confirmar o telefone. Confira o número ou código e aguarde antes de tentar novamente.'));
    } finally { setBusy(false); }
  }
  return <section className="billing-panel" id="teste-gratis"><h2>Experimente por 7 dias</h2>
    <p>Sem cartão e sem cobrança automática. Um teste por empresa e aplicativo. Ao vencer, seus dados ficam preservados.</p>
    {message && <p role="status">{message}</p>}
    {!user.email_confirmed_at && <p>Confirme o e-mail recebido no cadastro para continuar.</p>}
    {!verified && <>
      {smsEnabled === null ? <p>Verificando disponibilidade…</p> : !smsEnabled ? <p>A ativação do teste está temporariamente indisponível. A confirmação por telefone estará disponível em breve.</p> : <>
        <label htmlFor="trial-phone">Celular com DDD</label>
        <input id="trial-phone" type="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} disabled={busy}/>
        <button className="ghost" type="button" disabled={busy || !user.email_confirmed_at} onClick={() => void run('send')}>Enviar código por SMS</button>
        {sentPhone && <><label htmlFor="trial-code">Código recebido</label><input id="trial-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value)} maxLength={10}/><button className="ghost" type="button" disabled={busy || !code} onClick={() => void run('verify')}>Confirmar telefone</button></>}
      </>}
    </>}
    {verified && <><p>Telefone confirmado.</p><label htmlFor="trial-document">CPF do responsável ou CNPJ da empresa</label>
      <input id="trial-document" inputMode="numeric" value={document} maxLength={18} onChange={event => setDocument(event.target.value)} disabled={busy}/>
      <p className="billing-caption">Usamos documento e telefone para evitar testes repetidos.</p>
      <button className="primary" type="button" disabled={busy || !document || !user.email_confirmed_at} onClick={() => void run('start')}>{busy ? 'Aguarde…' : 'Iniciar meus 7 dias grátis'}</button>
    </>}
  </section>;
}
