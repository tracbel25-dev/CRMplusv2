'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { Workspace } from '@/lib/operations/storage';
import { syncExternalResponses } from '@/lib/operations/externalLinks';
import { migrateLegacyZeusChecklists, syncAllZeusChecklistResponses } from '@/lib/operations/zeusChecklistClient';
import { syncZeusQuoteExternalResponses } from '@/lib/operations/zeusQuoteExternalSync';

export function ZeusExternalSync({ w }: { w: Workspace }) {
  const running = useRef(false);
  const legacyChecked = useRef(false);

  const sync = useCallback(async () => {
    if (running.current || !w.accountId || w.accountId === 'guest') return;
    running.current = true;
    try {
      if (!legacyChecked.current) {
        try {
          await migrateLegacyZeusChecklists();
        } catch (reason) {
          // Migração antiga é complementar. Falha/permissão nela não pode bloquear respostas atuais.
          console.warn('Zeus legacy checklist migration:', reason);
        } finally {
          legacyChecked.current = true;
        }
      }
      await syncAllZeusChecklistResponses(w);
      await syncZeusQuoteExternalResponses(w);
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
