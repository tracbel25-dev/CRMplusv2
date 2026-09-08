'use client';

import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge, Button } from './ui';

export function WorkflowControl({
  label = 'Fluxo atual',
  steps,
  current,
  status,
  nextLabel,
  onNext,
  disabled = false,
  actions
}: {
  label?: string;
  steps: string[];
  current: string;
  status?: string;
  nextLabel?: string;
  onNext?: () => void;
  disabled?: boolean;
  actions?: ReactNode;
}) {
  const currentIndex = Math.max(0, steps.indexOf(current));
  return <section className="op-workflow-control" aria-label={label}>
    <div className="op-workflow-heading">
      <div>
        <span className="op-kicker">{label}</span>
        <strong>{current}</strong>
        {status && status !== current && <Badge>{status}</Badge>}
      </div>
    </div>
    <div className="op-workflow-steps">
      {steps.map((step, index) => <span key={step} className={index < currentIndex ? 'complete' : index === currentIndex ? 'current' : ''}>
        <b>{String(index + 1).padStart(2, '0')}</b>
        <em>{step}</em>
      </span>)}
    </div>
    {(nextLabel && onNext || actions) && <div className="op-workflow-footer">
      {nextLabel && onNext && <div className="op-workflow-next">
        <div><span>Próxima ação</span><strong>{nextLabel}</strong></div>
        <Button disabled={disabled} onClick={onNext}>{nextLabel}<ArrowRight size={16} /></Button>
      </div>}
      {actions && <div className="op-workflow-secondary">{actions}</div>}
    </div>}
  </section>;
}
