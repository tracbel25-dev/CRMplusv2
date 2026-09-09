'use client';

import { useEffect } from 'react';
import type { AppId } from '@/lib/operations/model';
import { configStorageKey, defaultOperationPreferences, saveOperationPreferences } from '@/lib/operations/configuration';

export function useArtemisBootstrap(app: AppId) {
  useEffect(() => {
    if (app !== 'artemis' || typeof window === 'undefined') return;
    if (localStorage.getItem(configStorageKey('artemis'))) return;

    const preferences = defaultOperationPreferences('artemis');
    preferences.actionVisibility = {
      ...preferences.actionVisibility,
      dineIn: true,
      counter: true,
      delivery: false,
      pickup: false,
      kitchenView: true,
      newOrderSound: true,
      loyalty: false,
      'module:caixa': false,
      'module:estoque': false,
      'module:clientes': false,
      'module:relatorios': false,
      payments: false,
      refunds: false,
    };
    saveOperationPreferences('artemis', preferences);
  }, [app]);
}
