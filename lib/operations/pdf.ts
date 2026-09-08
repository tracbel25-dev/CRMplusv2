import type { Customer, Quote, Settings } from './model';
import { money, total } from './model';

function safeText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrap(text: string, width = 86) {
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

function buildPdf(lines: string[]) {
  const pageLines = lines.slice(0, 58);
  let y = 800;
  const commands = ['BT', '/F1 10 Tf'];
  for (const line of pageLines) {
    commands.push(`1 0 0 1 42 ${y} Tm (${safeText(line)}) Tj`);
    y -= 13;
  }
  commands.push('ET');
  const stream = commands.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
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
  const lines: string[] = [];
  lines.push(business.business || 'Oficina');
  if (business.phone || business.email) lines.push([business.phone, business.email].filter(Boolean).join(' | '));
  lines.push('');
  lines.push(label);
  if (reference) lines.push(`Referencia: ${reference}`);
  lines.push(`Cliente: ${customer?.name || 'Nao informado'}`);
  lines.push(`Validade: ${quote.validUntil || 'Nao informada'} | Versao: ${quote.version}`);
  lines.push('');
  lines.push('Itens');
  quote.lines.forEach(line => {
    const base = `${line.quantity} x ${line.description}${line.brand ? ` (${line.brand})` : ''} - ${money(line.price)} = ${money(Math.round(line.quantity * line.price))}`;
    lines.push(...wrap(base));
  });
  if (quote.discount > 0) lines.push(`Desconto: - ${money(quote.discount)}`);
  lines.push(`TOTAL: ${money(total(quote.lines, quote.discount))}`);
  if (quote.notes) { lines.push(''); lines.push('Observacoes'); lines.push(...wrap(quote.notes)); }
  const content = buildPdf(lines);
  const blob = new Blob([content], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeText(label).replace(/\s+/g, '-').toLowerCase()}.pdf`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
