'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Plus } from 'lucide-react';
import type { Workspace } from '@/lib/operations/storage';
import { blankQuote, date, effectiveQuoteStatus, matches, nextNumber, total } from '@/lib/operations/model';
import { budgetLabel, budgetValue, defaultQuoteValidity, findZeusBudget, readZeusPreferences, zeusBudgets } from '@/lib/operations/zeus';
import { Badge, Button, Empty, Modal, Section, Title } from './ui';
import { ZeusFilterBar, type FilterDefinition } from './ZeusFilterBar';
import { ZeusQuotePanel } from './ZeusQuotePanel';

export function ZeusBudgets({ w, recordId = '' }: { w: Workspace; recordId?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<Record<string, string[]>>({});
  const [sort, setSort] = useState('createdAt');
  const [descending, setDescending] = useState(true);
  const [create, setCreate] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const prefs = readZeusPreferences(w.data);
  const selected = recordId ? findZeusBudget(w.data, recordId) : undefined;

  if (recordId && !selected) return <><Button variant="text" onClick={() => router.push('/zeus/orcamentos')}><ArrowLeft size={16} />Voltar aos orçamentos</Button><Empty>Orçamento não encontrado.</Empty></>;

  if (selected) {
    const customer = w.data.customers.find(item => item.id === selected.quote.customerId);
    return <>
      <Button variant="text" onClick={() => router.push('/zeus/orcamentos')}><ArrowLeft size={16} />Voltar aos orçamentos</Button>
      <Title eyebrow={selected.origin === 'OS' ? 'Orçamento vinculado à ordem de serviço' : 'Venda de balcão'} title={budgetLabel(selected)} action={selected.job ? <Button variant="secondary" onClick={() => router.push(`/zeus/atendimentos/${selected.job!.id}`)}>Ver OS <ArrowRight size={16} /></Button> : undefined}>{customer?.name || 'Cliente não encontrado'}</Title>
      <Section title="Condições e itens"><ZeusQuotePanel w={w} quote={selected.quote} job={selected.job} /></Section>
    </>;
  }

  const all = zeusBudgets(w.data);
  const definitions = useMemo<FilterDefinition[]>(() => {
    const values = {
      Origem: ['OS', 'Balcão'],
      Status: Array.from(new Set(all.map(item => effectiveQuoteStatus(item.quote)))),
      Cliente: Array.from(new Set(all.map(item => w.data.customers.find(customer => customer.id === item.quote.customerId)?.name || 'Cliente não encontrado'))).sort(),
      Validade: ['Válido', 'Vencido', 'Sem validade']
    };
    return prefs.quoteFilters.map(label => ({ key: label, label, options: values[label as keyof typeof values] || [] })).filter(item => item.options.length);
  }, [all, prefs.quoteFilters, w.data.customers]);

  const filtered = all.filter(item => {
    const customer = w.data.customers.find(current => current.id === item.quote.customerId)?.name || 'Cliente não encontrado';
    if (!matches(query, item.quote.number, customer, item.origin, item.quote.lines.map(line => line.description).join(' '))) return false;
    const validity = !item.quote.validUntil ? 'Sem validade' : item.quote.validUntil < new Date().toISOString().slice(0, 10) ? 'Vencido' : 'Válido';
    const checks: Record<string, string> = { Origem: item.origin, Status: effectiveQuoteStatus(item.quote), Cliente: customer, Validade: validity };
    return Object.entries(active).every(([key, values]) => !values.length || values.includes(checks[key]));
  }).sort((a, b) => {
    const value = (item: typeof a) => sort === 'number' ? item.quote.number : sort === 'value' ? budgetValue(item) : sort === 'validUntil' ? item.quote.validUntil : item.quote.createdAt;
    const av = value(a); const bv = value(b);
    const result = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
    return descending ? -result : result;
  });

  const createCounter = async () => {
    if (!customerId) { w.setError('Selecione o cliente.'); return; }
    let id = '';
    const ok = await w.mutate(data => {
      const quote = blankQuote(nextNumber(data.quotes), customerId);
      quote.title = '';
      quote.validUntil = defaultQuoteValidity(data);
      data.quotes.push(quote);
      id = quote.id;
    }, 'Orçamento de balcão criado.');
    if (ok) { setCreate(false); setCustomerId(''); router.push(`/zeus/orcamentos/${id}`); }
  };

  return <>
    <Title eyebrow="Comercial da oficina" title="Orçamentos" action={<Button onClick={() => setCreate(true)}><Plus size={17} />Novo orçamento balcão</Button>}>Orçamentos de OS e vendas de balcão aparecem juntos para operação, mas continuam identificados separadamente para análise.</Title>
    <ZeusFilterBar query={query} onQuery={setQuery} definitions={definitions} active={active} onActive={setActive} sort={sort} sortOptions={[{ value: 'createdAt', label: 'Data de criação' }, { value: 'number', label: 'Número' }, { value: 'value', label: 'Valor' }, { value: 'validUntil', label: 'Validade' }]} descending={descending} onSort={setSort} onDescending={setDescending} placeholder="Buscar cliente, item ou número" />
    <div className="zeus-budget-list">{filtered.map(item => {
      const customer = w.data.customers.find(current => current.id === item.quote.customerId);
      return <button key={item.quote.id} className="zeus-budget-row" onClick={() => router.push(`/zeus/orcamentos/${item.quote.id}`)}>
        <div><span className="op-kicker">{item.origin}</span><strong>{budgetLabel(item)}</strong><small>{customer?.name || 'Cliente não encontrado'} · {date(item.quote.createdAt)}</small></div>
        <div><span>Total</span><strong>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(budgetValue(item) / 100)}</strong></div>
        <Badge tone={effectiveQuoteStatus(item.quote) === 'Expirado' ? 'warning' : ''}>{effectiveQuoteStatus(item.quote)}</Badge><ArrowRight size={18} />
      </button>;
    })}</div>
    {!filtered.length && <Empty>{query || Object.values(active).some(values => values.length) ? 'Nenhum orçamento corresponde aos filtros.' : 'Os orçamentos da oficina aparecerão aqui.'}</Empty>}

    {create && <Modal title="Novo orçamento de balcão" onClose={() => setCreate(false)}><p>Venda sem ordem de serviço. O orçamento terá numeração própria de balcão e continuará separado dos resultados de OS.</p><label className="op-field"><span>Cliente</span><select value={customerId} onChange={event => setCustomerId(event.target.value)}><option value="">Selecionar</option>{w.data.customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label><div className="op-form-footer"><Button variant="secondary" onClick={() => setCreate(false)}>Cancelar</Button><Button onClick={() => { void createCounter(); }}>Criar orçamento</Button></div></Modal>}
  </>;
}
