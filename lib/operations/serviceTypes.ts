'use client';

import { useEffect, useState } from 'react';

export const zeusServiceTypeSuggestions = [
  'Diagnóstico',
  'Revisão',
  'Reparo',
  'Retorno / Garantia',
  'Manutenção preventiva',
  'Manutenção corretiva',
  'Inspeção',
  'Instalação'
];

const defaultTypes = zeusServiceTypeSuggestions.slice(0, 4);
const storageKey = 'crmplus:zeus:service-types:v1';
const eventName = 'crmplus:zeus-service-types';

export function readZeusServiceTypes() {
  if (typeof window === 'undefined') return defaultTypes;
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!Array.isArray(parsed)) return defaultTypes;
    const values = parsed.map(value => String(value).trim()).filter(Boolean);
    return values.length ? Array.from(new Set(values)) : defaultTypes;
  } catch {
    return defaultTypes;
  }
}

export function saveZeusServiceTypes(values: string[]) {
  const normalized = Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));
  if (!normalized.length) throw new Error('Mantenha pelo menos um tipo de atendimento disponível.');
  localStorage.setItem(storageKey, JSON.stringify(normalized));
  window.dispatchEvent(new Event(eventName));
}

export function useZeusServiceTypes() {
  const [types, setTypes] = useState<string[]>(defaultTypes);
  useEffect(() => {
    const sync = () => setTypes(readZeusServiceTypes());
    sync();
    window.addEventListener(eventName, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(eventName, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return types;
}
