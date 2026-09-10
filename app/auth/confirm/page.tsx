'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { billingRequest } from '@/lib/billing';
import { createStoreClient } from '@/lib/supabase/storeClient';
import './confirm.css';

function safeDestination(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/entrar';
  return value;
}

function checkoutPlan(destination: string) {
  try {
    const url = new URL(destination, window.location.origin);
    if (url.pathname !== '/assinaturas') return null;
    return url.searchParams.get('plano');
  } catch {
    return null;
  }
}

export default function ConfirmPage() {
  const router = useRouter();
  const processing = useRef(false);
  const [error, setError] = useState('');

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

        const destination = safeDestination(user.user_metadata?.signup_redirect);
        const planId = checkoutPlan(destination);
        const business = typeof user.user_metadata?.business === 'string' ? user.user_metadata.business.trim() : '';
        let accountId = '';

        if (business) {
          const { data: createdAccount, error: accountError } = await supabase.rpc('create_account', { account_name: business });
          if (accountError) throw accountError;
          accountId = typeof createdAccount === 'string' ? createdAccount : '';
        }

        // If this signup started from a selected paid plan, confirmation is the
        // last internal step: open Mercado Pago immediately instead of stopping
        // on the subscriptions screen.
        if (planId && accountId) {
          const result = await billingRequest<{ url?: string }>({ action: 'checkout', accountId, planId });
          if (!result.url) throw new Error('O Mercado Pago não retornou o link de pagamento.');
          const paymentUrl = new URL(result.url);
          if (paymentUrl.protocol !== 'https:' || !['www.mercadopago.com.br', 'mercadopago.com.br'].includes(paymentUrl.hostname)) {
            throw new Error('O link de pagamento retornado é inválido.');
          }
          await supabase.auth.updateUser({ data: { signup_redirect: null } });
          window.location.replace(paymentUrl.href);
          return;
        }

        await supabase.auth.updateUser({ data: { signup_redirect: null } });
        if (!active) return;
        router.replace(destination);
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
        <p>Seu e-mail foi confirmado. Estamos vinculando sua empresa e abrindo o Mercado Pago para o plano escolhido.</p>
        <div className="confirm-progress"><span/></div>
      </> : <>
        <div className="confirm-icon"><CheckCircle2 size={26}/></div>
        <span className="eyebrow">Confirmação de acesso</span>
        <h1>E-mail confirmado.</h1>
        <p>O e-mail foi validado, mas não conseguimos abrir o pagamento automaticamente.</p>
        <p className="confirm-error" role="alert">{error}</p>
        <div className="confirm-actions"><Link className="primary" href="/assinaturas">Ir para assinaturas</Link><Link className="ghost" href="/inicio">Voltar à Store</Link></div>
      </>}
    </section>
  </main>;
}
