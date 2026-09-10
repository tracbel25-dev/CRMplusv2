import { admin, applySnapshot, check, configured, findLocal, HttpError, mp, processInvoice, verifySignature } from '../_shared/mercadopago.ts';

export async function handler(request: Request) {
  const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
  if (request.method === 'GET') return reply({ service: 'mercadopago-webhook', ready: configured() });
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  try {
    const secret = Deno.env.get('MERCADO_PAGO_WEBHOOK_SECRET');
    if (!secret) return reply({ error: 'Webhook not configured' }, 503);
    if (!await verifySignature(request, secret)) return reply({ error: 'Invalid signature' }, 401);
    const body = await request.json();
    const id = new URL(request.url).searchParams.get('data.id')!;
    if (String(body.data?.id).toLowerCase() !== id.toLowerCase()) return reply({ error: 'Resource mismatch' }, 400);
    if (body.type === 'subscription_preapproval') {
      const remote = await mp(`/preapproval/${encodeURIComponent(id)}`);
      const local = await findLocal(remote);
      if (local) await applySnapshot(local, remote);
    } else if (body.type === 'subscription_authorized_payment') {
      await processInvoice(await mp(`/authorized_payments/${encodeURIComponent(id)}`));
    } else if (body.type === 'payment') {
      const payment = await mp(`/v1/payments/${encodeURIComponent(id)}`);
      // Payment events include refunds and chargebacks. Already linked IDs are authoritative.
      const { data: known, error } = await admin().from('mp_payments').select('subscription_id').eq('id', String(payment.id)).maybeSingle();
      check(error);
      const localId = known?.subscription_id || payment.external_reference;
      if (typeof localId === 'string' && /^[0-9a-f-]{36}$/i.test(localId)) {
        const { data: local, error: localError } = await admin().from('mp_subscriptions').select('*').eq('id', localId).maybeSingle();
        check(localError);
        if (local?.preapproval_id) {
          const remote = await mp(`/preapproval/${encodeURIComponent(local.preapproval_id)}`);
          // Initial/unlinked payments must also appear in this subscription's invoices.
          if (!known) {
            const invoices = await mp(`/authorized_payments/search?preapproval_id=${encodeURIComponent(local.preapproval_id)}&payment_id=${encodeURIComponent(payment.id)}`);
            if (!(invoices.results || []).some((invoice: any) => String(invoice.preapproval_id) === local.preapproval_id && String(invoice.payment?.id) === String(payment.id)))
              return reply({ received: true, ignored: true });
          }
          await applySnapshot(local, remote, payment);
        }
      }
    }
    return reply({ received: true });
  } catch (error) {
    console.error('Webhook processing failed:', error instanceof HttpError ? error.message : 'Unexpected error');
    // Retry any uncommitted event; there is no premature success acknowledgement.
    return reply({ error: 'Processing failed; retry notification' }, 500);
  }
}
Deno.serve(handler);
