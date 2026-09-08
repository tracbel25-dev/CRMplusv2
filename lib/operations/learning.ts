import type { AppId, Data, Line } from './model';
import { normalize } from './model';

export type LineSuggestion = {
  description: string;
  kind: Line['kind'];
  brand: string;
  price: number;
  productId?: string;
  occurrences: number;
  customerOccurrences: number;
  lastUsedAt: string;
};

type HistoricalLine = { line: Line; customerId: string; at: string };

function historicalLines(data: Data, app: AppId): HistoricalLine[] {
  if (app === 'zeus') {
    return data.jobs.flatMap(job => {
      const current = job.quote.lines.map(line => ({ line, customerId: job.customerId, at: job.quote.createdAt || job.createdAt }));
      const versions = (job.quote.versions || []).flatMap(version => version.lines.map(line => ({ line, customerId: job.customerId, at: version.at })));
      return [...current, ...versions];
    });
  }
  if (app === 'athena-orcamentos') {
    return data.quotes.flatMap(quote => {
      const current = quote.lines.map(line => ({ line, customerId: quote.customerId, at: quote.createdAt }));
      const versions = (quote.versions || []).flatMap(version => version.lines.map(line => ({ line, customerId: quote.customerId, at: version.at })));
      return [...current, ...versions];
    });
  }
  if (app === 'artemis') {
    return data.orders.flatMap(order => order.lines.map(line => ({ line, customerId: order.customerId, at: order.createdAt })));
  }
  return [];
}

export function learnLineSuggestions(data: Data, app: AppId, customerId = '', query = '', limit = 8): LineSuggestion[] {
  const grouped = new Map<string, LineSuggestion>();
  for (const item of historicalLines(data, app)) {
    if (!item.line.description.trim()) continue;
    const key = `${normalize(item.line.description)}|${item.line.kind}|${normalize(item.line.brand || '')}`;
    const current = grouped.get(key);
    const customerHit = !!customerId && item.customerId === customerId;
    if (!current) {
      grouped.set(key, {
        description: item.line.description,
        kind: item.line.kind,
        brand: item.line.brand || '',
        price: item.line.price,
        productId: item.line.productId,
        occurrences: 1,
        customerOccurrences: customerHit ? 1 : 0,
        lastUsedAt: item.at
      });
      continue;
    }
    current.occurrences += 1;
    if (customerHit) current.customerOccurrences += 1;
    if (!current.lastUsedAt || item.at >= current.lastUsedAt) {
      current.description = item.line.description;
      current.kind = item.line.kind;
      current.brand = item.line.brand || '';
      current.price = item.line.price;
      current.productId = item.line.productId;
      current.lastUsedAt = item.at;
    }
  }

  const needle = normalize(query.trim());
  return [...grouped.values()]
    .filter(item => !needle || normalize(`${item.description} ${item.brand}`).includes(needle))
    .sort((a, b) => {
      if (b.customerOccurrences !== a.customerOccurrences) return b.customerOccurrences - a.customerOccurrences;
      if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
      return b.lastUsedAt.localeCompare(a.lastUsedAt);
    })
    .slice(0, limit);
}

export function learnProductSuggestions(data: Data, customerId = '', limit = 8) {
  const usage = new Map<string, { productId: string; occurrences: number; customerOccurrences: number; lastUsedAt: string }>();
  for (const order of data.orders) {
    for (const line of order.lines) {
      if (!line.productId) continue;
      const current = usage.get(line.productId) || { productId: line.productId, occurrences: 0, customerOccurrences: 0, lastUsedAt: '' };
      current.occurrences += 1;
      if (customerId && order.customerId === customerId) current.customerOccurrences += 1;
      if (order.createdAt > current.lastUsedAt) current.lastUsedAt = order.createdAt;
      usage.set(line.productId, current);
    }
  }
  return [...usage.values()]
    .map(item => ({ ...item, product: data.products.find(product => product.id === item.productId) }))
    .filter(item => item.product?.available)
    .sort((a, b) => b.customerOccurrences - a.customerOccurrences || b.occurrences - a.occurrences || b.lastUsedAt.localeCompare(a.lastUsedAt))
    .slice(0, limit);
}
