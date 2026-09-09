import type { Data } from '@/lib/operations/model';

export type AIFormApp = 'zeus' | 'artemis';

const COMMERCIAL_COMPETITOR = /(concorrente|competidor|outra oficina|outra empresa|empresa rival)/i;
const COMMERCIAL_VALUE = /(r\$|pre[cç]o|valor|cobrou|cobra|cota[cç][aã]o|proposta|desconto|margem|or[cç]amento)/i;

function redact(value: unknown, max = 520) {
  let text = String(value ?? '').trim();
  if (!text) return '';
  if (COMMERCIAL_COMPETITOR.test(text) && COMMERCIAL_VALUE.test(text)) return '[conteúdo comercial de terceiro omitido]';

  text = text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[e-mail omitido]')
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[CPF omitido]')
    .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, '[CNPJ omitido]')
    .replace(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}/g, '[telefone omitido]')
    .replace(/R\$\s?\d[\d.,]*/gi, '[valor omitido]')
    .replace(/\s+/g, ' ')
    .trim();

  return text.slice(0, max);
}

function join(parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(' | ').slice(0, 900);
}

function zeusMass(data: Data) {
  return [...data.jobs]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 32)
    .map(job => {
      const asset = data.assets.find(item => item.id === job.assetId);
      const tasks = job.tasks.slice(0, 6).map(item => redact(item.description, 180)).filter(Boolean).join('; ');
      return join([
        `Tipo: ${redact(job.type, 120)}`,
        asset?.model ? `Equipamento/modelo: ${redact(asset.model, 160)}` : undefined,
        job.complaint ? `Relato: ${redact(job.complaint)}` : undefined,
        job.diagnosis ? `Diagnóstico revisado: ${redact(job.diagnosis)}` : undefined,
        job.notes ? `Observações: ${redact(job.notes, 320)}` : undefined,
        tasks ? `Serviços/tarefas: ${tasks}` : undefined,
      ]);
    })
    .filter(Boolean);
}

function artemisMass(data: Data) {
  const products = [...data.products].slice(0, 36).map(product => join([
    `Produto: ${redact(product.name, 160)}`,
    product.category ? `Categoria: ${redact(product.category, 120)}` : undefined,
    product.description ? `Descrição: ${redact(product.description, 360)}` : undefined,
    product.allergens ? `Ingredientes/alergênicos: ${redact(product.allergens, 300)}` : undefined,
    product.preparation ? `Preparo cadastrado: ${Math.max(0, Number(product.preparation) || 0)} min` : undefined,
  ])).filter(Boolean);

  const usage = new Map<string, number>();
  for (const order of data.orders) {
    for (const line of order.lines) {
      const label = redact(line.description, 180);
      if (!label) continue;
      usage.set(label, (usage.get(label) || 0) + Math.max(1, Number(line.quantity) || 1));
    }
  }
  const recurring = [...usage.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([description, count]) => `Padrão de consumo interno: ${description} apareceu ${count}x nos pedidos registrados.`);

  return [...products, ...recurring].slice(0, 44);
}

export function buildOperationalFormMass(app: AIFormApp, data: Data) {
  return app === 'zeus' ? zeusMass(data) : artemisMass(data);
}
