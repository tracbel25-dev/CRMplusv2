'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { Workspace } from '@/lib/operations/storage';
import { migrateLegacyZeusChecklists, syncAllZeusChecklistResponses } from '@/lib/operations/zeusChecklistClient';
import { syncZeusQuoteExternalResponses } from '@/lib/operations/zeusQuoteExternalSync';

let legacyMigrationChecked = false;

export function ZeusExternalSync({ w }: { w: Workspace }) {
  const running = useRef(false);

  const sync = useCallback(async () => {
    if (running.current || !w.accountId || w.accountId === 'guest') return;
    running.current = true;
    try {
      if (!legacyMigrationChecked) {
        try {
          await migrateLegacyZeusChecklists();
        } catch (reason) {
          // Migração antiga é complementar. Falha/permissão nela não pode bloquear respostas atuais.
          console.warn('Zeus legacy checklist migration:', reason);
        } finally {
          legacyMigrationChecked = true;
        }
      }
      await syncAllZeusChecklistResponses(w);
      await syncZeusQuoteExternalResponses(w);
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
    const onVisibility = () => { if (document.visibilityState === 'visible') void sync(); };
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void sync();
    }, 60000);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [sync]);

  return null;
}
