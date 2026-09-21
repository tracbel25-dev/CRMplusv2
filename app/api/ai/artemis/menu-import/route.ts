import { inflateSync } from 'node:zlib';
import { NextRequest, NextResponse } from 'next/server';
import { authorizeAppRequest } from '@/lib/server/appAccess';
import { groqResponse, groqVisionResponse } from '@/lib/ai/server';

export const runtime = 'nodejs';

type ImportedProduct = {
  name: string;
  category: string;
  price: string;
  description: string;
  doubt: string;
};

function cleanText(value: unknown, max = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function decodePdfString(value: string) {
  return value
    .replace(/\\([nrtbf()\\])/g, (_, char: string) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }[char] || char))
    .replace(/\\([0-7]{1,3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)));
}

function textFromPdf(buffer: Buffer) {
  const raw = buffer.toString('latin1');
  const chunks: string[] = [];
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;

  while ((match = streamPattern.exec(raw))) {
    const before = raw.slice(Math.max(0, match.index - 600), match.index);
    let stream = Buffer.from(match[1], 'latin1');
    if (/\/FlateDecode\b/.test(before)) {
      try { stream = inflateSync(stream); } catch { continue; }
    }
    const text = stream.toString('latin1');
    for (const block of text.matchAll(/BT([\s\S]*?)ET/g)) {
      const body = block[1];
      for (const item of body.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g)) {
        const token = item[0].replace(/\s*Tj$/, '');
        chunks.push(decodePdfString(token.slice(1, -1)));
      }
      for (const array of body.matchAll(/\[([\s\S]*?)\]\s*TJ/g)) {
        for (const item of array[1].matchAll(/\((?:\\.|[^\\)])*\)/g)) chunks.push(decodePdfString(item[0].slice(1, -1)));
      }
    }
  }

  return chunks.join(' ').replace(/\s+/g, ' ').trim().slice(0, 28000);
}

function parseJson(raw: string): ImportedProduct[] {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('A IA não retornou uma importação válida.');
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as { products?: unknown[] };
  if (!Array.isArray(parsed.products)) return [];
  return parsed.products.slice(0, 150).flatMap((item): ImportedProduct[] => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const name = cleanText(row.name, 140);
    const category = cleanText(row.category, 100) || 'Outros';
    const price = cleanText(row.price, 30).replace(/[^\d,.-]/g, '').replace('.', ',');
    if (!name) return [];
    return [{
      name,
      category,
      price,
      description: cleanText(row.description, 600),
      doubt: cleanText(row.doubt, 300),
    }];
  });
}

const prompt = 'Você extrai um cardápio de restaurante para uma TELA DE REVISÃO HUMANA.\n\nRetorne somente JSON válido:\n{"products":[{"name":"Produto","category":"Categoria","price":"12,90","description":"","doubt":""}]}\n\nREGRAS:\n- Extraia apenas itens que realmente aparecem no material.\n- Preserve o preço impresso. Não invente preço.\n- Se o preço estiver ilegível ou ambíguo, deixe price="" e explique em doubt.\n- Não transforme tamanhos em produtos separados quando estiver claro que são variações do mesmo produto; nesse caso mantenha o produto e registre a dúvida em doubt.\n- Categoria deve refletir o título/seção do cardápio quando houver.\n- description pode ficar vazia.\n- Não publique, não complete com conhecimento externo e não invente ingredientes.\n- Até 150 produtos.';

export async function POST(request: NextRequest) {
  const access = await authorizeAppRequest(request, 'artemis');
  if (!access) return NextResponse.json({ error: 'Entre com a conta do restaurante para importar o cardápio.' }, { status: 401 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Arquivo inválido.' }, { status: 400 });

  const name = cleanText(body.name, 180);
  const mime = cleanText(body.mime, 100).toLowerCase();
  const base64 = typeof body.base64 === 'string' ? body.base64 : '';
  if (!base64 || base64.length > 18_000_000) return NextResponse.json({ error: 'Arquivo vazio ou grande demais. Use até 10 MB.' }, { status: 400 });

  try {
    let raw = '';
    if (mime.startsWith('image/')) {
      const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
      if (!allowed.has(mime)) return NextResponse.json({ error: 'Use JPG, PNG ou WEBP para fotos.' }, { status: 400 });
      raw = await groqVisionResponse('artemis', prompt, `data:${mime};base64,${base64}`, { maxOutputTokens: 2600 });
    } else if (mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) {
      const buffer = Buffer.from(base64, 'base64');
      if (buffer.length > 10 * 1024 * 1024) return NextResponse.json({ error: 'PDF maior que 10 MB.' }, { status: 400 });
      const text = textFromPdf(buffer);
      if (text.length < 80) {
        return NextResponse.json({ error: 'Este PDF parece escaneado e não possui texto extraível. Exporte a página como imagem e importe a foto.' }, { status: 422 });
      }
      raw = await groqResponse('artemis', `${prompt}\n\nTEXTO EXTRAÍDO DO PDF:\n${text}`, { maxOutputTokens: 2600 });
    } else {
      return NextResponse.json({ error: 'Envie uma foto ou PDF.' }, { status: 400 });
    }

    const products = parseJson(raw);
    if (!products.length) return NextResponse.json({ error: 'Nenhum produto confiável foi encontrado. Revise o arquivo e tente novamente.' }, { status: 422 });
    return NextResponse.json({ products, source: mime.startsWith('image/') ? 'imagem' : 'pdf', reviewRequired: true });
  } catch (reason) {
    return NextResponse.json({ error: reason instanceof Error ? reason.message : 'Não foi possível analisar o cardápio.' }, { status: 502 });
  }
}
