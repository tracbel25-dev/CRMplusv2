'use client';

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { usePathname } from 'next/navigation';
import './compact-navigation.css';

type Tab = { id: string; label: string; count?: number; description?: string };
type Mode = 'tabs' | 'accordion';
type CompactContext = {
  id: string;
  mode: Mode;
  value: string;
  tabs: Tab[];
  expanded: string[];
  select: (value: string) => void;
  toggle: (value: string) => void;
  open: (value: string) => void;
};

const Context = createContext<CompactContext | null>(null);
const ZEUS_SETTINGS_STORAGE_KEY = 'crmplus:zeus:settings-sections:v1';
const ZEUS_SETTINGS_TTL = 24 * 60 * 60 * 1000;
const ZEUS_SETTINGS_DESCRIPTIONS: Record<string, string> = {
  dados: 'Informações principais da oficina usadas no Zeus.',
  campos: 'Nomes, campos e dicas exibidos durante a operação.',
  operacao: 'Etapas, recursos e ações que formam o fluxo da oficina.',
  acessos: 'Dados da conta, equipe e opções de acesso.',
  backup: 'Exportação e restauração de cópias dos dados do Zeus.',
};

type StoredAccordionState = { expanded?: string[]; updatedAt?: number };

function readTemporaryAccordionState(tabs: Tab[]) {
  try {
    const raw = localStorage.getItem(ZEUS_SETTINGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredAccordionState;
    const updatedAt = Number(parsed.updatedAt || 0);
    if (!updatedAt || Date.now() - updatedAt >= ZEUS_SETTINGS_TTL) {
      localStorage.removeItem(ZEUS_SETTINGS_STORAGE_KEY);
      return [];
    }
    const valid = new Set(tabs.map(tab => tab.id));
    return Array.isArray(parsed.expanded) ? parsed.expanded.filter(value => valid.has(value)) : [];
  } catch {
    localStorage.removeItem(ZEUS_SETTINGS_STORAGE_KEY);
    return [];
  }
}

function storeTemporaryAccordionState(expanded: string[]) {
  try {
    localStorage.setItem(ZEUS_SETTINGS_STORAGE_KEY, JSON.stringify({ expanded, updatedAt: Date.now() }));
  } catch {
    // Prefer the interface working normally even when localStorage is unavailable.
  }
}

export function CompactTabs({ tabs, children, label, initial }: { tabs: Tab[]; children: ReactNode; label: string; initial?: string }) {
  const id = useId();
  const pathname = usePathname();
  const accordion = label === 'Áreas de configuração' && pathname.startsWith('/zeus');
  const mode: Mode = accordion ? 'accordion' : 'tabs';
  const hydratedTabs = useMemo(() => tabs.map(tab => accordion && !tab.description ? { ...tab, description: ZEUS_SETTINGS_DESCRIPTIONS[tab.id] } : tab), [accordion, tabs]);
  const [selected, setSelected] = useState(initial || tabs[0]?.id || '');
  const [expanded, setExpanded] = useState<string[]>([]);
  const value = hydratedTabs.some(tab => tab.id === selected) ? selected : hydratedTabs[0]?.id || '';

  useEffect(() => {
    if (!accordion) return;
    setExpanded(readTemporaryAccordionState(hydratedTabs));
  }, [accordion, hydratedTabs]);

  const changeExpanded = useCallback((change: (current: string[]) => string[]) => {
    setExpanded(current => {
      const next = change(current);
      storeTemporaryAccordionState(next);
      return next;
    });
  }, []);

  const toggle = useCallback((nextValue: string) => {
    if (!accordion) { setSelected(nextValue); return; }
    changeExpanded(current => current.includes(nextValue) ? current.filter(item => item !== nextValue) : [...current, nextValue]);
  }, [accordion, changeExpanded]);

  const open = useCallback((nextValue: string) => {
    if (!accordion) { setSelected(nextValue); return; }
    changeExpanded(current => current.includes(nextValue) ? current : [...current, nextValue]);
  }, [accordion, changeExpanded]);

  const select = useCallback((nextValue: string) => {
    if (accordion) open(nextValue);
    else setSelected(nextValue);
  }, [accordion, open]);

  return <Context.Provider value={{ id, mode, value, tabs: hydratedTabs, expanded, select, toggle, open }}>
    {accordion ? <div className="op-settings-accordion">{children}</div> : <>
      <div className="op-compact-tabs" role="tablist" aria-label={label}>
        {hydratedTabs.map((tab, index) => <button key={tab.id} type="button" role="tab" id={`${id}-tab-${tab.id}`} aria-controls={`${id}-panel-${tab.id}`} aria-selected={value === tab.id} tabIndex={value === tab.id ? 0 : -1} onClick={() => setSelected(tab.id)} onKeyDown={event => {
          let next = index;
          if (event.key === 'ArrowRight') next = (index + 1) % hydratedTabs.length;
          else if (event.key === 'ArrowLeft') next = (index - 1 + hydratedTabs.length) % hydratedTabs.length;
          else if (event.key === 'Home') next = 0;
          else if (event.key === 'End') next = hydratedTabs.length - 1;
          else return;
          event.preventDefault();
          setSelected(hydratedTabs[next].id);
          document.getElementById(`${id}-tab-${hydratedTabs[next].id}`)?.focus();
        }}>{tab.label}{tab.count !== undefined && <span>{tab.count}</span>}</button>)}
      </div>
      {children}
    </>}
  </Context.Provider>;
}

export function CompactPanel({ value, children }: { value: string; children: ReactNode }) {
  const context = useContext(Context);
  if (!context) throw new Error('CompactPanel requires CompactTabs');

  if (context.mode === 'accordion') {
    const tab = context.tabs.find(item => item.id === value);
    const isOpen = context.expanded.includes(value);
    return <section className={`op-settings-accordion-item${isOpen ? ' open' : ''}`}>
      <button className="op-settings-accordion-trigger" type="button" id={`${context.id}-trigger-${value}`} aria-controls={`${context.id}-panel-${value}`} aria-expanded={isOpen} onClick={() => context.toggle(value)}>
        <span className="op-settings-accordion-heading">
          <strong>{tab?.label || value}</strong>
          {!isOpen && tab?.description && <small>{tab.description}</small>}
        </span>
        <span className="op-settings-accordion-meta">{tab?.count !== undefined && <b>{tab.count}</b>}<ChevronDown size={19} /></span>
      </button>
      <div className="op-settings-accordion-panel" role="region" id={`${context.id}-panel-${value}`} aria-labelledby={`${context.id}-trigger-${value}`} hidden={!isOpen} onInvalidCapture={event => {
        if (isOpen) return;
        event.preventDefault();
        context.open(value);
        const input = event.target as HTMLInputElement;
        requestAnimationFrame(() => { input.focus(); input.reportValidity(); });
      }}>{children}</div>
    </section>;
  }

  return <div className="op-compact-panel" role="tabpanel" id={`${context.id}-panel-${value}`} aria-labelledby={`${context.id}-tab-${value}`} hidden={context.value !== value} tabIndex={0} onInvalidCapture={event => {
    if (context.value === value) return;
    event.preventDefault();
    context.select(value);
    const input = event.target as HTMLInputElement;
    requestAnimationFrame(() => { input.focus(); input.reportValidity(); });
  }}>{children}</div>;
}
