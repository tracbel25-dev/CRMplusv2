'use client';

import { useState } from 'react';
import { money } from '@/lib/operations/model';
import { Button } from './ui';

export function MercadoPagoTapGuide({ amountCents, reference }: { amountCents: number; reference: string }) {
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [copied, setCopied] = useState(false);

  const amountText = (amountCents / 100).toFixed(2).replace('.', ',');

  const copyAmount = async () => {
    await navigator.clipboard.writeText(amountText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const openTap = async () => {
    if (amountCents <= 0 || opening) return;
    setOpening(true);
    try {
      // O Mercado Pago usa este esquema no próprio CTA oficial do Tap to Pay/Point Tap.
      // A API pública não documenta um parâmetro para pré-preencher o valor no Tap,
      // então copiamos o valor antes de abrir o app para evitar redigitação incorreta.
      try { await navigator.clipboard.writeText(amountText); } catch { /* clipboard pode ser bloqueado */ }
      window.location.href = 'mercadopago://start_new_payment?method=ttp&word=point_tap&utm_source=crmplus&utm_medium=integration';
    } finally {
      window.setTimeout(() => setOpening(false), 1800);
    }
  };

  return <>
    <Button variant="secondary" disabled={amountCents <= 0} onClick={() => setOpen(true)}>Tap no celular</Button>
    {open && <div className="mp-tap-guide" role="dialog" aria-modal="true" aria-label="Cobrar com Tap no celular" style={{ width: '100%', border: '1px solid var(--op-line)', padding: 18, marginTop: 10 }}>
      <div style={{ display: 'grid', gap: 10 }}>
        <div><strong>Tap no celular · {money(amountCents)}</strong><p className="op-muted" style={{ margin: '6px 0 0' }}>{reference}</p></div>
        <p style={{ margin: 0 }}>Toque em <strong>Abrir Tap no Mercado Pago</strong>. O CRM PLUS abre diretamente a tela de Tap do aplicativo Mercado Pago, sem passar pela página comercial.</p>
        <p className="op-muted" style={{ margin: 0 }}>O Mercado Pago ainda não documenta um parâmetro público para abrir o Tap com o valor já preenchido. Por segurança, o CRM PLUS copia automaticamente <strong>R$ {amountText}</strong> antes de abrir o app. Cole o valor no Tap caso o Mercado Pago não o preencha.</p>
        <p className="op-muted" style={{ margin: 0 }}>A leitura NFC e os dados do cartão permanecem dentro do aplicativo Mercado Pago. O CRM PLUS não recebe parte do pagamento.</p>
        <div className="op-actions" style={{ flexWrap: 'wrap' }}>
          <Button disabled={opening} onClick={() => { void openTap(); }}>{opening ? 'Abrindo Tap…' : 'Abrir Tap no Mercado Pago'}</Button>
          <Button variant="secondary" onClick={() => { void copyAmount(); }}>{copied ? 'Valor copiado' : `Copiar R$ ${amountText}`}</Button>
          <Button variant="text" onClick={() => setOpen(false)}>Fechar</Button>
        </div>
      </div>
    </div>}
  </>;
}
