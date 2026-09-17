'use client';

import { useEffect } from 'react';

export function ZeusNativeDatalistPolicy() {
  useEffect(() => {
    const sanitize = (root: ParentNode) => {
      root.querySelectorAll<HTMLInputElement>('input[list]').forEach(input => {
        const list = input.getAttribute('list');
        if (!list) return;
        input.dataset.zeusNativeList = list;
        input.removeAttribute('list');
      });
    };

    const app = document.querySelector('.app-zeus');
    if (!app) return;
    sanitize(app);

    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.target instanceof HTMLInputElement) {
          if (mutation.target.hasAttribute('list')) sanitize(mutation.target.parentElement || app);
          continue;
        }
        mutation.addedNodes.forEach(node => {
          if (!(node instanceof Element)) return;
          if (node instanceof HTMLInputElement && node.hasAttribute('list')) {
            const list = node.getAttribute('list');
            if (list) {
              node.dataset.zeusNativeList = list;
              node.removeAttribute('list');
            }
          }
          sanitize(node);
        });
      }
    });

    observer.observe(app, { subtree: true, childList: true, attributes: true, attributeFilter: ['list'] });
    return () => observer.disconnect();
  }, []);

  return null;
}
