'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { Workspace } from '@/lib/operations/storage';
import { migrateLegacyZeusChecklists, syncAllZeusChecklistResponses } from '@/lib/operations/zeusChecklistClient';
import { syncZeusQuoteExternalResponses } from '@/lib/operations/zeusQuoteExternalSync';

let legacyMigrationChecked = false;

export function ZeusExternalSync({ w }: { w: Workspace }) {
  const running = useRef(false);
  const workspaceRef = useRef(w);
  workspaceRef.current = w;
  const accountId = w.accountId;

  const sync = useCallback(async () => {
    const current = workspaceRef.current;
    if (running.current || !current.accountId || current.accountId === 'guest') return;
    running.current = true;
    try {
      if (!legacyMigrationChecked) {
        try {
          await migrateLegacyZeusChecklists();
        } catch (reason) {
          console.warn('Zeus legacy checklist migration:', reason);
        } finally {
          legacyMigrationChecked = true;
        }
      }
      await syncAllZeusChecklistResponses(current);
      await syncZeusQuoteExternalResponses(current);
    } catch (reason) {
      console.warn('Zeus external sync:', reason);
    } finally {
      running.current = false;
    }
  }, [accountId]);

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
