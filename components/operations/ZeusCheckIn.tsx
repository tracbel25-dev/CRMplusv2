'use client';

import { useEffect } from 'react';
import type { Workspace } from '@/lib/operations/storage';
import { ZeusCheckIn as ZeusCheckInBase } from './ZeusCheckInBase';

const CHECKLIST_LEAD = 'O checklist agora é habilitado e escolhido dentro da OS, na etapa Identificação. Esta tela acompanha as respostas e mantém a configuração padrão.';

export function ZeusCheckIn({ w }: { w: Workspace }) {
  useEffect(() => {
    const root = document.getElementById('op-main');
    if (!root) return;

    const apply = () => {
      root.querySelectorAll<HTMLElement>('.zeus-checkin-row').forEach(row => {
        const button = Array.from(row.querySelectorAll<HTMLButtonElement>('button')).find(item =>
          item.textContent?.includes('Gerar link / QR') || item.textContent?.includes('Gerando')
        );
        if (button) {
          button.disabled = true;
          button.hidden = true;
        }
      });

      const lead = root.querySelector<HTMLElement>('.zeus-checkin-lead');
      if (lead && lead.textContent !== CHECKLIST_LEAD) lead.textContent = CHECKLIST_LEAD;
    };

    apply();
    const observer = new MutationObserver(() => apply());
    observer.observe(root, { subtree: true, childList: true });
    return () => observer.disconnect();
  }, []);

  return <ZeusCheckInBase w={w} />;
}
