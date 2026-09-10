'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { billingRequest } from '@/lib/billing';
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
          if (userError || !userData.user) throw userError || new Error('Não foi possível validar sua confirmação.');
          user = userData.user;
        }

        const nextDestination = safeDestination(user.user_metadata?.signup_redirect);
        if (active) setDestination(nextDestination);
        const planId = checkoutPlan(nextDestination);
        const business = typeof user.user_metadata?.business === 'string' ? user.user_metadata.business.trim() : '';
        let accountId = '';

        if (business) {
          const { data: createdAccount, error: accountError } = await supabase.rpc('create_account', { account_name: business });
          if (accountError) throw accountError;
          accountId = typeof createdAccount === 'string' ? createdAccount : '';
        }

        if (planId && accountId) {
          const result = await billingRequest<{ url?: string }>({ action: 'checkout', accountId, planId });
          if (!result.url) throw new Error('O Mercado Pago não retornou o link de pagamento.');
          const paymentUrl = new URL(result.url);
          if (paymentUrl.protocol !== 'https:' || !['www.mercadopago.com.br', 'mercadopago.com.br'].includes(paymentUrl.hostname)) throw new Error('O link de pagamento retornado é inválido.');
          await supabase.auth.updateUser({ data: { signup_redirect: null } });
          window.location.replace(paymentUrl.href);
          return;
        }

        await supabase.auth.updateUser({ data: { signup_redirect: null } });
        if (!active) return;
        router.replace(nextDestination);
        router.refresh();
      } catch (reason) {
        processing.current = false;
        if (active) setError((reason as Error).message || 'Não foi possível confirmar seu acesso.');
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
        <h1>Preparando seu pagamento.</h1>
        <p>Seu e-mail foi confirmado. Sua sessão continua ativa e o Mercado Pago será aberto automaticamente para o plano escolhido.</p>
        <div className="confirm-progress"><span/></div>
      </> : <>
        <div className="confirm-icon"><CheckCircle2 size={26}/></div>
        <span className="eyebrow">Conta confirmada</span>
        <h1>Falta somente o Mercado Pago.</h1>
        <p>Sua conta continua logada e o plano escolhido foi preservado.</p>
        <p className="confirm-error" role="alert">{error}</p>
        <div className="confirm-actions"><Link className="primary" href={destination}>Continuar</Link><Link className="ghost" href="/conta">Minha conta</Link></div>
      </>}
    </section>
  </main>;
}
