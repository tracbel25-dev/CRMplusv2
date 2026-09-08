'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Minus, Plus } from 'lucide-react';
import { createStoreClient } from '@/lib/supabase/storeClient';

const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((value || 0) / 100);

type LinkData = { appId: string; kind: string; recordId?: string; title: string; payload: Record<string, any>; status: string };

async function invoke(token: string, action: 'read' | 'respond', response?: Record<string, unknown>) {
  const { data, error } = await createStoreClient().functions.invoke('external-link', { body: { token, action, response } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export function ExternalPublic({ token }: { token: string }) {
  const [link, setLink] = useState<LinkData | null>(null);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  useEffect(() => { void invoke(token, 'read').then(result => setLink(result.link)).catch(reason => setError(reason instanceof Error ? reason.message : 'Link indisponível.')); }, [token]);

  if (error) return <main className="external-shell"><section className="external-card external-state"><h1>Este link não está disponível</h1><p>{error}</p></section></main>;
  if (!link) return <main className="external-shell"><section className="external-card external-state"><p>Abrindo…</p></section></main>;
  if (sent) return <main className="external-shell"><section className="external-card external-state"><CheckCircle2 size={42} /><h1>Resposta enviada</h1><p>Você já pode fechar esta página.</p></section></main>;

  const common = { token, link, done: () => setSent(true), fail: (message: string) => setError(message) };
  return <main className={`external-shell external-${link.appId}`}>
    {link.kind === 'artemis-menu' ? <MenuPublic {...common} />
      : link.kind === 'athena-survey' ? <SurveyPublic {...common} />
        : link.kind === 'kronos-response' ? <KronosPublic {...common} />
          : <QuotePublic {...common} />}
  </main>;
}

type PublicProps = { token: string; link: LinkData; done: () => void; fail: (message: string) => void };

function QuotePublic({ token, link, done, fail }: PublicProps) {
  const quote = link.payload.quote || {};
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (decision: 'approved' | 'rejected') => {
    setBusy(true); try { await invoke(token, 'respond', { decision, name, note }); done(); } catch (e) { fail(e instanceof Error ? e.message : 'Não foi possível enviar a resposta.'); } finally { setBusy(false); }
  };
  const total = (quote.lines || []).reduce((sum: number, line: any) => sum + Math.round((line.quantity || 0) * (line.price || 0)), 0) - (quote.discount || 0);
  return <section className="external-card">
    <header><span className="external-brand">{link.payload.business || 'CRM PLUS'}</span><h1>{link.title}</h1><p>{link.payload.customer || ''}</p></header>
    {link.payload.asset && <div className="external-highlight"><span>Referência</span><strong>{link.payload.asset}</strong></div>}
    <div className="external-lines">{(quote.lines || []).map((line: any) => <div key={line.id}><span><strong>{line.description}</strong><small>{line.quantity} × {money(line.price)}{line.brand ? ` · ${line.brand}` : ''}</small></span><b>{money(Math.round(line.quantity * line.price))}</b></div>)}</div>
    {quote.discount > 0 && <div className="external-summary"><span>Desconto</span><strong>- {money(quote.discount)}</strong></div>}
    <div className="external-total"><span>Total</span><strong>{money(total)}</strong></div>
    {quote.validUntil && <p className="external-muted">Validade: {new Date(`${quote.validUntil}T12:00:00`).toLocaleDateString('pt-BR')}</p>}
    {quote.notes && <p className="external-note">{quote.notes}</p>}
    <label><span>Seu nome</span><input value={name} onChange={e => setName(e.target.value)} placeholder="Quem está respondendo" /></label>
    <label><span>Observação</span><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Opcional" /></label>
    <div className="external-actions"><button disabled={busy} onClick={() => void submit('approved')}>Aprovar</button><button className="secondary" disabled={busy} onClick={() => void submit('rejected')}>Reprovar</button></div>
  </section>;
}

function MenuPublic({ token, link, done, fail }: PublicProps) {
  const products = link.payload.products || [];
  const [cart, setCart] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [customer, setCustomer] = useState(''); const [phone, setPhone] = useState(''); const [address, setAddress] = useState(''); const [general, setGeneral] = useState(''); const [channel, setChannel] = useState<'Delivery' | 'Retirada'>('Delivery');
  const [busy, setBusy] = useState(false);
  const items = products.filter((p: any) => cart[p.id]);
  const subtotal = items.reduce((sum: number, p: any) => sum + p.price * cart[p.id], 0);
  const total = subtotal + (channel === 'Delivery' ? Number(link.payload.deliveryFee || 0) : 0);
  const change = (id: string, delta: number) => setCart(current => ({ ...current, [id]: Math.max(0, (current[id] || 0) + delta) }));
  const submit = async () => {
    if (!items.length) { fail('Adicione ao menos um item.'); return; }
    if (!customer.trim() || !phone.trim()) { fail('Informe nome e telefone.'); return; }
    if (channel === 'Delivery' && !address.trim()) { fail('Informe o endereço de entrega.'); return; }
    if (channel === 'Delivery' && subtotal < Number(link.payload.minimumOrder || 0)) { fail(`Pedido mínimo: ${money(Number(link.payload.minimumOrder || 0))}.`); return; }
    setBusy(true); try {
      await invoke(token, 'respond', { customer, phone, address, notes: general, channel, items: items.map((p: any) => ({ productId: p.id, quantity: cart[p.id], note: notes[p.id] || '' })) }); done();
    } catch (e) { fail(e instanceof Error ? e.message : 'Não foi possível enviar o pedido.'); } finally { setBusy(false); }
  };
  return <section className="external-card external-menu">
    <header><span className="external-brand">{link.payload.business || 'Cardápio'}</span><h1>{link.title}</h1>{link.payload.hours && <p>{link.payload.hours}</p>}</header>
    <div className="external-channel"><button className={channel === 'Delivery' ? 'active' : ''} onClick={() => setChannel('Delivery')}>Delivery</button><button className={channel === 'Retirada' ? 'active' : ''} onClick={() => setChannel('Retirada')}>Retirada</button></div>
    <div className="external-products">{products.map((p: any) => <article key={p.id}><div><small>{p.category}</small><h2>{p.name}</h2>{p.description && <p>{p.description}</p>}{p.allergens && <small>{p.allergens}</small>}</div><strong>{money(p.price)}</strong><div className="external-qty"><button aria-label={`Diminuir ${p.name}`} onClick={() => change(p.id, -1)}><Minus size={15} /></button><span>{cart[p.id] || 0}</span><button aria-label={`Adicionar ${p.name}`} onClick={() => change(p.id, 1)}><Plus size={15} /></button></div>{cart[p.id] > 0 && <input placeholder="Observação deste item" value={notes[p.id] || ''} onChange={e => setNotes({ ...notes, [p.id]: e.target.value })} />}</article>)}</div>
    <section className="external-checkout"><h2>Seu pedido</h2>{items.map((p: any) => <div key={p.id}><span>{cart[p.id]}× {p.name}</span><strong>{money(cart[p.id] * p.price)}</strong></div>)}{channel === 'Delivery' && Number(link.payload.deliveryFee || 0) > 0 && <div><span>Entrega</span><strong>{money(Number(link.payload.deliveryFee))}</strong></div>}<div className="external-total"><span>Total</span><strong>{money(total)}</strong></div>
      <label><span>Nome</span><input value={customer} onChange={e => setCustomer(e.target.value)} /></label><label><span>Telefone</span><input value={phone} onChange={e => setPhone(e.target.value)} /></label>{channel === 'Delivery' && <label><span>Endereço</span><input value={address} onChange={e => setAddress(e.target.value)} /></label>}<label><span>Observações gerais</span><textarea value={general} onChange={e => setGeneral(e.target.value)} /></label><button disabled={busy} onClick={() => void submit()}>Enviar pedido</button>
    </section>
  </section>;
}

function SurveyPublic({ token, link, done, fail }: PublicProps) {
  const survey = link.payload.survey || {};
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [respondent, setRespondent] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    for (const q of survey.questions || []) if (q.required && !answers[q.id]) { fail(`Responda: ${q.title}`); return; }
    setBusy(true); try { await invoke(token, 'respond', { respondent, answers: Object.entries(answers).map(([questionId, value]) => ({ questionId, value })) }); done(); } catch (e) { fail(e instanceof Error ? e.message : 'Não foi possível enviar a pesquisa.'); } finally { setBusy(false); }
  };
  return <section className="external-card"><header><span className="external-brand">{link.payload.business || 'Pesquisa'}</span><h1>{survey.title || link.title}</h1>{survey.description && <p>{survey.description}</p>}</header>
    {(survey.questions || []).map((q: any, index: number) => <fieldset key={q.id}><legend><span>{String(index + 1).padStart(2, '0')}</span>{q.title}{q.required ? ' *' : ''}</legend>{['NPS — recomendação', 'Escala de 0 a 10', 'Nota de 0 a 10'].includes(q.type) ? <div className="external-scale">{Array.from({ length: 11 }, (_, n) => String(n)).map(n => <button type="button" className={answers[q.id] === n ? 'active' : ''} key={n} onClick={() => setAnswers({ ...answers, [q.id]: n })}>{n}</button>)}</div> : q.type === 'Nota de 1 a 5' ? <div className="external-scale">{['1','2','3','4','5'].map(n => <button type="button" className={answers[q.id] === n ? 'active' : ''} key={n} onClick={() => setAnswers({ ...answers, [q.id]: n })}>{n}</button>)}</div> : q.type === 'Escolha única' ? <div className="external-options">{q.options.map((option: string) => <label key={option}><input type="radio" name={q.id} checked={answers[q.id] === option} onChange={() => setAnswers({ ...answers, [q.id]: option })} />{option}</label>)}</div> : <textarea value={answers[q.id] || ''} onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })} />}</fieldset>)}
    <label><span>Nome ou contato (opcional)</span><input value={respondent} onChange={e => setRespondent(e.target.value)} /></label><button disabled={busy} onClick={() => void submit()}>Enviar avaliação</button>
  </section>;
}

function KronosPublic({ token, link, done, fail }: PublicProps) {
  const [intent, setIntent] = useState('advance'); const [name, setName] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async () => { setBusy(true); try { await invoke(token, 'respond', { intent, name, note }); done(); } catch (e) { fail(e instanceof Error ? e.message : 'Não foi possível enviar a resposta.'); } finally { setBusy(false); } };
  return <section className="external-card"><header><span className="external-brand">{link.payload.business || 'Contato comercial'}</span><h1>{link.title}</h1><p>{link.payload.customer || ''}</p></header>{link.payload.value > 0 && <div className="external-highlight"><span>Valor de referência</span><strong>{money(Number(link.payload.value))}</strong></div>}{link.payload.nextAction && <p className="external-note">Próximo passo sugerido: {link.payload.nextAction}</p>}
    <div className="external-choice"><button className={intent === 'advance' ? 'active' : ''} onClick={() => setIntent('advance')}>Quero avançar</button><button className={intent === 'later' ? 'active' : ''} onClick={() => setIntent('later')}>Falar depois</button><button className={intent === 'not-interested' ? 'active' : ''} onClick={() => setIntent('not-interested')}>Não tenho interesse</button></div>
    <label><span>Seu nome</span><input value={name} onChange={e => setName(e.target.value)} /></label><label><span>Mensagem</span><textarea value={note} onChange={e => setNote(e.target.value)} /></label><button disabled={busy} onClick={() => void submit()}>Enviar resposta</button>
  </section>;
}
