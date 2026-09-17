'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Workspace } from '@/lib/operations/storage';
import { activeJob, localDay } from '@/lib/operations/model';
import { ZEUS_HOME_COUNTERS_KEY } from './ProfileMenu';

type Target = { id: string; node: HTMLElement };

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
        if (!id || !head) return;

        section.classList.add('zeus-home-section');
        if (!section.dataset.zeusHomeInitialized) {
          section.dataset.zeusHomeInitialized = '1';
          const toggle = section.querySelector<HTMLButtonElement>('.op-section-toggle');
          if (toggle && section.classList.contains('is-open')) {
            autoCollapsing = true;
            toggle.click();
            autoCollapsing = false;
          }
        }

        if (id === 'working') head.querySelector<HTMLElement>(':scope > .op-muted')?.classList.add('zeus-home-legacy-count');
        found.push({ id, node: head });
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
    return () => { observer.disconnect(); window.removeEventListener('zeus-home-counters-change', onCounters as EventListener); document.removeEventListener('click', onClick); };
  }, [page, meta]);

  if (page !== 'inicio' || !enabled) return null;
  return <>{targets.map(target => {
    const value = meta[target.id];
    if (!value) return null;
    const isNew = value.count > 0 && !!value.signature && read[target.id] !== value.signature;
    return createPortal(<span className="zeus-home-section-meta" key={target.id}><b>{value.count}</b>{isNew && <i>Novo</i>}</span>, target.node);
  })}<style jsx global>{`
    .zeus-home-section-meta{margin-left:auto;display:flex;align-items:center;gap:6px;flex-shrink:0}
    .zeus-home-section-meta b{min-width:28px;height:28px;padding:0 8px;display:grid;place-items:center;border-radius:999px;background:color-mix(in srgb,var(--op-accent) 13%,var(--op-paper));color:var(--op-accent);font-size:12px;font-weight:700}
    .zeus-home-section-meta i{padding:4px 7px;border-radius:6px;background:var(--op-accent);color:var(--op-on-accent);font-size:10px;font-style:normal;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
    .op-section.is-open>.op-section-head>.zeus-home-section-meta,.zeus-home-legacy-count{display:none!important}

    .zeus-home-section.is-closed{position:relative;padding:0 16px;margin-bottom:10px;border-radius:10px;box-shadow:none}
    .zeus-home-section.is-closed>.op-section-head{min-height:60px;margin:0;gap:10px;flex-wrap:nowrap}
    .zeus-home-section.is-closed>.op-section-head h2{flex:1;min-width:0;margin:0;font-size:16px;line-height:1.25}
    .zeus-home-section.is-closed .op-section-toggle{display:flex;align-items:center;width:100%;min-height:60px;padding:0 40px 0 0;border:0;background:transparent;color:var(--op-ink);text-align:left;font:inherit;font-weight:650}
    .zeus-home-section.is-closed .op-section-toggle span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .zeus-home-section.is-closed .op-section-toggle svg{position:absolute;right:16px;top:50%;margin:0;transform:translateY(-50%);color:var(--op-muted)}
    .zeus-home-section.is-closed>.op-section-head>.op-text-link{display:none}
    .zeus-home-section.is-closed>.op-section-head>.zeus-home-section-meta{margin-left:0;margin-right:30px}

    .zeus-home-section.is-open>.op-section-head .op-section-toggle svg{transform:rotate(180deg)}

    @media(max-width:720px){
      .zeus-home-section.is-closed{padding:0 14px;margin-bottom:9px;border-radius:9px}
      .zeus-home-section.is-closed>.op-section-head,.zeus-home-section.is-closed .op-section-toggle{min-height:56px}
      .zeus-home-section.is-closed>.op-section-head h2{font-size:15px}
      .zeus-home-section.is-closed .op-section-toggle{padding-right:36px}
      .zeus-home-section.is-closed .op-section-toggle svg{right:14px;width:17px;height:17px}
      .zeus-home-section.is-closed>.op-section-head>.zeus-home-section-meta{margin-right:26px}
      .zeus-home-section-meta b{min-width:26px;height:26px;padding:0 7px}
    }
  `}</style></>;
}
