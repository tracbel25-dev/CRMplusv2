'use client';

import { createContext, useContext, useId, useState, type ReactNode } from 'react';
import './compact-navigation.css';

type Tab = { id: string; label: string; count?: number };
const Context = createContext<{ id: string; value: string; select: (value: string) => void } | null>(null);

export function CompactTabs({ tabs, children, label, initial }: { tabs: Tab[]; children: ReactNode; label: string; initial?: string }) {
  const id = useId();
  const [selected, select] = useState(initial || tabs[0]?.id || '');
  const value = tabs.some(tab => tab.id === selected) ? selected : tabs[0]?.id || '';
  return <Context.Provider value={{ id, value, select }}>
    <div className="op-compact-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => <button key={tab.id} type="button" role="tab" id={`${id}-tab-${tab.id}`} aria-controls={`${id}-panel-${tab.id}`} aria-selected={value === tab.id} tabIndex={value === tab.id ? 0 : -1} onClick={() => select(tab.id)} onKeyDown={event => {
        let next = index;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        else return;
        event.preventDefault();
        select(tabs[next].id);
        document.getElementById(`${id}-tab-${tabs[next].id}`)?.focus();
      }}>{tab.label}{tab.count !== undefined && <span>{tab.count}</span>}</button>)}
    </div>
    {children}
  </Context.Provider>;
}

export function CompactPanel({ value, children }: { value: string; children: ReactNode }) {
  const context = useContext(Context);
  if (!context) throw new Error('CompactPanel requires CompactTabs');
  return <div className="op-compact-panel" role="tabpanel" id={`${context.id}-panel-${value}`} aria-labelledby={`${context.id}-tab-${value}`} hidden={context.value !== value} tabIndex={0} onInvalidCapture={event => {
    if (context.value === value) return;
    event.preventDefault();
    context.select(value);
    const input = event.target as HTMLInputElement;
    requestAnimationFrame(() => { input.focus(); input.reportValidity(); });
  }}>{children}</div>;
}
