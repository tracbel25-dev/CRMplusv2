'use client';

import { useEffect } from 'react';

function normalize(value: string) {
  return value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function toneFor(label: string) {
  const value = normalize(label.trim());
  if (!value) return '';
  if (/(cancelad|reprovad|recusad|expirad|vencid|falha)/.test(value)) return 'danger';
  if (/(aguardando|pendente|pausad|atrasad|vence hoje)/.test(value)) return 'warning';
  if (/(encerrad|concluid|pago|baixad|aprova|faturad|salvo|ativo)/.test(value)) return 'success';
  if (/(em andamento|em execucao|aberto|enviado|pronto para retirada)/.test(value)) return 'info';
  return '';
}

function tagBadge(badge: Element) {
  if (!(badge instanceof HTMLElement) || !badge.classList.contains('op-badge')) return;
  const tone = toneFor(badge.textContent || '');
  if (tone) badge.dataset.operatorTone = tone;
  else delete badge.dataset.operatorTone;
}

function scan(root: ParentNode) {
  if (root instanceof Element && root.matches('.app-zeus .op-badge')) tagBadge(root);
  root.querySelectorAll?.('.app-zeus .op-badge').forEach(tagBadge);
}

export function ZeusOperatorPolish({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    scan(document);
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') {
          const badge = record.target.parentElement?.closest('.app-zeus .op-badge');
          if (badge) tagBadge(badge);
          continue;
        }
        record.addedNodes.forEach(node => {
          if (node instanceof Element) scan(node);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [enabled]);

  return null;
}
