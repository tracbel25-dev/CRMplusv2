export type AppId = 'zeus' | 'artemis' | 'athena-pesquisa' | 'kronos' | 'athena-orcamentos';
export type Event = { id: string; at: string; text: string };
export type Customer = { id: string; name: string; phone: string; email: string; notes: string };
export type Asset = { id: string; customerId: string; identifier: string; model: string; year: string; meter: string };
export type Line = {
  id: string;
  kind: 'Serviço' | 'Peça' | 'Produto';
  description: string;
  brand: string;
  quantity: number;
  price: number;
  done?: boolean;
  productId?: string;
  note?: string;
  prepMinutes?: number;
};
export type Quote = {
  id: string;
  number: number;
  customerId: string;
  title: string;
  lines: Line[];
  discount: number;
  validUntil: string;
  notes: string;
  status: 'Rascunho' | 'Enviado' | 'Aprovado' | 'Reprovado' | 'Expirado';
  version: number;
  events: Event[];
  createdAt: string;
  decisionAt?: string;
  decisionNote?: string;
  versions?: { version: number; status: string; lines: Line[]; discount: number; validUntil: string; notes: string; at: string; decisionNote?: string }[];
};
export type Job = {
  id: string;
  number: number;
  customerId: string;
  assetId: string;
  type: string;
  stage: string;
  status: string;
  technician: string;
  due: string;
  complaint: string;
  diagnosis: string;
  notes: string;
  createdAt: string;
  events: Event[];
  quote: Quote;
  attachments: { id: string; name: string; data: string }[];
  tasks: { id: string; description: string; done: boolean }[];
};
export type Appointment = {
  id: string;
  customerId: string;
  assetId: string;
  at: string;
  type: string;
  technician: string;
  notes: string;
  status: 'Agendado' | 'Iniciado' | 'Cancelado';
  jobId?: string;
};
export type Product = {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  available: boolean;
  stockControlled: boolean;
  stock: number;
  minimum: number;
  allergens: string;
  preparation: number;
};
export type Order = {
  id: string;
  number: number;
  customerId: string;
  customerName: string;
  phone: string;
  address: string;
  channel: 'Mesa' | 'Balcão' | 'Delivery' | 'Retirada';
  tableId: string;
  tableSession?: string;
  lines: Line[];
  notes: string;
  status: string;
  delivery: string;
  fee: number;
  discount: number;
  createdAt: string;
  events: Event[];
  stockConsumed: boolean;
  reserved: boolean;
  cancelReason?: string;
};
export type Table = { id: string; name: string; seats: number; openedAt: string; closedAt: string };
export type Payment = { id: string; orderId: string; shiftId: string; amount: number; method: string; at: string; refunded: number };
export type Movement = { id: string; shiftId: string; kind: 'Suprimento' | 'Sangria' | 'Despesa' | 'Devolução'; amount: number; note: string; at: string; method?: string };
export type Shift = { id: string; openedAt: string; closedAt: string; initial: number; counted: number; note: string; operator: string };
export type StockMovement = { id: string; productId: string; amount: number; note: string; at: string };
export type QuestionType = 'NPS — recomendação' | 'Escala de 0 a 10' | 'Nota de 0 a 10' | 'Nota de 1 a 5' | 'Texto' | 'Escolha única';
export type Question = { id: string; title: string; type: QuestionType; options: string[]; required: boolean };
export type Survey = { id: string; title: string; description: string; status: 'Rascunho' | 'Ativa' | 'Encerrada'; questions: Question[]; createdAt: string };
export type Response = { id: string; surveyId: string; at: string; answers: Record<string, string>; contact: string };
export type Deal = {
  id: string;
  number: number;
  title: string;
  customerId: string;
  value: number;
  stage: string;
  source: string;
  nextAction: string;
  due: string;
  notes: string;
  lostReason: string;
  events: Event[];
  createdAt: string;
};
export type Task = { id: string; dealId: string; title: string; due: string; done: boolean };
export type Settings = {
  business: string;
  phone: string;
  email: string;
  address: string;
  operator: string;
  theme: 'light' | 'dark';
  collapsed: boolean;
  identifierLabel: string;
  assetLabel: string;
  meterLabel: string;
  budgetEnabled: boolean;
  scheduleEnabled: boolean;
  diagnosisEnabled: boolean;
  onlinePaused: boolean;
  deliveryFee: number;
  minimumOrder: number;
  deliveryAreas: string;
  hours: string;
  salesStages: string[];
};
export type Data = {
  version: 1;
  revision: number;
  settings: Settings;
  customers: Customer[];
  assets: Asset[];
  jobs: Job[];
  appointments: Appointment[];
  products: Product[];
  orders: Order[];
  tables: Table[];
  payments: Payment[];
  shifts: Shift[];
  movements: Movement[];
  stockMovements: StockMovement[];
  surveys: Survey[];
  responses: Response[];
  deals: Deal[];
  tasks: Task[];
  quotes: Quote[];
  customFieldValues: Record<string, Record<string, string>>;
};

export const initialData = (): Data => ({
  version: 1,
  revision: 0,
  settings: {
    business: '', phone: '', email: '', address: '', operator: '', theme: 'light', collapsed: false,
    identifierLabel: 'Placa', assetLabel: 'Veículo', meterLabel: 'Quilometragem', budgetEnabled: true,
    scheduleEnabled: true, diagnosisEnabled: true, onlinePaused: false, deliveryFee: 0, minimumOrder: 0,
    deliveryAreas: '', hours: '', salesStages: ['Novo contato', 'Contato realizado', 'Proposta', 'Negociação']
  },
  customers: [], assets: [], jobs: [], appointments: [], products: [], orders: [], tables: [], payments: [],
  shifts: [], movements: [], stockMovements: [], surveys: [], responses: [], deals: [], tasks: [], quotes: [],
  customFieldValues: {}
});

export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const event = (text: string): Event => ({ id: uid(), at: now(), text });
export const nextNumber = (records: { number: number }[]) => records.reduce((n, r) => Math.max(n, r.number), 0) + 1;
export const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);
export function cents(value: string | number): number {
  const n = Number(typeof value === 'string' ? value.replace(',', '.') : value);
  if (!Number.isFinite(n) || n < 0 || n > 100000000) throw new Error('Informe um valor válido e positivo.');
  return Math.round(n * 100);
}
export const date = (value: string, time = false) => value
  ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleString('pt-BR', time ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' })
  : 'Sem data';
export const localDay = (value = new Date()) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
export const normalize = (v: string) => v.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export const matches = (q: string, ...values: unknown[]) => normalize(values.join(' ')).includes(normalize(q));
export const activeJob = (j: Job) => !['Encerrado', 'Cancelado', 'Reprovado'].includes(j.status);
export const stages = (s: Settings) => ['Identificação', ...(s.diagnosisEnabled ? ['Diagnóstico'] : []), ...(s.budgetEnabled ? ['Orçamento'] : []), 'Execução', 'Conferência', 'Entrega'];
export const effectiveQuoteStatus = (q: Quote): Quote['status'] => q.status === 'Enviado' && q.validUntil && q.validUntil < localDay() ? 'Expirado' : q.status;
export const isNumericQuestion = (q: Question) => ['NPS — recomendação', 'Escala de 0 a 10', 'Nota de 0 a 10', 'Nota de 1 a 5'].includes(q.type);
export const isZeroToTenQuestion = (q: Question) => ['NPS — recomendação', 'Escala de 0 a 10', 'Nota de 0 a 10'].includes(q.type);
export const customValues = (d: Data, recordId: string) => d.customFieldValues?.[recordId] || {};
export function setCustomValues(d: Data, recordId: string, values: Record<string, string>) {
  d.customFieldValues ??= {};
  d.customFieldValues[recordId] = { ...(d.customFieldValues[recordId] || {}), ...values };
}

export function lineTotal(lines: Line[]) {
  return lines.reduce((sum, l) => {
    if (!l.description.trim() || !Number.isFinite(l.quantity) || l.quantity <= 0 || l.quantity > 100000 || !Number.isSafeInteger(l.price) || l.price < 0) throw new Error('Confira descrição, quantidade e preço dos itens.');
    return sum + Math.round(l.quantity * l.price);
  }, 0);
}
export function total(lines: Line[], discount = 0, fee = 0) {
  const subtotal = lineTotal(lines);
  if (!Number.isSafeInteger(discount) || discount < 0 || discount > subtotal || !Number.isSafeInteger(fee) || fee < 0) throw new Error('Desconto ou taxa inválidos.');
  return subtotal - discount + fee;
}
export const orderTotal = (o: Order) => total(o.lines, o.discount, o.fee);
export const paid = (d: Data, id: string) => d.payments.filter(p => p.orderId === id).reduce((s, p) => s + p.amount - p.refunded, 0);
export const balance = (d: Data, o: Order) => Math.max(0, orderTotal(o) - paid(d, o.id));
export const blankQuote = (number: number, customerId = ''): Quote => ({ id: uid(), number, customerId, title: '', lines: [], discount: 0, validUntil: '', notes: '', status: 'Rascunho', version: 1, events: [], createdAt: now() });

export function newJob(d: Data, input: Omit<Job, 'id' | 'number' | 'stage' | 'status' | 'createdAt' | 'events' | 'quote' | 'attachments' | 'tasks'>, appointmentId?: string) {
  const a = appointmentId ? d.appointments.find(x => x.id === appointmentId) : undefined;
  if (a?.jobId) return a.jobId;
  if (a && a.status !== 'Agendado') throw new Error('Este agendamento não está disponível.');
  const asset = d.assets.find(x => x.id === input.assetId && x.customerId === input.customerId);
  if (!asset || !d.customers.some(x => x.id === input.customerId)) throw new Error('Selecione o cliente e o veículo correspondente.');
  const number = nextNumber(d.jobs);
  const job: Job = { ...input, id: uid(), number, stage: 'Identificação', status: 'Em andamento', createdAt: now(), events: [event('Atendimento aberto')], quote: blankQuote(number, input.customerId), attachments: [], tasks: [] };
  d.jobs.push(job);
  if (a) { a.status = 'Iniciado'; a.jobId = job.id; }
  return job.id;
}

export function advanceJob(d: Data, id: string, expectedStage?: string) {
  const job = d.jobs.find(j => j.id === id);
  if (job && expectedStage && job.stage !== expectedStage) return;
  if (!job || !activeJob(job)) throw new Error('Atendimento não está ativo.');
  const flow = stages(d.settings);
  let index = flow.indexOf(job.stage);
  if (index < 0) index = flow.indexOf('Execução') - 1;
  if (job.stage === 'Diagnóstico' && !job.diagnosis.trim()) throw new Error('Registre o diagnóstico antes de avançar.');
  if (job.stage === 'Orçamento' && d.settings.budgetEnabled && effectiveQuoteStatus(job.quote) !== 'Aprovado') throw new Error(effectiveQuoteStatus(job.quote) === 'Expirado' ? 'O orçamento venceu. Abra uma nova versão antes de iniciar a execução.' : 'Registre a aprovação do orçamento antes de iniciar a execução.');
  if (job.stage === 'Execução' && job.tasks.some(l => !l.done)) throw new Error('Conclua os serviços antes da conferência.');
  if (index === flow.length - 1) { job.status = 'Encerrado'; job.events.push(event('Entrega registrada e atendimento encerrado')); return; }
  job.stage = flow[index + 1];
  if (job.stage === 'Execução') {
    for (const l of job.quote.lines.filter(l => l.kind === 'Serviço')) if (!job.tasks.some(t => t.id === l.id)) job.tasks.push({ id: l.id, description: l.description, done: false });
  }
  job.status = job.stage === 'Entrega' ? 'Pronto para retirada' : 'Em andamento';
  job.events.push(event(`Etapa: ${job.stage}`));
}

export function sendQuote(q: Quote) {
  if (q.status !== 'Rascunho') throw new Error('Crie uma nova versão para alterar este orçamento.');
  if (!q.lines.length) throw new Error('Adicione ao menos um item.');
  total(q.lines, q.discount);
  if (!q.validUntil || q.validUntil < localDay()) throw new Error('Defina uma validade a partir de hoje.');
  q.status = 'Enviado';
  q.events.push(event(`Versão ${q.version} marcada como enviada pelo operador`));
}
export function decideQuote(q: Quote, approved: boolean, note: string) {
  if (effectiveQuoteStatus(q) === 'Expirado') throw new Error('Orçamento vencido. Crie uma nova versão.');
  if (q.status !== 'Enviado') throw new Error('Somente orçamentos enviados podem receber uma decisão.');
  if (!note.trim()) throw new Error('Informe como a decisão do cliente foi recebida.');
  q.status = approved ? 'Aprovado' : 'Reprovado'; q.decisionAt = now(); q.decisionNote = note;
  q.events.push(event(`Versão ${q.version}: ${q.status.toLowerCase()}, decisão registrada pelo operador. ${note}`));
}
export function reviseQuote(q: Quote) {
  q.versions ??= [];
  q.versions.push({ version: q.version, status: effectiveQuoteStatus(q), lines: structuredClone(q.lines), discount: q.discount, validUntil: q.validUntil, notes: q.notes, at: now(), decisionNote: q.decisionNote });
  q.version++; q.status = 'Rascunho'; q.decisionAt = undefined; q.decisionNote = undefined;
  q.events.push(event(`Nova versão ${q.version} aberta; requer nova aprovação`));
}

export function reserved(d: Data, productId: string, except?: string) {
  return d.orders.filter(o => o.id !== except && o.reserved && !o.stockConsumed && o.status !== 'Cancelado').reduce((s, o) => s + o.lines.filter(l => l.productId === productId).reduce((a, l) => a + l.quantity, 0), 0);
}
export function advanceOrder(d: Data, id: string, expectedStatus?: string) {
  const o = d.orders.find(x => x.id === id);
  if (o && expectedStatus && o.status !== expectedStatus) return;
  if (!o) throw new Error('Pedido não encontrado.');
  const flow = ['Novo', 'Aceito', 'Em preparo', 'Pronto', 'Concluído'];
  const index = flow.indexOf(o.status);
  if (index < 0 || index === flow.length - 1) throw new Error('Pedido já finalizado.');
  if (index === 0) {
    for (const l of o.lines) {
      const p = d.products.find(p => p.id === l.productId);
      if (p?.stockControlled && p.stock - reserved(d, p.id, o.id) < l.quantity) throw new Error(`Estoque insuficiente: ${p.name}.`);
    }
    o.reserved = true;
  }
  if (index === 1 && !o.stockConsumed) {
    for (const l of o.lines) {
      const p = d.products.find(p => p.id === l.productId);
      if (p?.stockControlled) {
        if (p.stock < l.quantity) throw new Error(`Estoque insuficiente: ${p.name}.`);
        p.stock -= l.quantity;
        d.stockMovements.push({ id: uid(), productId: p.id, amount: -l.quantity, note: `Consumo do pedido ${o.number}`, at: now() });
      }
    }
    o.stockConsumed = true; o.reserved = false;
  }
  if (index === 2 && o.lines.some(l => !l.done)) throw new Error('Marque todos os itens como prontos.');
  if (index === 3 && o.channel === 'Delivery' && o.delivery !== 'Entregue') throw new Error('Confirme a entrega antes de concluir.');
  o.status = flow[index + 1];
  o.events.push(event(`Pedido ${o.status.toLowerCase()}`));
}
export function advanceDelivery(d: Data, id: string) {
  const order = d.orders.find(item => item.id === id);
  if (!order || order.channel !== 'Delivery' || order.status !== 'Pronto') throw new Error('Este delivery não está pronto para saída.');
  if (!order.delivery || order.delivery === 'Aguardando saída') {
    order.delivery = 'Saiu para entrega';
    order.events.push(event('Saiu para entrega'));
    return;
  }
  if (order.delivery === 'Saiu para entrega') {
    order.delivery = 'Entregue';
    order.events.push(event('Entrega confirmada ao cliente'));
    advanceOrder(d, id, 'Pronto');
    return;
  }
  if (order.delivery === 'Entregue') advanceOrder(d, id, 'Pronto');
}
export function cancelOrder(d: Data, id: string, reason: string) {
  const o = d.orders.find(o => o.id === id);
  if (!o || ['Cancelado', 'Concluído'].includes(o.status)) throw new Error('Pedido já finalizado.');
  if (!reason.trim()) throw new Error('Informe o motivo do cancelamento.');
  o.status = 'Cancelado'; o.cancelReason = reason; o.reserved = false;
  o.events.push(event(`Cancelado: ${reason}${o.stockConsumed ? ' • Insumos consumidos não foram devolvidos ao estoque.' : ''}${paid(d, id) > 0 ? ' • Devolução pendente.' : ''}`));
}
export function receivePayment(d: Data, orderId: string, amount: number, method: string) {
  const o = d.orders.find(o => o.id === orderId);
  const shift = d.shifts.find(s => !s.closedAt);
  if (!shift) throw new Error('Abra o caixa antes de registrar um recebimento.');
  if (!o || o.status === 'Cancelado') throw new Error('Pedido indisponível para recebimento.');
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > balance(d, o)) throw new Error('O recebimento deve ser maior que zero e não pode exceder o saldo.');
  d.payments.push({ id: uid(), orderId, shiftId: shift.id, amount, method, at: now(), refunded: 0 });
  o.events.push(event(`Recebimento confirmado manualmente: ${money(amount)} em ${method}`));
}
export function receiveTablePayment(d: Data, tableId: string, amount: number, method: string) {
  const table = d.tables.find(item => item.id === tableId && item.openedAt);
  if (!table) throw new Error('A comanda não está aberta.');
  const orders = tableOrders(d, table).filter(order => order.status !== 'Cancelado');
  const available = orders.reduce((sum, order) => sum + balance(d, order), 0);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > available) throw new Error('O valor recebido não pode exceder o saldo da comanda.');
  let remaining = amount;
  for (const order of orders) {
    if (remaining <= 0) break;
    const currentBalance = balance(d, order);
    if (!currentBalance) continue;
    const part = Math.min(remaining, currentBalance);
    receivePayment(d, order.id, part, method);
    remaining -= part;
  }
}
export function cashExpected(d: Data, shift: Shift) {
  return shift.initial + d.payments.filter(p => p.shiftId === shift.id && p.method === 'Dinheiro').reduce((s, p) => s + p.amount, 0) + d.movements.filter(m => m.shiftId === shift.id && (!m.method || m.method === 'Dinheiro')).reduce((s, m) => s + (m.kind === 'Suprimento' ? m.amount : -m.amount), 0);
}
export const tableOrders = (d: Data, t: Table) => t.openedAt ? d.orders.filter(o => o.tableId === t.id && (o.tableSession ? o.tableSession === t.openedAt : o.createdAt >= t.openedAt)) : [];
export const tableBalance = (d: Data, t: Table) => tableOrders(d, t).filter(o => o.status !== 'Cancelado').reduce((sum, order) => sum + balance(d, order), 0);
export function closeTable(d: Data, id: string) {
  const t = d.tables.find(t => t.id === id);
  if (!t || !t.openedAt) throw new Error('Mesa sem comanda aberta.');
  const orders = tableOrders(d, t);
  if (orders.some(o => o.status !== 'Cancelado' && (balance(d, o) > 0 || o.status !== 'Concluído'))) throw new Error('Conclua os pedidos e receba o saldo antes de liberar a mesa.');
  if (orders.some(o => o.status === 'Cancelado' && paid(d, o.id) > 0)) throw new Error('Registre a devolução pendente antes de liberar a mesa.');
  t.closedAt = now(); t.openedAt = '';
}

export function syncDealNextActivity(d: Data, dealId: string) {
  const deal = d.deals.find(item => item.id === dealId);
  if (!deal) return;
  const next = d.tasks.filter(item => item.dealId === dealId && !item.done).sort((a, b) => a.due.localeCompare(b.due))[0];
  deal.due = next?.due ? next.due.slice(0, 10) : '';
  deal.nextAction = next?.title || '';
}
