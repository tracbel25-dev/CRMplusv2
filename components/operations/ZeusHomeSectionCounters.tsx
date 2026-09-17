'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Workspace } from '@/lib/operations/storage';
import { activeJob, localDay } from '@/lib/operations/model';
import { ZEUS_HOME_COUNTERS_KEY } from './ProfileMenu';

type Target = { id: string; node: HTMLButtonElement };

const titleToId: Record<string, string> = {
  'Agendamentos de hoje': 'today',
  'Aguardando checklist': 'checklist',
  'Aguardando aprovação': 'approval',
  'Aguardando diagnóstico': 'diagnosis',
  'Parados / dependências': 'blocked',
  'Em trabalho': 'working',
  'Próximos atendimentos': 'next',
};

export function ZeusHomeSectionCounters({ w, page }: { w: Workspace; page: string }) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [read, setRead] = useState<Record<string, string>>({});
  const today = localDay();

  const meta = useMemo(() => {
    const todayAppointments = w.data.appointments.filter(item => item.at.slice(0, 10) === today && item.status === 'Agendado');
    const nextAppointments = w.data.appointments.filter(item => item.at.slice(0, 10) > today && item.status === 'Agendado');
    const groups = {
      today: todayAppointments,
      checklist: w.data.jobs.filter(job => job.status === 'Aguardando checklist'),
      approval: w.data.jobs.filter(job => job.status === 'Aguardando aprovação'),
      diagnosis: w.data.jobs.filter(job => job.status === 'Aguardando diagnóstico'),
      blocked: w.data.jobs.filter(job => ['Aguardando peça', 'Pausado'].includes(job.status)),
      working: w.data.jobs.filter(job => activeJob(job) && !['Aguardando checklist', 'Aguardando aprovação', 'Aguardando diagnóstico', 'Aguardando peça', 'Pausado'].includes(job.status)),
      next: nextAppointments,
    } as Record<string, Array<{ id: string; createdAt?: string; at?: string }>>;
    return Object.fromEntries(Object.entries(groups).map(([id, items]) => [id, { count: items.length, signature: items.map(item => `${item.id}:${item.createdAt || item.at || ''}`).sort().join('|') }])) as Record<string, { count: number; signature: string }>;
  }, [w.data.appointments, w.data.jobs, today]);

  useEffect(() => {
    if (page !== 'inicio') return;
    let autoCollapsing = false;
    const loadRead = () => {
      const next: Record<string, string> = {};
      Object.keys(titleToId).forEach(title => {
        const id = titleToId[title];
        next[id] = localStorage.getItem(`crmplus:zeus:home-read:${id}`) || '';
      });
      setRead(next);
      setEnabled(localStorage.getItem(ZEUS_HOME_COUNTERS_KEY) !== '0');
    };
    loadRead();

    const discover = () => {
      const found: Target[] = [];
      document.querySelectorAll<HTMLElement>('.op-section').forEach(section => {
        const title = section.querySelector<HTMLElement>('.op-section-head h2')?.textContent?.trim() || '';
        const id = titleToId[title];
        const head = section.querySelector<HTMLElement>('.op-section-head');
        const toggle = section.querySelector<HTMLButtonElement>('.op-section-toggle');
        if (!id || !head || !toggle) return;

        section.classList.add('zeus-home-section');
        if (!section.dataset.zeusHomeInitialized) {
          section.dataset.zeusHomeInitialized = '1';
          if (section.classList.contains('is-open')) {
            autoCollapsing = true;
            toggle.click();
            autoCollapsing = false;
          }
        }

        if (id === 'working') head.querySelector<HTMLElement>(':scope > .op-muted')?.classList.add('zeus-home-legacy-count');
        found.push({ id, node: toggle });
      });
      setTargets(found);
    };

    discover();
    const observer = new MutationObserver(discover);
    observer.observe(document.getElementById('op-main') || document.body, { childList: true, subtree: true });

    const onCounters = (event: Event) => setEnabled((event as CustomEvent<boolean>).detail !== false);
    const onClick = (event: MouseEvent) => {
      if (autoCollapsing) return;
      const toggle = (event.target as Element | null)?.closest('.op-section-toggle');
      const section = toggle?.closest<HTMLElement>('.op-section');
      if (!section?.classList.contains('is-closed')) return;
      const title = section.querySelector<HTMLElement>('.op-section-head h2')?.textContent?.trim() || '';
      const id = titleToId[title];
      const signature = id ? meta[id]?.signature : '';
      if (!id || !signature) return;
      localStorage.setItem(`crmplus:zeus:home-read:${id}`, signature);
      setRead(current => ({ ...current, [id]: signature }));
    };

    window.addEventListener('zeus-home-counters-change', onCounters as EventListener);
    document.addEventListener('click', onClick);
    return () => {
      observer.disconnect();
      window.removeEventListener('zeus-home-counters-change', onCounters as EventListener);
      document.removeEventListener('click', onClick);
    };
  }, [page, meta]);

  if (page !== 'inicio' || !enabled) return null;
  return <>{targets.map(target => {
    const value = meta[target.id];
    if (!value) return null;
    const isNew = value.count > 0 && !!value.signature && read[target.id] !== value.signature;
    return createPortal(<span className="zeus-home-section-meta" key={target.id}><b>{value.count}</b>{isNew && <i>Novo</i>}</span>, target.node);
  })}</>;
}
