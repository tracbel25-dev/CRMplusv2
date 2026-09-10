import { NextRequest, NextResponse } from 'next/server';
import { authorizeAppRequest } from '@/lib/server/appAccess';
import { createInvoiceDraft, markPendingConfiguration, readFiscalWorkspace, saveFiscalProfile } from '@/lib/fiscal/artemisNfse';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const access = await authorizeAppRequest(request, 'artemis');
  if (!access) return NextResponse.json({ error: 'Sessão inválida ou sem acesso ao Artemis.' }, { status: 401 });
  try {
    return NextResponse.json(await readFiscalWorkspace(access.accountId));
  } catch (reason) {
    return NextResponse.json({ error: reason instanceof Error ? reason.message : 'Não foi possível carregar o módulo fiscal.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await authorizeAppRequest(request, 'artemis');
  if (!access) return NextResponse.json({ error: 'Sessão inválida ou sem acesso ao Artemis.' }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || '');

  try {
    if (action === 'save-profile') {
      const profile = await saveFiscalProfile(access.accountId, {
        cnpj: String(body.cnpj || ''),
        municipalRegistration: String(body.municipalRegistration || ''),
        municipalityIbge: String(body.municipalityIbge || ''),
        taxRegime: String(body.taxRegime || ''),
        dpsSeries: String(body.dpsSeries || '1'),
        provider: body.provider === 'municipal' ? 'municipal' : 'national',
        municipalProviderKey: String(body.municipalProviderKey || ''),
      });
      return NextResponse.json({ profile });
    }

    if (action === 'create-draft') {
      const invoice = await createInvoiceDraft(access.accountId, access.userId, body);
      return NextResponse.json({ invoice }, { status: 201 });
    }

    if (action === 'issue') {
      const invoiceId = String(body.invoiceId || '');
      if (!invoiceId) return NextResponse.json({ error: 'Informe a nota que será emitida.' }, { status: 400 });
      const invoice = await markPendingConfiguration(access.accountId, invoiceId);
      return NextResponse.json({ invoice, error: 'A emissão direta ainda depende do certificado digital do contribuinte, credenciamento/autorização do município e do conector fiscal correspondente.' }, { status: 409 });
    }

    return NextResponse.json({ error: 'Ação fiscal inválida.' }, { status: 400 });
  } catch (reason) {
    return NextResponse.json({ error: reason instanceof Error ? reason.message : 'Não foi possível concluir a operação fiscal.' }, { status: 500 });
  }
}
