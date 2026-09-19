'use client';

import { useEffect, useState } from 'react';

export const zeusServiceTypeSuggestions = [
  'Diagnóstico','Revisão','Reparo','Retorno / Garantia',
  'Manutenção preventiva','Manutenção corretiva','Inspeção','Instalação'
];

const defaultTypes = zeusServiceTypeSuggestions.slice(0, 4);
const eventName = 'crmplus:zeus-service-types';
const storageKey = (accountId = 'guest') => `crmplus:${accountId}:zeus:service-types:v2`;

export function readZeusServiceTypes(accountId = 'guest') {
  if (typeof window === 'undefined') return defaultTypes;
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(accountId)) || 'null');
    if (!Array.isArray(parsed)) return defaultTypes;
    const values = parsed.map(value => String(value).trim()).filter(Boolean);
    return values.length ? Array.from(new Set(values)) : defaultTypes;
  } catch { return defaultTypes; }
}

export function saveZeusServiceTypes(values: string[], accountId = 'guest') {
  const normalized = Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));
  if (!normalized.length) throw new Error('Mantenha pelo menos um tipo de atendimento disponível.');
  localStorage.setItem(storageKey(accountId), JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(eventName, { detail: { accountId } }));
}

export function useZeusServiceTypes(accountId = 'guest') {
  const [types, setTypes] = useState<string[]>(defaultTypes);
  useEffect(() => {
    const sync = () => setTypes(readZeusServiceTypes(accountId));
    const custom = (event: Event) => {
      const detail = (event as CustomEvent<{ accountId?: string }>).detail;
      if (!detail?.accountId || detail.accountId === accountId) sync();
    };
    sync();
    window.addEventListener(eventName, custom);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(eventName, custom);
      window.removeEventListener('storage', sync);
    };
  }, [accountId]);
  return types;
}
