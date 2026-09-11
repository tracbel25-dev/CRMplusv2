import type { Customer, Quote, Settings } from './model';
import { money, total } from './model';

function safeText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrap(text: string, width = 62) {
  const words = safeText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function pdfText(x: number, y: number, value: string, size = 10, font = 'F1', rgb = '0.09 0.12 0.17') {
  return `${rgb} rg\nBT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${safeText(value)}) Tj ET`;
}

function rightText(x: number, y: number, value: string, size = 10, font = 'F1', rgb = '0.09 0.12 0.17') {
  const approximateWidth = safeText(value).length * size * 0.52;
  return pdfText(Math.max(40, x - approximateWidth), y, value, size, font, rgb);
}

function rect(x: number, y: number, width: number, height: number, rgb: string, stroke = false) {
  return `${rgb} ${stroke ? 'RG' : 'rg'}\n${x} ${y} ${width} ${height} re ${stroke ? 'S' : 'f'}`;
}

function line(x1: number, y1: number, x2: number, y2: number, rgb = '0.86 0.88 0.91', width = 1) {
  return `${rgb} RG\n${width} w\n${x1} ${y1} m ${x2} ${y2} l S`;
}

function formatDate(value: string) {
  if (!value) return 'Nao informada';
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('pt-BR');
}

function pageHeader(commands: string[], business: Settings, label: string, page: number, pages: number) {
  commands.push(rect(0, 770, 595, 72, '0.07 0.12 0.20'));
  commands.push(pdfText(46, 810, business.business || 'Oficina', 18, 'F2', '1 1 1'));
  commands.push(pdfText(46, 790, [business.phone, business.email].filter(Boolean).join('  |  '), 9, 'F1', '0.82 0.87 0.94'));
  commands.push(pdfText(46, 735, 'ORCAMENTO', 9, 'F2', '0.12 0.35 0.72'));
  commands.push(pdfText(46, 708, label, 24, 'F2'));
  commands.push(rightText(549, 714, `Pagina ${page}/${pages}`, 8, 'F1', '0.42 0.47 0.54'));
}

function buildPage({
  quote, customer, business, label, reference, pageIndex, pageCount, lines, finalPage,
}: {
  quote: Quote;
  customer?: Customer;
  business: Settings;
  label: string;
  reference?: string;
  pageIndex: number;
  pageCount: number;
  lines: Quote['lines'];
  finalPage: boolean;
}) {
  const commands: string[] = [];
  pageHeader(commands, business, label, pageIndex + 1, pageCount);

  commands.push(rect(46, 626, 503, 58, '0.96 0.97 0.985'));
  commands.push(pdfText(58, 664, 'CLIENTE', 7, 'F2', '0.42 0.47 0.54'));
  commands.push(pdfText(58, 645, customer?.name || 'Nao informado', 11, 'F2'));
  commands.push(pdfText(235, 664, 'REFERENCIA', 7, 'F2', '0.42 0.47 0.54'));
  commands.push(pdfText(235, 645, reference || `Orcamento ${String(quote.number).padStart(4, '0')}`, 10, 'F2'));
  commands.push(pdfText(410, 664, 'VALIDADE', 7, 'F2', '0.42 0.47 0.54'));
  commands.push(pdfText(410, 645, `${formatDate(quote.validUntil)}  |  v${quote.version}`, 10, 'F2'));

  let y = 594;
  commands.push(rect(46, y, 503, 26, '0.09 0.16 0.27'));
  commands.push(pdfText(58, y + 9, 'DESCRICAO', 8, 'F2', '1 1 1'));
  commands.push(rightText(392, y + 9, 'QTD', 8, 'F2', '1 1 1'));
  commands.push(rightText(468, y + 9, 'UNITARIO', 8, 'F2', '1 1 1'));
  commands.push(rightText(537, y + 9, 'TOTAL', 8, 'F2', '1 1 1'));
  y -= 31;

  for (const item of lines) {
    const description = `${item.description}${item.brand ? ` - ${item.brand}` : ''}`;
    const wrapped = wrap(description, 44).slice(0, 2);
    const rowHeight = wrapped.length > 1 ? 38 : 30;
    commands.push(pdfText(58, y, wrapped[0], 9, 'F2'));
    if (wrapped[1]) commands.push(pdfText(58, y - 13, wrapped[1], 8, 'F1', '0.36 0.41 0.48'));
    commands.push(rightText(392, y, String(item.quantity), 9));
    commands.push(rightText(468, y, money(item.price), 9));
    commands.push(rightText(537, y, money(Math.round(item.quantity * item.price)), 9, 'F2'));
    commands.push(line(46, y - rowHeight + 11, 549, y - rowHeight + 11));
    y -= rowHeight;
  }

  if (finalPage) {
    const subtotal = quote.lines.reduce((sum, item) => sum + Math.round(item.quantity * item.price), 0);
    y -= 8;
    commands.push(pdfText(365, y, 'Subtotal', 9, 'F1', '0.36 0.41 0.48'));
    commands.push(rightText(537, y, money(subtotal), 9, 'F2'));
    if (quote.discount > 0) {
      y -= 19;
      commands.push(pdfText(365, y, 'Desconto', 9, 'F1', '0.36 0.41 0.48'));
      commands.push(rightText(537, y, `- ${money(quote.discount)}`, 9, 'F2'));
    }
    y -= 35;
    commands.push(rect(330, y - 17, 219, 48, '0.91 0.94 0.99'));
    commands.push(pdfText(346, y + 4, 'TOTAL', 8, 'F2', '0.12 0.35 0.72'));
    commands.push(rightText(530, y, money(total(quote.lines, quote.discount)), 18, 'F2', '0.07 0.12 0.20'));

    if (quote.notes?.trim()) {
      y -= 62;
      commands.push(pdfText(46, y, 'OBSERVACOES', 8, 'F2', '0.42 0.47 0.54'));
      y -= 17;
      for (const noteLine of wrap(quote.notes, 92).slice(0, 5)) {
        commands.push(pdfText(46, y, noteLine, 9));
        y -= 13;
      }
    }
  }

  commands.push(line(46, 44, 549, 44));
  commands.push(pdfText(46, 28, business.address || 'Documento gerado pelo CRM PLUS', 7, 'F1', '0.47 0.51 0.58'));
  commands.push(rightText(549, 28, 'CRM PLUS', 7, 'F2', '0.47 0.51 0.58'));
  return commands.join('\n');
}

function buildPdf(streams: string[]) {
  const pageCount = streams.length;
  const firstPageObject = 3;
  const fontRegularObject = firstPageObject + pageCount * 2;
  const fontBoldObject = fontRegularObject + 1;
  const pageObjects = streams.map((_, index) => firstPageObject + index * 2);
  const objects: string[] = [];

  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Kids [${pageObjects.map(number => `${number} 0 R`).join(' ')}] /Count ${pageCount} >>`);
  streams.forEach((stream, index) => {
    const pageObject = firstPageObject + index * 2;
    const contentObject = pageObject + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontRegularObject} 0 R /F2 ${fontBoldObject} 0 R >> >> /Contents ${contentObject} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index++) pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

export function downloadQuotePdf({ quote, customer, business, label, reference }: { quote: Quote; customer?: Customer; business: Settings; label: string; reference?: string }) {
  const perPage = 12;
  const chunks = quote.lines.length
    ? Array.from({ length: Math.ceil(quote.lines.length / perPage) }, (_, index) => quote.lines.slice(index * perPage, index * perPage + perPage))
    : [[]];
  const streams = chunks.map((lines, pageIndex) => buildPage({
    quote,
    customer,
    business,
    label,
    reference,
    pageIndex,
    pageCount: chunks.length,
    lines,
    finalPage: pageIndex === chunks.length - 1,
  }));
  const blob = new Blob([buildPdf(streams)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeText(label).replace(/\s+/g, '-').toLowerCase()}.pdf`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
