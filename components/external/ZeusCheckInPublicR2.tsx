'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ClipboardCheck, RotateCcw, ShieldCheck, UserRound, Wrench } from 'lucide-react';
import { ZEUS_CHECKLIST_TEMPLATES, type ZeusChecklistSegment } from '@/lib/operations/checklistTemplates';
import {
  ZEUS_CHECKLIST_VIEWS,
  ZEUS_CHECKLIST_VIEW_LABELS,
  inferZeusChecklistAssetFolder,
  isZeusChecklistAssetFolder,
  normalizeZeusChecklistView,
  type ZeusChecklistAssetFolder,
  type ZeusChecklistView,
} from '@/lib/operations/checklistAssets';
import { ZEUS_CHECKLIST_FOLDER_LABELS } from '@/lib/operations/zeusChecklist';

type LinkData = { kind: string; recordId?: string; title: string; payload: Record<string, any>; status: string };
type Answer = { status: string; note: string };
type DamageType = 'Amassado' | 'Riscado' | 'Quebrado' | 'Faltante';
type Damage = { view: string; point: string; type: DamageType };

const damageColors: Record<DamageType, string> = { Amassado: '#dc2626', Riscado: '#2563eb', Quebrado: '#f97316', Faltante: '#7c3aed' };

async function checklistRequest<T>(token: string, response?: Record<string, unknown>) {
  const request = await fetch(`/api/zeus/checklist/public/${encodeURIComponent(token)}`, {
    method: response ? 'POST' : 'GET',
    headers: response ? { 'content-type': 'application/json' } : undefined,
    body: response ? JSON.stringify(response) : undefined,
    cache: 'no-store',
  });
  const payload = await request.json().catch(() => ({}));
  if (!request.ok) {
    const error = new Error(payload.error || 'Checklist indisponível.') as Error & { completed?: boolean };
    error.completed = !!payload.completed;
    throw error;
  }
  return payload as T;
}

function SignaturePad({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const box = canvas.getBoundingClientRect();
    canvas.width = Math.floor(box.width * ratio);
    canvas.height = Math.floor(112 * ratio);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineWidth = 2;
    context.lineCap = 'round';
    context.strokeStyle = '#102a4f';
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const current = point(event);
    const context = event.currentTarget.getContext('2d');
    context?.beginPath(); context?.moveTo(current.x, current.y);
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const current = point(event);
    const context = event.currentTarget.getContext('2d');
    context?.lineTo(current.x, current.y); context?.stroke();
  };
  const end = () => {
    drawing.current = false;
    const canvas = ref.current;
    if (canvas) onChange(canvas.toDataURL('image/png', .75));
  };
  const clear = () => {
    const canvas = ref.current; const context = canvas?.getContext('2d');
    if (canvas && context) { context.clearRect(0, 0, canvas.width, canvas.height); onChange(''); }
  };

  return <div className="signature-box"><div className="signature-head"><strong>{label}</strong><button type="button" onClick={clear}><RotateCcw size={13} />Limpar</button></div><canvas ref={ref} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} /><small>{value ? 'Assinatura registrada.' : 'Assine dentro da área acima.'}</small></div>;
}

function R2DamageBoard({ folder, value, onChange }: { folder: ZeusChecklistAssetFolder; value: Damage[]; onChange: (next: Damage[]) => void }) {
  const [type, setType] = useState<DamageType>('Amassado');
  const add = (view: ZeusChecklistView, event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('.damage-dot')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
    onChange([...value, { view, point: `${x.toFixed(2)},${y.toFixed(2)}`, type }]);
  };
  return <section className="form-card damages r2-damages">
    <div className="damage-head"><div className="section-title"><Wrench size={19} /><div><h2>Avarias identificadas</h2><p>Escolha o tipo e toque diretamente na imagem.</p></div></div><div className="damage-legend">{(Object.keys(damageColors) as DamageType[]).map(item => <button type="button" key={item} className={item === type ? 'selected' : ''} onClick={() => setType(item)}><i style={{ background: damageColors[item] }} />{item}</button>)}</div></div>
    <div className="r2-views-grid">{ZEUS_CHECKLIST_VIEWS.map(view => {
      const points = value.filter(item => normalizeZeusChecklistView(item.view) === view);
      return <article className={`r2-view r2-view-${view}`} key={view}><div className="r2-image-stage" onPointerDown={event => add(view, event)}><img src={`/api/checklist-asset?folder=${encodeURIComponent(folder)}&view=${encodeURIComponent(view)}`} alt={`${ZEUS_CHECKLIST_VIEW_LABELS[view]} de ${ZEUS_CHECKLIST_FOLDER_LABELS[folder].toLowerCase()}`} draggable={false} />{points.map((item, index) => { const [x, y] = item.point.split(','); return <button type="button" className="damage-dot" aria-label={`Remover ${item.type}`} key={`${item.view}-${item.point}-${index}`} onPointerDown={event => { event.stopPropagation(); onChange(value.filter(current => current !== item)); }} style={{ left: `${x}%`, top: `${y}%`, background: damageColors[item.type] }}>{index + 1}</button>; })}</div><strong>{ZEUS_CHECKLIST_VIEW_LABELS[view]}</strong></article>;
    })}</div><p className="damage-hint">As marcações ficam presas à mesma posição da imagem mesmo quando a tela muda de tamanho.</p>
  </section>;
}

export function ZeusCheckInPublicR2({ token }: { token: string }) {
  const [link, setLink] = useState<LinkData | null>(null);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(false);
  const [sent, setSent] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [meter, setMeter] = useState('');
  const [customerSignature, setCustomerSignature] = useState('');
  const [staffSignature, setStaffSignature] = useState('');
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [damage, setDamage] = useState<Damage[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void checklistRequest<{ link: LinkData; completed?: boolean }>(token)
      .then(result => {
        if (result.link?.kind !== 'zeus-checkin') throw new Error('Este link não é um checklist de entrada.');
        setLink(result.link);
        setCompleted(!!result.completed || result.link.status === 'completed');
        setName(String(result.link.payload?.customer || ''));
        setPhone(String(result.link.payload?.customerPhone || ''));
        setMeter(String(result.link.payload?.assetInfo?.meter || ''));
        if (Array.isArray(result.link.payload?.damage)) setDamage(result.link.payload.damage);
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : 'Link indisponível.'));
  }, [token]);

  const segment = (link?.payload?.segment && ZEUS_CHECKLIST_TEMPLATES[link.payload.segment as ZeusChecklistSegment] ? link.payload.segment : 'auto') as ZeusChecklistSegment;
  const template = ZEUS_CHECKLIST_TEMPLATES[segment];
  const items = useMemo(() => ((link?.payload?.items || template.items) as string[]), [link, template.items]);
  const assetInfo = (link?.payload?.assetInfo || {}) as Record<string, unknown>;
  const requestedFolder = String(link?.payload?.checklistAssetFolder || assetInfo.checklistAssetFolder || '');
  const assetFolder = isZeusChecklistAssetFolder(requestedFolder) ? requestedFolder : inferZeusChecklistAssetFolder(String(link?.payload?.assetLabel || ''), assetInfo);
  const assetTypeLabel = ZEUS_CHECKLIST_FOLDER_LABELS[assetFolder];
  const assetModel = String(assetInfo.model || link?.payload?.asset || template.label || '').trim();
  const meterLabel = String(link?.payload?.meterLabel || (/maquina_|trator_agricola|empilhadeira/.test(assetFolder) ? 'Horímetro' : 'Quilometragem'));

  if (error && !link) return <main className="check-page"><section className="check-state"><h1>Este checklist não está disponível</h1><p>{error}</p></section></main>;
  if (!link) return <main className="check-page"><section className="check-state"><p>Abrindo checklist…</p></section></main>;
  if (completed && !sent) return <main className="check-page"><section className="check-state success"><CheckCircle2 size={46} /><h1>Checklist já concluído</h1><p>Esta inspeção já foi registrada na OS e não pode ser preenchida novamente.</p></section></main>;
  if (sent) return <main className="check-page"><section className="check-state success"><CheckCircle2 size={46} /><h1>Checklist enviado</h1><p>O registro foi salvo no Zeus, vinculado à OS e a medição do veículo/equipamento foi atualizada.</p></section></main>;

  const submit = async () => {
    const missing = items.find(item => !answers[item]?.status);
    if (missing) { setError(`Responda o item: ${missing}`); return; }
    if (link.payload.requireSignature && !customerSignature) { setError('A assinatura do cliente/responsável é obrigatória.'); return; }
    setBusy(true); setError('');
    try {
      await checklistRequest(token, {
        segment,
        checklistAssetFolder: assetFolder,
        name: name.trim(),
        meter: meter.trim(),
        notes: notes.trim(),
        customerSignature,
        staffSignature,
        damage,
        answers: items.map(item => ({ item, status: answers[item].status, note: answers[item].note || '' })),
      });
      setSent(true);
    } catch (reason) {
      const current = reason as Error & { completed?: boolean };
      if (current.completed) setCompleted(true); else setError(current.message || 'Não foi possível enviar o checklist.');
    } finally { setBusy(false); }
  };

  return <main className="check-page"><div className="check-wrap">
    <header className="check-top"><div><span className="brand">ZEUS <b>OFICINA</b></span><span className="divider" /><span>CRM PLUS</span></div><div className="secure"><ShieldCheck size={17} /> Checklist externo seguro</div></header>
    <section className="check-heading"><div><p className="eyebrow">Checklist de entrada</p><h1>{assetTypeLabel} · OS {String(link.payload.jobNumber || '').padStart(4, '0')}</h1><p>Inspeção visual e registro das condições no recebimento.</p></div><span className="status-pill">Em preenchimento</span></section>
    <section className="hero-data"><div><UserRound size={18} /><span>Cliente<strong>{String(link.payload.customer || 'Não informado')}</strong></span></div><div><ClipboardCheck size={18} /><span>{String(link.payload.identifierLabel || 'Identificação')}<strong>{String(assetInfo.identifier || link.payload.asset || 'Não informado')}</strong></span></div><div><Wrench size={18} /><span>{assetTypeLabel}<strong>{assetModel || 'Não informado'}</strong></span></div></section>

    <div className="top-grid">
      <section className="form-card"><div className="section-title"><ClipboardCheck size={18} /><div><h2>Dados — {assetTypeLabel}</h2><p>Dados já cadastrados no Zeus; atualize somente a medição de entrada.</p></div></div><div className="fields"><label><span>Modelo</span><input readOnly value={String(assetInfo.model || '')} placeholder="Não informado" /></label><label><span>{String(link.payload.identifierLabel || 'Identificação')}</span><input readOnly value={String(assetInfo.identifier || '')} placeholder="Não informado" /></label><label><span>Ano</span><input readOnly value={String(assetInfo.year || '')} placeholder="Não informado" /></label><label><span>{meterLabel}</span><input value={meter} onChange={event => setMeter(event.target.value)} placeholder="Informar" /></label></div></section>
      <section className="form-card zeus-auto-client-data"><div className="section-title"><UserRound size={18} /><div><h2>Dados do cliente</h2><p>Puxados automaticamente da OS.</p></div></div><div className="fields"><label className="wide"><span>Cliente</span><input readOnly value={name} placeholder="Não informado" /></label><label><span>Telefone</span><input readOnly value={phone} placeholder="Não informado" /></label></div></section>
    </div>

    <section className="form-card inspection"><div className="section-title"><ClipboardCheck size={18} /><div><h2>Itens inspecionados</h2><p>Registre o status de cada item.</p></div></div><div className="inspection-grid">{items.map((item, index) => { const current = answers[item] || { status: '', note: '' }; return <div className="inspection-row" key={item}><div className="item-name"><b>{String(index + 1).padStart(2, '0')}</b><span>{item}</span></div><div className="row-status">{['OK','Atenção','Não se aplica'].map(status => <button type="button" key={status} className={`${current.status === status ? 'active ' : ''}${status === 'OK' ? 'ok' : status === 'Atenção' ? 'attention' : 'na'}`} onClick={() => setAnswers({ ...answers, [item]: { ...current, status } })}>{status === 'Não se aplica' ? 'N/A' : status}</button>)}</div><input value={current.note} onChange={event => setAnswers({ ...answers, [item]: { ...current, note: event.target.value } })} placeholder="Observação opcional" /></div>; })}</div></section>

    <R2DamageBoard folder={assetFolder} value={damage} onChange={setDamage} />
    <div className="bottom-grid"><section className="form-card notes"><div className="section-title"><ClipboardCheck size={18} /><div><h2>Observações gerais</h2><p>Registre ressalvas, objetos, condições ou informações adicionais.</p></div></div><textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Descreva outras informações relevantes..." /></section><section className="form-card signatures"><SignaturePad label="Assinatura do cliente / responsável" value={customerSignature} onChange={setCustomerSignature} /><SignaturePad label="Assinatura do responsável da oficina" value={staffSignature} onChange={setStaffSignature} /></section></div>
    {error && <div className="check-error">{error}</div>}
    <footer className="check-actions"><span>Ao finalizar, a inspeção fica registrada uma única vez na OS.</span><button disabled={busy} onClick={() => { void submit(); }}>{busy ? 'Enviando…' : 'Finalizar checklist'} <CheckCircle2 size={18} /></button></footer>
  </div></main>;
}
