'use client';

import { useEffect, useState } from 'react';
import { ArrowDownAZ, ArrowUpAZ, Check, ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
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
  const [draftDescending, setDraftDescending] = useState(descending);
  const [filterSearch, setFilterSearch] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setDraftActive(active);
    setDraftSort(sort);
    setDraftDescending(descending);
    setFilterSearch({});
  }, [open, active, sort, descending]);

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
  const apply = () => {
    onActive(draftActive);
    onSort(draftSort);
    onDescending(draftDescending);
    setOpen(false);
  };

  return <>
    <div className="zeus-filter-bar zeus-filter-bar-unified">
      <div className="zeus-filter-search-main"><SearchBox value={query} onChange={onQuery} placeholder={placeholder}/></div>
      <button type="button" className={`zeus-filter-all-trigger${activeCount ? ' has-active' : ''}`} onClick={() => setOpen(true)} aria-label="Abrir filtros">
        <SlidersHorizontal size={17}/><span>Filtros</span>{activeCount > 0 && <b>{activeCount}</b>}
      </button>
    </div>

    {open && <div className="zeus-filter-modal-layer" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="zeus-filter-modal" role="dialog" aria-modal="true" aria-label="Filtros">
        <header>
          <div><h2>Filtros</h2><small>Organize e refine os resultados</small></div>
          <button className="op-icon" type="button" aria-label="Fechar" onClick={() => setOpen(false)}><X size={19}/></button>
        </header>

        <div className="zeus-filter-modal-scroll">
          <section className="zeus-filter-sort-section">
            <strong>Classificação</strong>
            <div className="zeus-filter-sort-row">
              <select aria-label="Classificar por" value={draftSort} onChange={event => setDraftSort(event.target.value)}>
                {sortOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <div className="zeus-filter-direction" aria-label="Direção da classificação">
                <button type="button" className={!draftDescending ? 'active' : ''} aria-label="Crescente" title="Crescente" onClick={() => setDraftDescending(false)}><ArrowUpAZ size={18}/></button>
                <button type="button" className={draftDescending ? 'active' : ''} aria-label="Decrescente" title="Decrescente" onClick={() => setDraftDescending(true)}><ArrowDownAZ size={18}/></button>
              </div>
            </div>
          </section>

          {definitions.length > 0 && <div className="zeus-filter-groups">{definitions.map(definition => {
            const search = filterSearch[definition.key] || '';
            const visible = definition.options.filter(option => !search.trim() || option.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')));
            const selected = draftActive[definition.key] || [];
            return <details key={definition.key} className="zeus-filter-group" open={selected.length > 0 ? true : undefined}>
              <summary><span>{definition.label}</span><span className="zeus-filter-group-meta">{selected.length > 0 && <b>{selected.length}</b>}<ChevronDown size={17}/></span></summary>
              <div className="zeus-filter-group-body">
                {definition.options.length > 7 && <label className="zeus-filter-option-search"><Search size={15}/><input value={search} onChange={event => setFilterSearch(current => ({ ...current, [definition.key]: event.target.value }))} placeholder={`Buscar ${definition.label.toLocaleLowerCase('pt-BR')}`}/></label>}
                <div className="zeus-filter-options">{visible.map(option => <label key={option} className={selected.includes(option) ? 'selected' : ''}>
                  <input type="checkbox" checked={selected.includes(option)} onChange={() => toggle(definition.key, option)}/><span>{option}</span>{selected.includes(option) && <Check size={15}/>} 
                </label>)}{!visible.length && <p className="op-muted">Nenhuma opção encontrada.</p>}</div>
              </div>
            </details>;
          })}</div>}
        </div>

        <footer>
          <button type="button" className="op-button secondary" onClick={() => setDraftActive({})}>Limpar</button>
          <Button onClick={apply}>Aplicar filtros</Button>
        </footer>
      </section>
    </div>}

    <style jsx global>{`
      .zeus-filter-bar-unified{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;align-items:center!important;gap:8px!important;width:100%!important;margin:0 0 16px!important}
      .zeus-filter-search-main{min-width:0}.zeus-filter-search-main>.op-search{width:100%!important;min-width:0!important;max-width:none!important;margin:0!important;height:42px}
      .zeus-filter-all-trigger{height:42px;display:flex;align-items:center;justify-content:center;gap:8px;padding:0 13px;border:1px solid var(--op-line);border-radius:10px;background:var(--op-paper);color:var(--op-ink);font:inherit;font-weight:750;cursor:pointer;white-space:nowrap}
      .zeus-filter-all-trigger.has-active{border-color:color-mix(in srgb,var(--op-accent) 45%,var(--op-line));background:color-mix(in srgb,var(--op-accent) 5%,var(--op-paper))}
      .zeus-filter-all-trigger b{min-width:21px;height:21px;display:grid;place-items:center;border-radius:999px;background:var(--op-accent);color:var(--op-on-accent);font-size:11px}

      .zeus-filter-modal-layer{position:fixed;inset:0;z-index:12000;display:grid;place-items:center;padding:20px;background:rgba(6,11,20,.52);backdrop-filter:blur(2px)}
      .zeus-filter-modal{width:min(560px,100%);max-height:min(82vh,720px);display:grid;grid-template-rows:auto minmax(0,1fr) auto;overflow:hidden;border:1px solid var(--op-line);border-radius:15px;background:var(--op-paper);box-shadow:0 24px 80px rgba(0,0,0,.28);color:var(--op-ink)}
      .zeus-filter-modal>header,.zeus-filter-modal>footer{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:15px 17px}
      .zeus-filter-modal>header{border-bottom:1px solid var(--op-line)}.zeus-filter-modal>footer{border-top:1px solid var(--op-line)}
      .zeus-filter-modal>header>div{display:grid;gap:1px}.zeus-filter-modal h2{margin:0;font-size:19px}.zeus-filter-modal header small{color:var(--op-muted);font-size:12px}
      .zeus-filter-modal-scroll{overflow:auto;padding:16px 17px;overscroll-behavior:contain}

      .zeus-filter-sort-section{display:grid;gap:9px;padding-bottom:16px}.zeus-filter-sort-section>strong{font-size:13px}
      .zeus-filter-sort-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center}
      .zeus-filter-sort-row>select{height:42px;width:100%;min-width:0;border:1px solid var(--op-line);border-radius:9px;background:var(--op-paper);color:var(--op-ink);padding:0 10px}
      .zeus-filter-direction{display:grid;grid-template-columns:repeat(2,40px);overflow:hidden;border:1px solid var(--op-line);border-radius:9px;background:var(--op-soft)}
      .zeus-filter-direction button{width:40px;height:40px;display:grid;place-items:center;border:0;border-left:1px solid var(--op-line);background:transparent;color:var(--op-muted);cursor:pointer}.zeus-filter-direction button:first-child{border-left:0}
      .zeus-filter-direction button.active{background:var(--op-paper);color:var(--op-accent)}

      .zeus-filter-groups{display:grid;border-top:1px solid var(--op-line)}
      .zeus-filter-group{border:0;border-bottom:1px solid var(--op-line)}
      .zeus-filter-group summary{min-height:50px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 2px;cursor:pointer;list-style:none;font-weight:750}
      .zeus-filter-group summary::-webkit-details-marker{display:none}.zeus-filter-group-meta{display:flex;align-items:center;gap:8px;color:var(--op-muted)}
      .zeus-filter-group summary b{min-width:21px;height:21px;display:grid;place-items:center;border-radius:999px;background:var(--op-tint);color:var(--op-accent);font-size:11px}
      .zeus-filter-group summary svg{transition:transform .15s ease}.zeus-filter-group[open] summary svg{transform:rotate(180deg)}
      .zeus-filter-group-body{display:grid;gap:9px;padding:0 0 12px}
      .zeus-filter-option-search{display:flex;align-items:center;gap:8px;padding:0 10px;border:1px solid var(--op-line);border-radius:9px;color:var(--op-muted)}
      .zeus-filter-option-search input{width:100%;height:38px;border:0!important;outline:0!important;background:transparent!important;color:var(--op-ink)!important;padding:0!important}
      .zeus-filter-options{max-height:240px;overflow:auto;display:grid;gap:3px}
      .zeus-filter-options label{min-height:38px;display:flex;align-items:center;gap:9px;padding:6px 8px;border-radius:8px;cursor:pointer}.zeus-filter-options label:hover,.zeus-filter-options label.selected{background:var(--op-soft)}
      .zeus-filter-options label span{flex:1;min-width:0}.zeus-filter-options label>svg{color:var(--op-accent)}
      .zeus-filter-modal>footer .op-button{min-width:120px}

      @media(max-width:720px){
        .app-zeus .op-title>.op-actions{width:100%!important;display:flex!important;flex-wrap:wrap!important;gap:8px!important}
        .app-zeus .op-title>.op-actions>.op-button,.app-zeus .op-title>.op-actions>a.op-button{width:auto!important;flex:1 1 calc(50% - 4px)!important;min-width:0!important}
        .app-zeus .zeus-billing-summary{grid-template-columns:repeat(2,minmax(0,1fr))!important}
        .app-zeus .zeus-billing-summary>div+div{border-left:1px solid var(--op-line)!important;border-top:0!important}
        .app-zeus .zeus-billing-summary strong{font-size:clamp(19px,5.6vw,24px)!important}
        .zeus-filter-bar-unified{grid-template-columns:minmax(0,1fr) auto!important;gap:8px!important}
        .zeus-filter-all-trigger{grid-column:auto!important;width:auto!important;min-width:92px;padding:0 11px}
        .zeus-filter-modal-layer{place-items:end center;padding:0}.zeus-filter-modal{width:100%;max-height:90dvh;border-radius:16px 16px 0 0;border-bottom:0}
        .zeus-filter-modal-scroll{padding:14px 16px}.zeus-filter-modal>header,.zeus-filter-modal>footer{padding:14px 16px}
        .zeus-filter-sort-row{grid-template-columns:minmax(0,1fr) auto}.zeus-filter-modal>footer .op-button{flex:1;min-width:0}
      }
      @media(max-width:390px){.zeus-filter-all-trigger{min-width:48px;padding:0 12px}.zeus-filter-all-trigger>span{display:none}.zeus-filter-all-trigger b{position:absolute;margin:0 0 25px 30px}.zeus-filter-search-main>.op-search{padding-left:10px!important;padding-right:8px!important}}
    `}</style>
  </>;
}
