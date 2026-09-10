'use client';

import { useState } from 'react';
import { money } from '@/lib/operations/model';
import { Button } from './ui';

export function MercadoPagoTapGuide({ amountCents, reference }: { amountCents: number; reference: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyAmount = async () => {
    await navigator.clipboard.writeText((amountCents / 100).toFixed(2).replace('.', ','));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return <>
    <Button variant="secondary" disabled={amountCents <= 0} onClick={() => setOpen(true)}>Tap no celular</Button>
    {open && <div className="mp-tap-guide" role="dialog" aria-modal="true" aria-label="Cobrar com Tap no celular" style={{ width: '100%', border: '1px solid var(--op-line)', padding: 18, marginTop: 10 }}>
      <div style={{ display: 'grid', gap: 10 }}>
        <div><strong>Tap no celular · {money(amountCents)}</strong><p className="op-muted" style={{ margin: '6px 0 0' }}>{reference}</p></div>
        <p style={{ margin: 0 }}>No celular que recebe o pagamento, abra o app Mercado Pago e vá em <strong>Cobrar → Point Tap</strong> no Android ou <strong>Tap to Pay</strong> no iPhone. Informe exatamente o valor acima e aproxime o cartão ou carteira digital do cliente.</p>
        <p className="op-muted" style={{ margin: 0 }}>O NFC é executado dentro do aplicativo do Mercado Pago. O CRM PLUS não acessa os dados do cartão e não recebe parte do pagamento.</p>
        <div className="op-actions" style={{ flexWrap: 'wrap' }}>
          <Button onClick={() => { void copyAmount(); }}>{copied ? 'Valor copiado' : 'Copiar valor'}</Button>
          <Button variant="secondary" onClick={() => window.open('https://www.mercadopago.com.br/ferramentas-para-vender/point-tap', '_blank', 'noopener,noreferrer')}>Abrir página do Tap</Button>
          <Button variant="text" onClick={() => setOpen(false)}>Fechar</Button>
        </div>
      </div>
    </div>}
  </>;
}
