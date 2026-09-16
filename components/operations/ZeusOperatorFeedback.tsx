'use client';

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { stages } from '@/lib/operations/model';
import type { Workspace } from '@/lib/operations/storage';

type OperatorAction = 'advance' | 'close' | '';

export function ZeusOperatorFeedback({ w, jobId, children }: { w: Workspace; jobId: string; children: ReactNode }) {
  const [action, setAction] = useState<OperatorAction>('');
  const [result, setResult] = useState(false);
  const expectedNotice = useRef('');
  const resultTimer = useRef<number | null>(null);

  const finish = (success: boolean) => {
    expectedNotice.current = '';
    setAction('');
    if (!success) return;
    setResult(true);
    if (resultTimer.current) window.clearTimeout(resultTimer.current);
    resultTimer.current = window.setTimeout(() => setResult(false), 900);
  };

  useEffect(() => {
    if (!action) return;
    if (w.error) { finish(false); return; }
    if (expectedNotice.current && w.notice === expectedNotice.current) finish(true);
  }, [action, w.error, w.notice]);

  useEffect(() => {
    if (!action) return;
    const timeout = window.setTimeout(() => finish(false), 15000);
    return () => window.clearTimeout(timeout);
  }, [action]);

  useEffect(() => () => {
    if (resultTimer.current) window.clearTimeout(resultTimer.current);
  }, []);

  const begin = (next: Exclude<OperatorAction, ''>, notice: string) => {
    expectedNotice.current = notice;
    w.setError('');
    w.setNotice('');
    setAction(next);
  };

  const capture = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest('button') as HTMLButtonElement | null;
    if (!button) return;

    const current = w.data.jobs.find(item => item.id === jobId);
    const primary = !!button.closest('.zeus-primary-action');
    const closing = current?.stage === 'Entrega' && button.textContent?.trim() === 'Encerrar OS';

    if (action && (primary || closing)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (!current) return;

    if (primary) {
      const flow = stages(w.data.settings);
      const index = flow.indexOf(current.stage);
      const nextStage = index >= 0 ? flow[index + 1] : '';
      const blocked = (current.stage === 'Identificação' && current.status === 'Aguardando checklist')
        || (current.stage === 'Diagnóstico' && !current.diagnosis.trim())
        || (current.stage === 'Execução' && current.tasks.some(item => !item.done));
      if (nextStage && current.stage !== 'Entrega' && current.stage !== 'Orçamento' && !blocked) {
        begin('advance', `OS avançou para ${nextStage}.`);
      }
      return;
    }

    if (closing) {
      begin('close', 'OS encerrada. Se houver valor a receber, ela já está disponível em Faturamento.');
    }
  };

  return <div className={`zeus-operator-feedback ${action ? `is-${action}ing` : ''} ${result ? 'is-result' : ''}`} onClickCapture={capture}>{children}</div>;
}
