import { createClient } from '@supabase/supabase-js';
import { readOperationalSupabaseConfig } from '@/lib/supabase/operationalConfig';

export type FiscalProfileInput = {
  cnpj: string;
  municipalRegistration: string;
  municipalityIbge: string;
  taxRegime: string;
  dpsSeries: string;
  provider: 'national' | 'municipal';
  municipalProviderKey?: string;
};

function clean(value: unknown, max = 180) {
  return String(value ?? '').trim().slice(0, max);
}

function artemisAdmin() {
  const config = readOperationalSupabaseConfig('artemis');
  if (!config.secretKey) throw new Error('ARTEMIS_SUPABASE_SECRET_KEY não está configurada no servidor.');
  return createClient(config.url, config.secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function readFiscalWorkspace(tenantKey: string) {
  const db = artemisAdmin();
  const [profile, invoices] = await Promise.all([
    db.from('fiscal_profiles').select('*').eq('tenant_key', tenantKey).maybeSingle(),
    db.from('service_invoices').select('id,order_id,customer_name,customer_document,service_code,description,amount_cents,status,provider,provider_reference,access_key,invoice_number,error_message,issued_at,created_at').eq('tenant_key', tenantKey).order('created_at', { ascending: false }).limit(50),
  ]);
  if (profile.error) throw profile.error;
  if (invoices.error) throw invoices.error;
  return { profile: profile.data, invoices: invoices.data || [] };
}

export async function saveFiscalProfile(tenantKey: string, input: FiscalProfileInput) {
  const db = artemisAdmin();
  const row = {
    tenant_key: tenantKey,
    cnpj: clean(input.cnpj, 14).replace(/\D/g, ''),
    municipal_registration: clean(input.municipalRegistration, 40),
    municipality_ibge: clean(input.municipalityIbge, 7).replace(/\D/g, ''),
    tax_regime: clean(input.taxRegime, 80),
    dps_series: clean(input.dpsSeries || '1', 5),
    provider: input.provider === 'municipal' ? 'municipal' : 'national',
    municipal_provider_key: clean(input.municipalProviderKey, 120),
    enabled: false,
    updated_at: new Date().toISOString(),
  };
  if (row.cnpj.length !== 14) throw new Error('Informe um CNPJ com 14 dígitos.');
  if (row.municipality_ibge.length !== 7) throw new Error('Informe o código IBGE do município com 7 dígitos.');
  const { data, error } = await db.from('fiscal_profiles').upsert(row).select('*').single();
  if (error) throw error;
  return data;
}

export async function createInvoiceDraft(tenantKey: string, userId: string, body: Record<string, unknown>) {
  const db = artemisAdmin();
  const amountCents = Math.round(Number(body.amountCents));
  const row = {
    tenant_key: tenantKey,
    order_id: clean(body.orderId, 64) || null,
    customer_name: clean(body.customerName, 180),
    customer_document: clean(body.customerDocument, 20).replace(/\D/g, ''),
    customer_email: clean(body.customerEmail, 180),
    service_code: clean(body.serviceCode, 40),
    description: clean(body.description, 1600),
    amount_cents: amountCents,
    provider: body.provider === 'municipal' ? 'municipal' : 'national',
    created_by: userId,
    request_payload: {},
  };
  if (!row.customer_name || !row.service_code || !row.description) throw new Error('Preencha cliente, código do serviço e descrição.');
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error('Informe um valor válido para a nota.');
  const { data, error } = await db.from('service_invoices').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

export async function markPendingConfiguration(tenantKey: string, invoiceId: string) {
  const db = artemisAdmin();
  const { data, error } = await db.from('service_invoices')
    .update({ status: 'pending_configuration', error_message: 'Emissão aguardando certificado digital e credenciamento do contribuinte no emissor correspondente.', updated_at: new Date().toISOString() })
    .eq('tenant_key', tenantKey)
    .eq('id', invoiceId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
