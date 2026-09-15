'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { Workspace } from '@/lib/operations/storage';
import { syncExternalResponses } from '@/lib/operations/externalLinks';
import { syncAllZeusChecklistResponses } from '@/lib/operations/zeusChecklistClient';

export function ZeusExternalSync({ w }: { w: Workspace }) {
  const running = useRef(false);

  const sync = useCallback(async () => {
    if (running.current || !w.accountId || w.accountId === 'guest') return;
    running.current = true;
    try {
      await syncAllZeusChecklistResponses(w);
      await syncExternalResponses(w, 'zeus');
    } catch (reason) {
      // A sincronização automática não deve interromper a operação. Ações explícitas continuam exibindo o erro.
      console.warn('Zeus external sync:', reason);
    } finally {
      running.current = false;
    }
  }, [w]);

  useEffect(() => {
    void sync();
    const onFocus = () => { void sync(); };
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void sync();
    }, 15000);
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [sync]);

  return null;
}
