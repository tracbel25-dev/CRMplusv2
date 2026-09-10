'use client';

import Link from 'next/link';
import { LockKeyhole, ShieldAlert, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppId } from '@/lib/operations/model';
import { navigation } from '@/lib/operations/navigation';
import './trial-protection.css';

const CLIPBOARD_NOTICE = 'Conteúdo protegido pelo CRM PLUS Store. Ative sua assinatura para copiar, exportar, imprimir ou compartilhar informações.';
const RESTRICTED_ACTION = /(copiar|copy|exportar|export|baixar|download|imprimir|print|pdf|csv|xlsx|excel|compartilhar|share)/i;

function actionText(target: Element) {
  return [
    target.getAttribute('data-trial-restricted'),
    target.getAttribute('aria-label'),
    target.getAttribute('title'),
    target.textContent,
    target instanceof HTMLAnchorElement ? target.href : ''
  ].filter(Boolean).join(' ');
}

export function TrialProtection({ app, accountName, email, children }: { app: AppId; accountName: string; email?: string | null; children: ReactNode }) {
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<number | null>(null);
  const screenTimer = useRef<number | null>(null);
  const appName = navigation[app]?.name || app;
  const watermark = useMemo(() => {
    const identity = email?.trim() || accountName;
    return `MODO TESTE • ${appName.toUpperCase()} • ${identity}`;
  }, [appName, accountName, email]);

  const showBlocked = useCallback((message = 'Esta função ficará disponível após a ativação da assinatura.') => {
    setNotice(message);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 4200);
  }, []);

  const shieldScreen = useCallback(() => {
    document.documentElement.classList.add('crm-trial-screen-shield');
    if (screenTimer.current) window.clearTimeout(screenTimer.current);
    screenTimer.current = window.setTimeout(() => document.documentElement.classList.remove('crm-trial-screen-shield'), 1400);
  }, []);

  useEffect(() => {
    document.documentElement.classList.add('crm-trial-protection');

    const clipboard = navigator.clipboard;
    const clipboardDescriptor = clipboard ? Object.getOwnPropertyDescriptor(clipboard, 'writeText') : undefined;
    const originalWriteText = clipboard?.writeText ? clipboard.writeText.bind(clipboard) : null;
    let clipboardPatched = false;

    if (clipboard && originalWriteText) {
      try {
        Object.defineProperty(clipboard, 'writeText', {
          configurable: true,
          value: async () => {
            showBlocked('Copiar conteúdo está bloqueado no modo teste. Assine agora para ter acesso completo.');
            try { await originalWriteText(CLIPBOARD_NOTICE); } catch { /* clipboard can be unavailable outside a user gesture */ }
          }
        });
        clipboardPatched = true;
      } catch { /* Browser may expose Clipboard as non-configurable. Native copy interception remains active. */ }
    }

    const onCopy = (event: ClipboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.clipboardData?.setData('text/plain', CLIPBOARD_NOTICE);
      showBlocked('Copiar conteúdo está bloqueado no modo teste. Assine agora para ter acesso completo.');
    };

    const onCut = (event: ClipboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.clipboardData?.setData('text/plain', CLIPBOARD_NOTICE);
      showBlocked('Recortar conteúdo está bloqueado no modo teste.');
    };

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      showBlocked('O menu de cópia está bloqueado no modo teste.');
    };

    const onDragStart = (event: DragEvent) => {
      event.preventDefault();
      showBlocked('Arrastar conteúdo para fora do aplicativo está bloqueado no modo teste.');
    };

    const onClick = (event: MouseEvent) => {
      const origin = event.target instanceof Element ? event.target : null;
      if (!origin) return;
      const explicit = origin.closest('[data-trial-restricted]');
      const actionable = origin.closest('button,a,[role="button"]');
      const download = actionable instanceof HTMLAnchorElement && (actionable.hasAttribute('download') || /\.(pdf|csv|xlsx?|zip)(?:$|[?#])/i.test(actionable.href));
      if (!explicit && !download && (!actionable || !RESTRICTED_ACTION.test(actionText(actionable)))) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      showBlocked(explicit?.getAttribute('data-trial-restricted') || 'Esta função ficará disponível após a ativação da assinatura.');
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const modifier = event.ctrlKey || event.metaKey;
      const developerShortcut = event.key === 'F12' || (modifier && event.shiftKey && ['i', 'j', 'c'].includes(key)) || (modifier && key === 'u');
      const blockedDocumentAction = modifier && ['p', 's'].includes(key);
      const screenshot = event.key === 'PrintScreen';
      if (!developerShortcut && !blockedDocumentAction && !screenshot) return;
      event.preventDefault();
      event.stopPropagation();
      if (screenshot) {
        shieldScreen();
        showBlocked('Captura de tela está bloqueada no modo teste. Assine agora para ter acesso completo.');
        if (originalWriteText) window.setTimeout(() => { void originalWriteText(CLIPBOARD_NOTICE).catch(() => undefined); }, 60);
        return;
      }
      showBlocked(developerShortcut
        ? 'Inspeção e acesso ao código estão bloqueados no modo teste.'
        : 'Salvar ou imprimir esta tela está bloqueado no modo teste.');
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== 'PrintScreen') return;
      event.preventDefault();
      shieldScreen();
      if (originalWriteText) void originalWriteText(CLIPBOARD_NOTICE).catch(() => undefined);
    };

    const onBeforePrint = () => {
      document.documentElement.classList.add('crm-trial-printing');
      showBlocked('Impressão bloqueada no modo teste. Esta função ficará disponível após a ativação da assinatura.');
    };
    const onAfterPrint = () => document.documentElement.classList.remove('crm-trial-printing');
    const originalPrint = window.print.bind(window);
    try {
      window.print = () => showBlocked('Impressão bloqueada no modo teste. Esta função ficará disponível após a ativação da assinatura.');
    } catch { /* beforeprint + print CSS still protect browser initiated printing */ }

    document.addEventListener('copy', onCopy, true);
    document.addEventListener('cut', onCut, true);
    document.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('dragstart', onDragStart, true);
    document.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);

    return () => {
      document.documentElement.classList.remove('crm-trial-protection', 'crm-trial-screen-shield', 'crm-trial-printing');
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
      if (screenTimer.current) window.clearTimeout(screenTimer.current);
      document.removeEventListener('copy', onCopy, true);
      document.removeEventListener('cut', onCut, true);
      document.removeEventListener('contextmenu', onContextMenu, true);
      document.removeEventListener('dragstart', onDragStart, true);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
      try { window.print = originalPrint; } catch { /* noop */ }
      if (clipboard && clipboardPatched) {
        try {
          if (clipboardDescriptor) Object.defineProperty(clipboard, 'writeText', clipboardDescriptor);
          else Reflect.deleteProperty(clipboard, 'writeText');
        } catch { /* noop */ }
      }
    };
  }, [shieldScreen, showBlocked]);

  return <div className="trial-protection" data-trial-mode="true">
    <div className="trial-protection-content">{children}</div>

    <div className="trial-watermark" aria-hidden="true">
      {Array.from({ length: 12 }, (_, index) => <span key={index}>{watermark}</span>)}
    </div>

    <aside className="trial-mode-banner" aria-label="Modo teste">
      <span className="trial-mode-icon"><LockKeyhole size={16}/></span>
      <span><strong>Modo teste</strong><small>Captura, cópia, impressão, exportação e compartilhamento protegidos.</small></span>
      <Link href="/assinaturas">Assine agora</Link>
    </aside>

    <div className="trial-screen-shield" aria-hidden="true">
      <ShieldAlert size={34}/><strong>Conteúdo protegido</strong><span>Captura de tela indisponível no modo teste.</span>
    </div>

    <div className="trial-print-block" aria-hidden="true">
      <strong>CRM PLUS Store</strong><p>Impressão indisponível no modo teste. Ative sua assinatura para liberar esta função.</p>
    </div>

    {notice && <div className="trial-blocked-toast" role="alert">
      <ShieldAlert size={19}/><span><strong>Modo teste</strong>{notice}</span><Link href="/assinaturas">Assine agora</Link><button type="button" aria-label="Fechar aviso" onClick={() => setNotice('')}><X size={16}/></button>
    </div>}
  </div>;
}
