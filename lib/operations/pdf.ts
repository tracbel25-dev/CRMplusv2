import type { Customer, Quote, Settings } from './model';
import { money, total } from './model';

function safeText(value: unknown) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[–—]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E]/g, ' ').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}
function wrap(text: string, width = 86) {
  const words = safeText(text).split(/\s+/).filter(Boolean); const lines: string[] = []; let current = '';
  for (const word of words) { const next = current ? `${current} ${word}` : word; if (next.length > width && current) { lines.push(current); current = word; } else current = next; }
  if (current) lines.push(current); return lines.length ? lines : [''];
}
function contentStream(lines: string[]) {
  let y = 800; const commands = ['BT', '/F1 10 Tf'];
  for (const line of lines) { commands.push(`1 0 0 1 42 ${y} Tm (${safeText(line)}) Tj`); y -= 13; }
  commands.push('ET'); return commands.join('\n');
}
function buildPdf(lines: string[]) {
  const pages = Array.from({ length: Math.max(1, Math.ceil(lines.length / 55)) }, (_, index) => lines.slice(index * 55, index * 55 + 55));
  const fontObject = 3 + pages.length * 2;
  const pageObjects = pages.map((_, index) => 3 + index * 2);
  const objects: string[] = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Kids [${pageObjects.map(number => `${number} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  pages.forEach((page, index) => {
    const pageObject = 3 + index * 2; const contentObject = pageObject + 1; const stream = contentStream(page);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObject} 0 R >> >> /Contents ${contentObject} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length; pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index++) pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`; return pdf;
}

export function downloadQuotePdf({ quote, customer, business, label, reference }: { quote: Quote; customer?: Customer; business: Settings; label: string; reference?: string }) {
  const lines: string[] = [business.business || 'Oficina'];
  if (business.phone || business.email) lines.push([business.phone, business.email].filter(Boolean).join(' | '));
  lines.push('', label); if (reference) lines.push(`Referencia: ${reference}`);
  lines.push(`Cliente: ${customer?.name || 'Nao informado'}`, `Validade: ${quote.validUntil || 'Nao informada'} | Versao: ${quote.version}`, '', 'Itens');
  quote.lines.forEach(line => lines.push(...wrap(`${line.quantity} x ${line.description}${line.brand ? ` (${line.brand})` : ''} - ${money(line.price)} = ${money(Math.round(line.quantity * line.price))}`)));
  if (quote.discount > 0) lines.push(`Desconto: - ${money(quote.discount)}`);
  lines.push(`TOTAL: ${money(total(quote.lines, quote.discount))}`);
  if (quote.notes) lines.push('', 'Observacoes', ...wrap(quote.notes));
  const blob = new Blob([buildPdf(lines)], { type: 'application/pdf' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `${safeText(label).replace(/\s+/g, '-').toLowerCase()}.pdf`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
