'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, FlaskConical, TriangleAlert } from 'lucide-react';
import type { Workspace } from '@/lib/operations/storage';
import { money } from '@/lib/operations/model';
import { useOperationPreferences } from '@/lib/operations/configuration';
import { Badge, Button, Modal } from './ui';

const steps = ['Pedido recebido', 'Confirmado', 'Cozinha', 'Conferência de saída', 'Recebimento', 'Concluído'];

export function ArtemisGuidedTest({ w }: { w: Workspace }) {
  const operation = useOperationPreferences('artemis');
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const product = useMemo(() => w.data.products.find(item => item.available), [w.data.products]);
  const variant = product?.variants?.find(item => item.available !== false);
  const unitPrice = variant?.price ?? product?.price ?? 0;
  const issues = useMemo(() => {
    const list: string[] = [];
    if (!w.data.settings.business.trim()) list.push('Informe o nome do restaurante.');
    if (!w.data.products.some(item => item.available)) list.push('Cadastre pelo menos um produto disponível.');
    if (!operation.actionVisible('delivery') && !operation.actionVisible('pickup') && !operation.actionVisible('dineIn') && !operation.actionVisible('counter')) list.push('Ative pelo menos um canal de atendimento.');
    if (operation.actionVisible('delivery') && !w.data.settings.hours.trim()) list.push('Defina o horário de atendimento do delivery.');
    if (operation.actionVisible('dineIn') && !w.data.tables.length) list.push('Cadastre ao menos uma mesa para testar o salão.');
    return list;
  }, [w.data.settings.business, w.data.settings.hours, w.data.products, w.data.tables.length, operation.preferences]);

  const restart = () => setStep(0);

  return <>
    <Button variant="secondary" onClick={() => { restart(); setOpen(true); }}><FlaskConical size={16} />Teste guiado</Button>
    {open && <Modal title="Teste guiado do restaurante" wide onClose={() => setOpen(false)}>
      <div className="artemis-guided-test">
        <p className="op-callout"><strong>Ambiente de simulação.</strong> Este teste não cria venda, não baixa estoque, não abre caixa e não envia pedido ao cliente.</p>

        {issues.length > 0 ? <section className="artemis-test-issues"><div><TriangleAlert size={18} /><strong>Configuração incompleta</strong></div>{issues.map(item => <p key={item}>{item}</p>)}</section> : <section className="artemis-test-ready"><CheckCircle2 size={18} /><span>Configuração mínima encontrada. Você pode percorrer o fluxo completo.</span></section>}

        <div className="artemis-test-ticket">
          <div><span className="op-kicker">PEDIDO TESTE</span><Badge>Não será salvo</Badge></div>
          <strong>#TESTE-001 · {operation.actionVisible('delivery') ? 'Delivery' : operation.actionVisible('pickup') ? 'Retirada' : operation.actionVisible('dineIn') ? 'Mesa' : 'Balcão'}</strong>
          {product ? <p>1× {product.name}{variant ? ` · ${variant.name}` : ''} · {money(unitPrice)}</p> : <p>Nenhum produto disponível para simular.</p>}
        </div>

        <div className="artemis-test-progress">
          {steps.map((label, index) => <div className={index < step ? 'done' : index === step ? 'current' : ''} key={label}><span>{index < step ? '✓' : index + 1}</span><strong>{label}</strong></div>)}
        </div>

        {step === 0 && <p>O teste imita a chegada do pedido. Confira se a equipe reconhece canal, item e preço.</p>}
        {step === 1 && <p>Confirmação simulada. Em produção, aqui o estoque é reservado e o pedido entra na fila.</p>}
        {step === 2 && <p>Cozinha simulada. Marque mentalmente o item como preparado; nenhum estoque real será consumido.</p>}
        {step === 3 && <p>Conferência simulada de embalagem: comida, bebida e complementos antes da saída.</p>}
        {step === 4 && <p>Recebimento simulado. Nenhum caixa, pagamento ou relatório será alterado.</p>}
        {step === 5 && <p><strong>Fluxo concluído.</strong> Se algo pareceu confuso ou faltou configuração, ajuste antes de compartilhar o cardápio.</p>}

        <div className="op-form-footer">
          {step > 0 && <Button variant="secondary" onClick={() => setStep(value => Math.max(0, value - 1))}>Voltar</Button>}
          {step < steps.length - 1 ? <Button disabled={issues.length > 0 || !product} onClick={() => setStep(value => Math.min(steps.length - 1, value + 1))}>Avançar teste</Button> : <Button onClick={() => { setOpen(false); restart(); }}>Finalizar teste</Button>}
        </div>
      </div>
      <style jsx>{`.artemis-guided-test{display:grid;gap:16px}.artemis-test-issues,.artemis-test-ready,.artemis-test-ticket{padding:14px;border:1px solid var(--op-line);border-radius:12px;background:var(--op-soft)}.artemis-test-issues>div,.artemis-test-ready,.artemis-test-ticket>div{display:flex;align-items:center;gap:8px}.artemis-test-issues p{margin:6px 0 0}.artemis-test-ticket{display:grid;gap:8px}.artemis-test-ticket>div{justify-content:space-between}.artemis-test-ticket p{margin:0}.artemis-test-progress{display:grid;grid-template-columns:repeat(6,1fr);gap:7px}.artemis-test-progress div{display:grid;gap:6px;padding:10px;border:1px solid var(--op-line);border-radius:10px;color:var(--op-muted)}.artemis-test-progress span{width:26px;height:26px;display:grid;place-items:center;border-radius:50%;background:var(--op-soft)}.artemis-test-progress .current{border-color:var(--op-accent);color:var(--op-ink)}.artemis-test-progress .done{opacity:.75}.artemis-test-progress strong{font-size:11px}@media(max-width:800px){.artemis-test-progress{grid-template-columns:repeat(2,1fr)}}`}</style>
    </Modal>}
  </>;
}
