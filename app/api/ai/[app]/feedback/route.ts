import { NextRequest, NextResponse } from 'next/server';
import { authorizeAppRequest, type ServerApp } from '@/lib/server/appAccess';
import { persistLearningFeedback } from '@/lib/ai/server';

export const runtime = 'nodejs';

function isSupportedApp(value: string): value is ServerApp {
  return value === 'zeus' || value === 'artemis';
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ app: string }> }) {
  const { app } = await params;
  if (!isSupportedApp(app)) return NextResponse.json({ error: 'Aplicativo de IA inválido.' }, { status: 404 });

  const access = await authorizeAppRequest(request, app);
  if (!access) return NextResponse.json({ error: 'Entre com uma conta que tenha acesso a este aplicativo.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const interactionId = typeof body?.interactionId === 'string' ? body.interactionId.trim() : '';
  const correctedText = typeof body?.correctedText === 'string' ? body.correctedText.trim() : '';

  if (!interactionId) return NextResponse.json({ error: 'Interação de IA não informada.' }, { status: 400 });
  if (correctedText.length < 8) return NextResponse.json({ error: 'A correção é curta demais para gerar aprendizado confiável.' }, { status: 400 });
  if (correctedText.length > 12000) return NextResponse.json({ error: 'A correção é longa demais para esta etapa de aprendizado.' }, { status: 400 });

  try {
    const result = await persistLearningFeedback({
      app,
      tenantKey: access.accountId,
      userId: access.userId,
      interactionId,
      correctedText,
    });
    return NextResponse.json(result);
  } catch (reason) {
    return NextResponse.json({ error: reason instanceof Error ? reason.message : 'Não foi possível processar o aprendizado.' }, { status: 502 });
  }
}
