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
    if (next.length > width && current) { lines.push(current); current = word; }
    else current = next;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function text(x: number, y: number, value: string, size = 10, font = 'F1', rgb = '0.09 0.12 0.17') {
  return `${rgb} rg\nBT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${safeText(value)}) Tj ET`;
}

function rightText(x: number, y: number, value: string, size = 10, font = 'F1', rgb = '0.09 0.12 0.17') {
  const approximateWidth = safeText(value).length * size * 0.52;
  return text(Math.max(40, x - approximateWidth), y, value, size, font, rgb);
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

function businessContact(settings: Settings) {
  return [settings.phone, settings.email].filter(Boolean).join('  |  ');
}

function pageHeader(commands: string[], business: Settings, label: string, page: number, pages: number) {
  commands.push(rect(0, 780, 595, 62, '0.055 0.10 0.17'));
  commands.push(rect(0, 775, 595, 5, '0.13 0.37 0.76'));
  commands.push(text(42, 813, business.business || 'Oficina', 17, 'F2', '1 1 1'));
  const contact = businessContact(business);
  if (contact) commands.push(text(42, 794, contact, 8, 'F1', '0.79 0.85 0.93'));
  commands.push(text(42, 744, 'ORCAMENTO COMERCIAL', 8, 'F2', '0.13 0.37 0.76'));
  commands.push(text(42, 716, label, 25, 'F2'));
  commands.push(rightText(553, 721, `Pagina ${page}/${pages}`, 8, 'F1', '0.45 0.49 0.56'));
}

function infoCard(commands: string[], quote: Quote, customer: Customer | undefined, reference: string | undefined) {
  commands.push(rect(42, 638, 511, 55, '0.965 0.972 0.982'));
  commands.push(rect(42, 638, 4, 55, '0.13 0.37 0.76'));
  commands.push(text(57, 675, 'CLIENTE', 7, 'F2', '0.43 0.48 0.56'));
  commands.push(text(57, 655, customer?.name || 'Nao informado', 11, 'F2'));
  commands.push(text(247, 675, 'REFERENCIA', 7, 'F2', '0.43 0.48 0.56'));
  commands.push(text(247, 655, reference || `Orcamento ${String(quote.number).padStart(4, '0')}`, 10, 'F2'));
  commands.push(text(420, 675, 'VALIDADE', 7, 'F2', '0.43 0.48 0.56'));
  commands.push(text(420, 655, formatDate(quote.validUntil), 10, 'F2'));
  commands.push(text(420, 643, `Versao ${quote.version}`, 7, 'F1', '0.43 0.48 0.56'));
}

function itemRows(commands: string[], rows: Quote['lines']) {
  let y = 598;
  commands.push(rect(42, y, 511, 28, '0.075 0.14 0.235'));
  commands.push(text(56, y + 10, 'ITEM / DESCRICAO', 8, 'F2', '1 1 1'));
  commands.push(rightText(404, y + 10, 'QTD', 8, 'F2', '1 1 1'));
  commands.push(rightText(480, y + 10, 'UNITARIO', 8, 'F2', '1 1 1'));
  commands.push(rightText(542, y + 10, 'TOTAL', 8, 'F2', '1 1 1'));
  y -= 34;

  rows.forEach((item, index) => {
    const description = `${item.description}${item.brand ? ` - ${item.brand}` : ''}`;
    const wrapped = wrap(description, 42).slice(0, 2);
    const rowHeight = wrapped.length > 1 ? 45 : 36;
    if (index % 2 === 1) commands.push(rect(42, y - rowHeight + 12, 511, rowHeight, '0.982 0.985 0.99'));
    commands.push(text(56, y + 3, wrapped[0], 9, 'F2'));
    commands.push(text(56, y - 10, item.kind || 'Item', 7, 'F1', '0.43 0.48 0.56'));
    if (wrapped[1]) commands.push(text(145, y - 10, wrapped[1], 7, 'F1', '0.43 0.48 0.56'));
    commands.push(rightText(404, y + 1, String(item.quantity), 9));
    commands.push(rightText(480, y + 1, money(item.price), 9));
    commands.push(rightText(542, y + 1, money(Math.round(item.quantity * item.price)), 9, 'F2'));
    commands.push(line(42, y - rowHeight + 12, 553, y - rowHeight + 12, '0.90 0.92 0.94'));
    y -= rowHeight;
  });
  return y;
}

function summary(commands: string[], quote: Quote, startY: number) {
  const subtotal = quote.lines.reduce((sum, item) => sum + Math.round(item.quantity * item.price), 0);
  const serviceSubtotal = quote.lines.filter(item => item.kind === 'Serviço').reduce((sum, item) => sum + Math.round(item.quantity * item.price), 0);
  const partsSubtotal = quote.lines.filter(item => item.kind === 'Peça').reduce((sum, item) => sum + Math.round(item.quantity * item.price), 0);
  let y = startY - 8;

  commands.push(rect(315, y - 74, 238, 92, '0.955 0.968 0.99'));
  commands.push(text(330, y + 2, 'RESUMO', 7, 'F2', '0.13 0.37 0.76'));
  let sy = y - 15;
  if (serviceSubtotal > 0) { commands.push(text(330, sy, 'Servicos', 8, 'F1', '0.40 0.45 0.52')); commands.push(rightText(538, sy, money(serviceSubtotal), 8, 'F2')); sy -= 14; }
  if (partsSubtotal > 0) { commands.push(text(330, sy, 'Pecas', 8, 'F1', '0.40 0.45 0.52')); commands.push(rightText(538, sy, money(partsSubtotal), 8, 'F2')); sy -= 14; }
  commands.push(text(330, sy, 'Subtotal', 8, 'F1', '0.40 0.45 0.52')); commands.push(rightText(538, sy, money(subtotal), 8, 'F2')); sy -= 14;
  if (quote.discount > 0) { commands.push(text(330, sy, 'Desconto', 8, 'F1', '0.40 0.45 0.52')); commands.push(rightText(538, sy, `- ${money(quote.discount)}`, 8, 'F2')); sy -= 14; }
  commands.push(line(330, sy + 6, 538, sy + 6, '0.75 0.80 0.87'));
  commands.push(text(330, sy - 8, 'TOTAL', 9, 'F2', '0.13 0.37 0.76'));
  commands.push(rightText(538, sy - 11, money(total(quote.lines, quote.discount)), 18, 'F2', '0.055 0.10 0.17'));

  return y - 92;
}

function notesAndApproval(commands: string[], quote: Quote, business: Settings, startY: number) {
  let y = startY - 10;
  if (quote.notes?.trim()) {
    commands.push(text(42, y, 'OBSERVACOES', 8, 'F2', '0.43 0.48 0.56'));
    y -= 16;
    commands.push(rect(42, y - 52, 511, 62, '0.975 0.978 0.983'));
    let noteY = y - 4;
    for (const noteLine of wrap(quote.notes, 94).slice(0, 4)) { commands.push(text(55, noteY, noteLine, 8)); noteY -= 13; }
    y -= 72;
  }

  if (y > 105) {
    commands.push(text(42, y, 'APROVACAO DO CLIENTE', 8, 'F2', '0.43 0.48 0.56'));
    y -= 20;
    commands.push(line(42, y - 26, 248, y - 26, '0.65 0.69 0.74'));
    commands.push(text(42, y - 40, 'Nome / assinatura', 7, 'F1', '0.50 0.54 0.60'));
    commands.push(line(303, y - 26, 553, y - 26, '0.65 0.69 0.74'));
    commands.push(text(303, y - 40, 'Data', 7, 'F1', '0.50 0.54 0.60'));
  }

  commands.push(line(42, 48, 553, 48));
  commands.push(text(42, 31, business.address || 'Documento gerado pelo CRM PLUS', 7, 'F1', '0.47 0.51 0.58'));
  commands.push(rightText(553, 31, 'CRM PLUS', 7, 'F2', '0.47 0.51 0.58'));
}

function buildPage({ quote, customer, business, label, reference, pageIndex, pageCount, lines, finalPage }: {
  quote: Quote; customer?: Customer; business: Settings; label: string; reference?: string;
  pageIndex: number; pageCount: number; lines: Quote['lines']; finalPage: boolean;
}) {
  const commands: string[] = [];
  pageHeader(commands, business, label, pageIndex + 1, pageCount);
  infoCard(commands, quote, customer, reference);
  const afterRows = itemRows(commands, lines);
  if (finalPage) {
    const afterSummary = summary(commands, quote, afterRows);
    notesAndApproval(commands, quote, business, afterSummary);
  } else {
    commands.push(line(42, 48, 553, 48));
    commands.push(text(42, 31, business.address || 'Documento gerado pelo CRM PLUS', 7, 'F1', '0.47 0.51 0.58'));
    commands.push(rightText(553, 31, 'Continua na proxima pagina', 7, 'F2', '0.47 0.51 0.58'));
  }
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
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index++) pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

export function downloadQuotePdf({ quote, customer, business, label, reference }: { quote: Quote; customer?: Customer; business: Settings; label: string; reference?: string }) {
  const perPage = 10;
  const chunks = quote.lines.length
    ? Array.from({ length: Math.ceil(quote.lines.length / perPage) }, (_, index) => quote.lines.slice(index * perPage, index * perPage + perPage))
    : [[]];
  const streams = chunks.map((lines, pageIndex) => buildPage({ quote, customer, business, label, reference, pageIndex, pageCount: chunks.length, lines, finalPage: pageIndex === chunks.length - 1 }));
  const blob = new Blob([buildPdf(streams)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeText(label).replace(/\s+/g, '-').toLowerCase()}.pdf`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
