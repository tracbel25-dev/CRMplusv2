'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { reserveTrialNetwork } from '@/lib/antifraud';
import { billingRequest } from '@/lib/billing';
import { clientMessage } from '@/lib/clientMessage';
import { createStoreClient } from '@/lib/supabase/storeClient';
import './confirm.css';

function safeDestination(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/conta';
  return value;
}

function checkoutPlan(destination: string) {
  try {
    const url = new URL(destination, window.location.origin);
    if (url.pathname !== '/checkout') return null;
    return url.searchParams.get('plano');
  } catch {
    return null;
  }
}

export default function ConfirmPage() {
  const router = useRouter();
  const processing = useRef(false);
  const [error, setError] = useState('');
  const [destination, setDestination] = useState('/conta');
  const [phase,setPhase]=useState<'account'|'payment'>('account');

  useEffect(() => {
    let active = true;
    const supabase = createStoreClient();

    const finishConfirmation = async () => {
      if (processing.current) return;
      processing.current = true;
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        let user = sessionData.session?.user || null;
        if (!user) {
          const { data: userData, error: userError } = await supabase.auth.getUser();
          if (userError || !userData.user) throw userError || new Error('Não foi possível confirmar seu e-mail. Abra novamente o link recebido.');
          user = userData.user;
        }

        const nextDestination = safeDestination(user.user_metadata?.signup_redirect);
        if (active) setDestination(nextDestination);
        const planId = checkoutPlan(nextDestination);
        const business = typeof user.user_metadata?.business === 'string' ? user.user_metadata.business.trim() : '';
        const personType = user.user_metadata?.account_person_type === 'pj' ? 'pj' : 'pf';
        const accountCnpj = personType === 'pj' && typeof user.user_metadata?.account_cnpj === 'string'
          ? user.user_metadata.account_cnpj.replace(/\D/g,'')
          : null;
        const identityReservation = typeof user.user_metadata?.identity_reservation === 'string' ? user.user_metadata.identity_reservation.trim() : '';
        let accountId = '';

        if (business) {
          const { data: createdAccount, error: accountError } = await supabase.rpc('create_account', {
            account_name: business,
            account_person_type: personType,
            account_cnpj: accountCnpj,
          });
          if (accountError) throw new Error(clientMessage(accountError.message,'Não foi possível concluir o cadastro da conta.'));
          accountId = typeof createdAccount === 'string' ? createdAccount : '';
        }

        if (identityReservation && accountId) {
          const {error:identityError}=await supabase.rpc('finalize_signup_identity',{
            reservation_token:identityReservation,
            target_account:accountId,
          });
          if(identityError)throw new Error('Seu e-mail foi confirmado, mas não foi possível concluir a validação dos seus dados. Entre em contato com o suporte.');
        }

        if (planId && accountId) {
          if(active)setPhase('payment');
          const {data:targetPlan,error:planError}=await supabase.from('plans').select('app_id').eq('id',planId).eq('active',true).maybeSingle();
          if(planError||!targetPlan)throw new Error('O plano selecionado não está mais disponível.');
          const billingState=await billingRequest<{trialEligibleApps?:string[]}>({action:'list',accountId});
          const useTrial=(billingState.trialEligibleApps||[]).includes(targetPlan.app_id);
          if(useTrial)await reserveTrialNetwork(accountId,targetPlan.app_id);
          const result = await billingRequest<{ url?: string }>({ action: 'checkout', accountId, planId, skipTrial: !useTrial });
          if (!result.url) throw new Error('Sua conta foi confirmada, mas não foi possível abrir o pagamento.');
          const paymentUrl = new URL(result.url);
          if (paymentUrl.protocol !== 'https:' || !['www.mercadopago.com.br', 'mercadopago.com.br'].includes(paymentUrl.hostname)) throw new Error('Sua conta foi confirmada, mas não foi possível abrir o pagamento.');
          await supabase.auth.updateUser({ data: { signup_redirect: null, identity_reservation: null, account_person_type:null, account_cnpj:null } });
          window.location.replace(paymentUrl.href);
          return;
        }

        await supabase.auth.updateUser({ data: { signup_redirect: null, identity_reservation: null, account_person_type:null, account_cnpj:null } });
        if (!active) return;
        router.replace(nextDestination);
        router.refresh();
      } catch (reason) {
        processing.current = false;
        if (active) setError(clientMessage(reason,'Não foi possível concluir a confirmação da conta.'));
      }
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) return;
      setError('');
      void finishConfirmation();
    });

    void finishConfirmation();
    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  return <main className="confirm-shell">
    <Link className="brand confirm-brand" href="/inicio"><span>CRM PLUS</span><small>Store</small></Link>
    <section className="confirm-card" aria-live="polite">
      {!error ? <>
        <div className="confirm-icon is-loading"><LoaderCircle size={26}/></div>
        <span className="eyebrow">Confirmação de acesso</span>
        <h1>{phase==='payment'?'Conta confirmada. Preparando pagamento.':'Confirmando sua conta.'}</h1>
        <p>{phase==='payment'?'Seu e-mail já foi confirmado. Estamos preparando o Mercado Pago para o plano escolhido.':'Estamos confirmando seu e-mail e preparando sua conta CRM PLUS.'}</p>
        <div className="confirm-progress"><span/></div>
      </> : <>
        <div className="confirm-icon"><CheckCircle2 size={26}/></div>
        <span className="eyebrow">Confirmação</span>
        <h1>Precisamos concluir uma etapa.</h1>
        <p>Seu acesso foi preservado. Você pode continuar pela sua conta ou tentar novamente pelo link recebido.</p>
        <p className="confirm-error" role="alert">{error}</p>
        <div className="confirm-actions"><Link className="primary" href={destination}>Continuar</Link><Link className="ghost" href="/conta">Minha conta</Link></div>
      </>}
    </section>
  </main>;
}
