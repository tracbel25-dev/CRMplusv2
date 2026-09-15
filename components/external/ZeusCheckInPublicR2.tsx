'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ClipboardCheck, RotateCcw, ShieldCheck, UserRound, Wrench } from 'lucide-react';
import { createStoreClient } from '@/lib/supabase/storeClient';
import { ZEUS_CHECKLIST_TEMPLATES, type ZeusChecklistSegment } from '@/lib/operations/checklistTemplates';
import {
  ZEUS_CHECKLIST_VIEWS,
  ZEUS_CHECKLIST_VIEW_LABELS,
  inferZeusChecklistAssetFolder,
  normalizeZeusChecklistView,
  type ZeusChecklistAssetFolder,
  type ZeusChecklistView,
} from '@/lib/operations/checklistAssets';

type LinkData = { appId: string; kind: string; recordId?: string; title: string; payload: Record<string, any>; status: string };
type Answer = { status: string; note: string };
type DamageType = 'Amassado' | 'Riscado' | 'Quebrado' | 'Faltante';
type Damage = { view: string; point: string; type: DamageType };

const damageColors: Record<DamageType, string> = {
  Amassado: '#dc2626',
  Riscado: '#2563eb',
  Quebrado: '#f97316',
  Faltante: '#7c3aed',
};

async function invoke(token: string, action: 'read' | 'respond', response?: Record<string, unknown>) {
  const { data, error } = await createStoreClient().functions.invoke('external-link', { body: { token, action, response } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
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
    const context = event.currentTarget.getContext('2d');
    const current = point(event);
    context?.beginPath();
    context?.moveTo(current.x, current.y);
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = event.currentTarget.getContext('2d');
    const current = point(event);
    context?.lineTo(current.x, current.y);
    context?.stroke();
  };

  const end = () => {
    drawing.current = false;
    const canvas = ref.current;
    if (canvas) onChange(canvas.toDataURL('image/png', 0.75));
  };

  const clear = () => {
    const canvas = ref.current;
    const context = canvas?.getContext('2d');
    if (canvas && context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      onChange('');
    }
  };

  return (
    <div className="signature-box">
      <div className="signature-head"><strong>{label}</strong><button type="button" onClick={clear}><RotateCcw size={13} />Limpar</button></div>
      <canvas ref={ref} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
      <small>{value ? 'Assinatura registrada.' : 'Assine dentro da área acima.'}</small>
    </div>
  );
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

  return (
    <section className="form-card damages r2-damages">
      <div className="damage-head">
        <div className="section-title"><Wrench size={19} /><div><h2>Avarias identificadas</h2><p>Escolha o tipo e toque diretamente na imagem.</p></div></div>
        <div className="damage-legend">
          {(Object.keys(damageColors) as DamageType[]).map(item => (
            <button type="button" key={item} className={item === type ? 'selected' : ''} onClick={() => setType(item)}>
              <i style={{ background: damageColors[item] }} />{item}
            </button>
          ))}
        </div>
      </div>

      <div className="r2-views-grid">
        {ZEUS_CHECKLIST_VIEWS.map(view => {
          const points = value.filter(item => normalizeZeusChecklistView(item.view) === view);
          return (
            <article className={`r2-view r2-view-${view}`} key={view}>
              <div className="r2-image-stage" onPointerDown={event => add(view, event)}>
                <img
                  src={`/api/checklist-asset?folder=${encodeURIComponent(folder)}&view=${encodeURIComponent(view)}`}
                  alt={`${ZEUS_CHECKLIST_VIEW_LABELS[view]} do equipamento`}
                  draggable={false}
                />
                {points.map((item, index) => {
                  const [x, y] = item.point.split(',');
                  return (
                    <button
                      type="button"
                      className="damage-dot"
                      aria-label={`Remover ${item.type}`}
                      key={`${item.view}-${item.point}-${index}`}
                      onPointerDown={event => {
                        event.stopPropagation();
                        onChange(value.filter(current => current !== item));
                      }}
                      style={{ left: `${x}%`, top: `${y}%`, background: damageColors[item.type] }}
                    >{index + 1}</button>
                  );
                })}
              </div>
              <strong>{ZEUS_CHECKLIST_VIEW_LABELS[view]}</strong>
            </article>
          );
        })}
      </div>
      <p className="damage-hint">As marcações ficam presas à mesma posição da imagem mesmo quando a tela muda de tamanho.</p>
    </section>
  );
}

export function ZeusCheckInPublicR2({ token }: { token: string }) {
  const [link, setLink] = useState<LinkData | null>(null);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [document, setDocument] = useState('');
  const [role, setRole] = useState('');
  const [notes, setNotes] = useState('');
  const [meter, setMeter] = useState('');
  const [customerSignature, setCustomerSignature] = useState('');
  const [staffSignature, setStaffSignature] = useState('');
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [damage, setDamage] = useState<Damage[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void invoke(token, 'read')
      .then(result => {
        if (result.link?.kind !== 'zeus-checkin') throw new Error('Este link não é um checklist de entrada.');
        setLink(result.link);
        setMeter(String(result.link?.payload?.assetInfo?.meter || ''));
        if (Array.isArray(result.link?.payload?.damage)) setDamage(result.link.payload.damage);
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : 'Link indisponível.'));
  }, [token]);

  const segment = (link?.payload?.segment && ZEUS_CHECKLIST_TEMPLATES[link.payload.segment as ZeusChecklistSegment]
    ? link.payload.segment
    : 'auto') as ZeusChecklistSegment;
  const template = ZEUS_CHECKLIST_TEMPLATES[segment];
  const items = useMemo(() => ((link?.payload?.items || template.items) as string[]), [link, template.items]);
  const assetInfo = (link?.payload?.assetInfo || {}) as Record<string, unknown>;
  const assetLabel = String(link?.payload?.assetLabel || template.shortLabel);
  const assetFolder = inferZeusChecklistAssetFolder(assetLabel, assetInfo);
  const meterLabel = String(link?.payload?.meterLabel || (/máquina|equipamento|trator|empilhadeira/i.test(assetLabel) ? 'Horímetro' : 'Quilometragem'));

  if (error && !link) return <main className="check-page"><section className="check-state"><h1>Este checklist não está disponível</h1><p>{error}</p></section></main>;
  if (!link) return <main className="check-page"><section className="check-state"><p>Abrindo checklist…</p></section></main>;
  if (sent) return <main className="check-page"><section className="check-state success"><CheckCircle2 size={46} /><h1>Checklist enviado</h1><p>O registro foi enviado para a oficina e ficou vinculado à OS.</p></section></main>;

  const submit = async () => {
    if (!name.trim()) { setError('Informe o responsável pela conferência.'); return; }
    const missing = items.find(item => !answers[item]?.status);
    if (missing) { setError(`Responda o item: ${missing}`); return; }
    if (link.payload.requireSignature && !customerSignature) { setError('A assinatura do cliente/responsável é obrigatória.'); return; }

    setBusy(true);
    setError('');
    try {
      await invoke(token, 'respond', {
        segment,
        checklistAssetFolder: assetFolder,
        name: name.trim(),
        meter: meter.trim(),
        notes: notes.trim(),
        signature: customerSignature,
        customerSignature,
        staffSignature,
        contact: { phone, document, role },
        damage,
        answers: items.map(item => ({ item, status: answers[item].status, note: answers[item].note || '' })),
      });
      setSent(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível enviar o checklist.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="check-page">
      <div className="check-wrap">
        <header className="check-top">
          <div><span className="brand">ZEUS <b>OFICINA</b></span><span className="divider" /><span>CRM PLUS</span></div>
          <div className="secure"><ShieldCheck size={17} /> Checklist externo seguro</div>
        </header>

        <section className="check-heading">
          <div><p className="eyebrow">Checklist de entrada</p><h1>{template.shortLabel} · OS {String(link.payload.jobNumber || '').padStart(4, '0')}</h1><p>Inspeção visual e registro das condições no recebimento.</p></div>
          <span className="status-pill">Em preenchimento</span>
        </section>

        <section className="hero-data">
          <div><UserRound size={18} /><span>Cliente<strong>{String(link.payload.customer || 'Não informado')}</strong></span></div>
          <div><ClipboardCheck size={18} /><span>{String(link.payload.identifierLabel || 'Identificação')}<strong>{String(assetInfo.identifier || link.payload.asset || 'Não informado')}</strong></span></div>
          <div><Wrench size={18} /><span>{assetLabel}<strong>{String(assetInfo.model || template.label)}</strong></span></div>
        </section>

        <div className="top-grid">
          <section className="form-card">
            <div className="section-title"><ClipboardCheck size={18} /><div><h2>Dados do {assetLabel.toLowerCase()}</h2><p>Informações principais do item recebido.</p></div></div>
            <div className="fields">
              <label><span>Marca</span><input readOnly value={String(assetInfo.brand || '')} placeholder="Não informado" /></label>
              <label><span>Modelo</span><input readOnly value={String(assetInfo.model || '')} placeholder="Não informado" /></label>
              <label><span>{String(link.payload.identifierLabel || 'Identificação')}</span><input readOnly value={String(assetInfo.identifier || '')} placeholder="Não informado" /></label>
              <label><span>Ano</span><input readOnly value={String(assetInfo.year || '')} placeholder="Não informado" /></label>
              <label><span>{meterLabel}</span><input value={meter} onChange={event => setMeter(event.target.value)} placeholder="Informar" /></label>
            </div>
          </section>

          <section className="form-card">
            <div className="section-title"><UserRound size={18} /><div><h2>Dados do cliente / responsável</h2><p>Quem acompanha ou entrega o item.</p></div></div>
            <div className="fields">
              <label className="wide"><span>Nome completo</span><input value={name} onChange={event => setName(event.target.value)} placeholder="Nome do responsável" /></label>
              <label><span>Telefone</span><input value={phone} onChange={event => setPhone(event.target.value)} placeholder="Telefone" /></label>
              <label><span>Documento</span><input value={document} onChange={event => setDocument(event.target.value)} placeholder="CPF/CNH ou identificação" /></label>
              <label><span>Função</span><input value={role} onChange={event => setRole(event.target.value)} placeholder="Cliente, motorista, operador..." /></label>
            </div>
          </section>
        </div>

        <section className="form-card inspection">
          <div className="section-title"><ClipboardCheck size={18} /><div><h2>Itens inspecionados</h2><p>Registre o status de cada item.</p></div></div>
          <div className="inspection-grid">
            {items.map((item, index) => {
              const current = answers[item] || { status: '', note: '' };
              return (
                <div className="inspection-row" key={item}>
                  <div className="item-name"><b>{String(index + 1).padStart(2, '0')}</b><span>{item}</span></div>
                  <div className="row-status">
                    {['OK', 'Atenção', 'Não se aplica'].map(status => (
                      <button
                        type="button"
                        key={status}
                        className={`${current.status === status ? 'active ' : ''}${status === 'OK' ? 'ok' : status === 'Atenção' ? 'attention' : 'na'}`}
                        onClick={() => setAnswers({ ...answers, [item]: { ...current, status } })}
                      >{status === 'Não se aplica' ? 'N/A' : status}</button>
                    ))}
                  </div>
                  <input value={current.note} onChange={event => setAnswers({ ...answers, [item]: { ...current, note: event.target.value } })} placeholder="Observação opcional" />
                </div>
              );
            })}
          </div>
        </section>

        <R2DamageBoard folder={assetFolder} value={damage} onChange={setDamage} />

        <div className="bottom-grid">
          <section className="form-card notes">
            <div className="section-title"><ClipboardCheck size={18} /><div><h2>Observações gerais</h2><p>Registre ressalvas, objetos, condições ou informações adicionais.</p></div></div>
            <textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Descreva outras informações relevantes..." />
          </section>
          <section className="form-card signatures">
            <SignaturePad label="Assinatura do cliente / responsável" value={customerSignature} onChange={setCustomerSignature} />
            <SignaturePad label="Assinatura do responsável da oficina" value={staffSignature} onChange={setStaffSignature} />
          </section>
        </div>

        {error && <div className="check-error">{error}</div>}
        <footer className="check-actions">
          <span>Ao finalizar, o checklist ficará registrado na OS.</span>
          <button disabled={busy} onClick={() => void submit()}>{busy ? 'Enviando…' : 'Finalizar checklist'} <CheckCircle2 size={18} /></button>
        </footer>
      </div>
    </main>
  );
}
