'use client';

import { useEffect, useState } from 'react';
import { ArrowDownAZ, ArrowUpAZ, Check, Filter, Search, SlidersHorizontal, X } from 'lucide-react';
import { Button, SearchBox } from './ui';

export type FilterDefinition = { key: string; label: string; options: string[] };
export type SortOption = { value: string; label: string };

export function ZeusFilterBar({
  query, onQuery, definitions, active, onActive, sort, sortOptions, descending, onSort, onDescending, placeholder = 'Buscar'
}: {
  query: string;
  onQuery: (value: string) => void;
  definitions: FilterDefinition[];
  active: Record<string, string[]>;
  onActive: (value: Record<string, string[]>) => void;
  sort: string;
  sortOptions: SortOption[];
  descending: boolean;
  onSort: (value: string) => void;
  onDescending: (value: boolean) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draftActive, setDraftActive] = useState<Record<string, string[]>>(active);
  const [draftSort, setDraftSort] = useState(sort);
  const [filterSearch, setFilterSearch] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setDraftActive(active);
    setDraftSort(sort);
    setFilterSearch({});
  }, [open, active, sort]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  const activeCount = Object.values(active).reduce((sum, values) => sum + values.length, 0);
  const toggle = (key: string, value: string) => setDraftActive(current => {
    const selected = current[key] || [];
    return { ...current, [key]: selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value] };
  });
  const apply = () => { onActive(draftActive); onSort(draftSort); setOpen(false); };

  return <>
    <div className="zeus-filter-bar zeus-filter-bar-unified">
      <div className="zeus-sort-direction-inline" aria-label="Direção da classificação">
        <button type="button" className={!descending ? 'active' : ''} aria-label="Classificar crescente" title="Crescente" onClick={() => onDescending(false)}><ArrowUpAZ size={18}/></button>
        <button type="button" className={descending ? 'active' : ''} aria-label="Classificar decrescente" title="Decrescente" onClick={() => onDescending(true)}><ArrowDownAZ size={18}/></button>
      </div>
      <div className="zeus-filter-search-main"><SearchBox value={query} onChange={onQuery} placeholder={placeholder}/></div>
      <button type="button" className={`zeus-filter-all-trigger${activeCount ? ' has-active' : ''}`} onClick={() => setOpen(true)}><SlidersHorizontal size={17}/><span>Classificar e filtrar</span>{activeCount > 0 && <b>{activeCount}</b>}</button>
    </div>

    {activeCount > 0 && <div className="zeus-filter-summary"><Filter size={14}/><span>{activeCount} filtro(s) ativo(s)</span><button type="button" onClick={() => onActive({})}>Limpar</button></div>}

    {open && <div className="zeus-filter-modal-layer" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="zeus-filter-modal" role="dialog" aria-modal="true" aria-label="Classificar e filtrar resultados">
        <header><div><small>Organizar resultados</small><h2>Classificar e filtrar</h2></div><button className="op-icon" type="button" aria-label="Fechar" onClick={() => setOpen(false)}><X size={19}/></button></header>
        <div className="zeus-filter-modal-scroll">
          <div className="zeus-filter-sort-section"><strong>Classificar por</strong><div className="zeus-filter-sort-options">{sortOptions.map(option => <button type="button" key={option.value} className={draftSort === option.value ? 'active' : ''} onClick={() => setDraftSort(option.value)}><span>{option.label}</span>{draftSort === option.value && <Check size={16}/>}</button>)}</div></div>
          {definitions.length > 0 && <div className="zeus-filter-groups">{definitions.map(definition => {
            const search = filterSearch[definition.key] || '';
            const visible = definition.options.filter(option => !search.trim() || option.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')));
            const selected = draftActive[definition.key] || [];
            return <details key={definition.key} className="zeus-filter-group"><summary><span>{definition.label}</span>{selected.length > 0 && <b>{selected.length}</b>}</summary><div className="zeus-filter-group-body">
              {definition.options.length > 7 && <label className="zeus-filter-search"><Search size={15}/><input value={search} onChange={event => setFilterSearch(current => ({ ...current, [definition.key]: event.target.value }))} placeholder={`Buscar ${definition.label.toLocaleLowerCase('pt-BR')}`}/></label>}
              <div className="zeus-filter-options">{visible.map(option => <label key={option} className={selected.includes(option) ? 'selected' : ''}><input type="checkbox" checked={selected.includes(option)} onChange={() => toggle(definition.key, option)}/><span>{option}</span>{selected.includes(option) && <Check size={15}/>}</label>)}{!visible.length && <p className="op-muted">Nenhuma opção encontrada.</p>}</div>
            </div></details>;
          })}</div>}
        </div>
        <footer><button type="button" className="op-text-link" onClick={() => setDraftActive({})}>Limpar filtros</button><Button onClick={apply}>Aplicar</Button></footer>
      </section>
    </div>}

    <style jsx global>{`
      .zeus-filter-bar-unified{display:grid!important;grid-template-columns:auto minmax(180px,1fr) auto!important;align-items:center!important;gap:10px!important;width:100%!important}.zeus-sort-direction-inline{display:flex;gap:6px}.zeus-sort-direction-inline button{width:42px;height:42px;display:grid;place-items:center;border:1px solid var(--op-line);border-radius:10px;background:var(--op-paper);color:var(--op-muted);cursor:pointer}.zeus-sort-direction-inline button.active{color:var(--op-accent);border-color:color-mix(in srgb,var(--op-accent) 45%,var(--op-line));background:color-mix(in srgb,var(--op-accent) 8%,var(--op-paper))}.zeus-filter-all-trigger{height:42px;display:flex;align-items:center;justify-content:center;gap:8px;padding:0 14px;border:1px solid var(--op-line);border-radius:10px;background:var(--op-paper);color:var(--op-ink);font:inherit;font-weight:750;cursor:pointer;white-space:nowrap}.zeus-filter-all-trigger.has-active{border-color:color-mix(in srgb,var(--op-accent) 45%,var(--op-line))}.zeus-filter-all-trigger b{min-width:22px;height:22px;display:grid;place-items:center;border-radius:999px;background:var(--op-accent);color:white;font-size:12px}.zeus-filter-summary{display:flex;align-items:center;gap:7px;margin:-2px 0 12px;color:var(--op-muted);font-size:13px}.zeus-filter-summary button{border:0;background:transparent;color:var(--op-accent);font:inherit;font-weight:800;cursor:pointer}
      .zeus-filter-modal-layer{position:fixed;inset:0;z-index:12000;display:grid;place-items:center;padding:20px;background:rgba(6,11,20,.58);backdrop-filter:blur(3px)}.zeus-filter-modal{width:min(620px,100%);max-height:min(82vh,760px);display:grid;grid-template-rows:auto minmax(0,1fr) auto;overflow:hidden;border:1px solid var(--op-line);border-radius:16px;background:var(--op-paper);box-shadow:0 26px 90px rgba(0,0,0,.32);color:var(--op-ink)}.zeus-filter-modal>header,.zeus-filter-modal>footer{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 18px}.zeus-filter-modal>header{border-bottom:1px solid var(--op-line)}.zeus-filter-modal>footer{border-top:1px solid var(--op-line)}.zeus-filter-modal h2{margin:2px 0 0;font-size:20px}.zeus-filter-modal header small{color:var(--op-muted)}.zeus-filter-modal-scroll{overflow:auto;padding:16px 18px;overscroll-behavior:contain}.zeus-filter-sort-section{display:grid;gap:10px}.zeus-filter-sort-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.zeus-filter-sort-options button{min-height:42px;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 11px;border:1px solid var(--op-line);border-radius:10px;background:var(--op-paper);color:var(--op-ink);font:inherit;text-align:left;cursor:pointer}.zeus-filter-sort-options button.active{border-color:var(--op-accent);background:color-mix(in srgb,var(--op-accent) 8%,var(--op-paper));color:var(--op-accent);font-weight:800}.zeus-filter-groups{display:grid;gap:8px;margin-top:18px}.zeus-filter-group{border:1px solid var(--op-line);border-radius:11px;overflow:hidden}.zeus-filter-group summary{min-height:48px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 13px;cursor:pointer;list-style:none;font-weight:800}.zeus-filter-group summary::-webkit-details-marker{display:none}.zeus-filter-group summary b{min-width:22px;height:22px;display:grid;place-items:center;border-radius:999px;background:color-mix(in srgb,var(--op-accent) 15%,var(--op-paper));color:var(--op-accent);font-size:12px}.zeus-filter-group[open] summary{border-bottom:1px solid var(--op-line)}.zeus-filter-group-body{display:grid;gap:10px;padding:12px}.zeus-filter-options{max-height:260px;overflow:auto;display:grid;gap:5px}.zeus-filter-options label{min-height:38px;display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:8px;cursor:pointer}.zeus-filter-options label:hover,.zeus-filter-options label.selected{background:color-mix(in srgb,var(--op-accent) 8%,var(--op-paper))}.zeus-filter-options label span{flex:1}.zeus-filter-search{display:flex;align-items:center;gap:8px;padding:0 10px;border:1px solid var(--op-line);border-radius:9px}.zeus-filter-search input{width:100%;height:38px;border:0!important;outline:0;background:transparent!important;color:var(--op-ink)!important}
      @media(max-width:720px){.zeus-filter-bar-unified{grid-template-columns:auto 1fr!important}.zeus-filter-all-trigger{grid-column:1/-1;width:100%}.zeus-filter-modal-layer{place-items:end center;padding:0}.zeus-filter-modal{width:100%;max-height:88vh;border-radius:18px 18px 0 0}.zeus-filter-sort-options{grid-template-columns:1fr}.zeus-filter-modal-scroll{padding:14px}.zeus-filter-modal>header,.zeus-filter-modal>footer{padding:14px}}@media(max-width:430px){.zeus-sort-direction-inline button{width:38px}.zeus-filter-search-main{min-width:0}}
    `}</style>
  </>;
}
