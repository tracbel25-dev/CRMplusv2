import { NextRequest, NextResponse } from 'next/server';
import { presignR2, readR2Config } from '@/lib/r2/server';
import { isZeusChecklistAssetFolder, isZeusChecklistView, type ZeusChecklistView } from '@/lib/operations/checklistAssets';

export const runtime = 'nodejs';

const R2_VIEW_FILENAME: Record<ZeusChecklistView, string> = {
  teto: 'teto',
  frente: 'frente',
  traseira: 'traseira',
  lateral_esquerda: 'lateral_esq',
  lateral_direita: 'lateral_dir',
};

export async function GET(request: NextRequest) {
  const folder = request.nextUrl.searchParams.get('folder') || '';
  const view = request.nextUrl.searchParams.get('view') || '';

  if (!isZeusChecklistAssetFolder(folder) || !isZeusChecklistView(view)) {
    return NextResponse.json({ error: 'Imagem de checklist inválida.' }, { status: 400 });
  }

  try {
    readR2Config('zeus');
    const filename = R2_VIEW_FILENAME[view];
    const key = `accounts/checklist/${folder}/${filename}.png`;
    const signedUrl = presignR2('zeus', 'GET', key, 3600);
    const response = NextResponse.redirect(signedUrl, 307);
    response.headers.set('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
    return response;
  } catch (reason) {
    return NextResponse.json(
      { error: reason instanceof Error ? reason.message : 'Não foi possível acessar as imagens do checklist.' },
      { status: 503 },
    );
  }
}
