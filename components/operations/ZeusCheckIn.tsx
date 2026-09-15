'use client';

import { useEffect } from 'react';
import type { Workspace } from '@/lib/operations/storage';
import { ZeusCheckIn as ZeusCheckInBase } from './ZeusCheckInBase';

export function ZeusCheckIn({ w }: { w: Workspace }) {
  useEffect(() => {
    const apply = () => {
      document.querySelectorAll<HTMLElement>('.zeus-checkin-row').forEach(row => {
        const button = Array.from(row.querySelectorAll<HTMLButtonElement>('button')).find(item =>
          item.textContent?.includes('Gerar link / QR') || item.textContent?.includes('Gerando')
        );
        if (button) {
          button.disabled = true;
          button.style.display = 'none';
        }
      });
      const lead = document.querySelector<HTMLElement>('.zeus-checkin-lead');
      if (lead) lead.textContent = 'O checklist agora é habilitado e escolhido dentro da OS, na etapa Identificação. Esta tela acompanha as respostas e mantém a configuração padrão.';
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { subtree: true, childList: true });
    return () => observer.disconnect();
  }, []);

  return <ZeusCheckInBase w={w} />;
}
