'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownAZ, ArrowUpAZ, Check, Funnel, Search } from 'lucide-react';
import { SearchBox } from './ui';

export type FilterDefinition = { key: string; label: string; options: string[] };
export type SortOption = { value: string; label: string };

type OpenPanel = { type: 'filter'; key: string } | null;

export function ZeusFilterBar({
  query, onQuery, definitions, active, onActive, placeholder = 'Buscar'
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
  const rootRef = useRef<HTMLDivElement>(null);
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [draftSelected, setDraftSelected] = useState<string[]>([]);
  const [optionSearch, setOptionSearch] = useState('');
  const [optionDescending, setOptionDescending] = useState(false);

  const currentDefinition = openPanel
    ? definitions.find(item => item.key === openPanel.key)
    : undefined;

  useEffect(() => {
    if (!openPanel) return;
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpenPanel(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [openPanel]);

  const openFilter = (definition: FilterDefinition) => {
    setDraftSelected(active[definition.key] || []);
    setOptionSearch('');
    setOptionDescending(false);
    setOpenPanel(current => current?.key === definition.key ? null : { type: 'filter', key: definition.key });
  };

  const visibleOptions = useMemo(() => {
    if (!currentDefinition) return [];
    const term = optionSearch.trim().toLocaleLowerCase('pt-BR');
    return currentDefinition.options
      .filter(option => !term || option.toLocaleLowerCase('pt-BR').includes(term))
      .sort((a, b) => optionDescending ? b.localeCompare(a, 'pt-BR') : a.localeCompare(b, 'pt-BR'));
  }, [currentDefinition, optionSearch, optionDescending]);

  const toggleOption = (value: string) => setDraftSelected(current => current.includes(value)
    ? current.filter(item => item !== value)
    : [...current, value]);

  const confirmFilter = () => {
    if (!currentDefinition) return;
    onActive({ ...active, [currentDefinition.key]: draftSelected });
    setOpenPanel(null);
  };

  const clearFilter = () => {
    if (!currentDefinition) return;
    onActive({ ...active, [currentDefinition.key]: [] });
    setDraftSelected([]);
    setOpenPanel(null);
  };

  return <div className="zeus-filter-shell" ref={rootRef}>
    <div className="zeus-filter-search-main">
      <SearchBox value={query} onChange={onQuery} placeholder={placeholder}/>
    </div>

    <div className="zeus-filter-column-bar" aria-label="Filtros">
      {definitions.map(definition => {
        const selected = active[definition.key] || [];
        const isOpen = openPanel?.key === definition.key;
        return <div className="zeus-filter-chip-wrap" key={definition.key}>
          <button type="button" className={`zeus-filter-chip${selected.length ? ' active' : ''}${isOpen ? ' open' : ''}`} onClick={() => openFilter(definition)}>
            <span>{definition.label}</span><Funnel size={14}/>{selected.length > 0 && <b>{selected.length}</b>}
          </button>
          {isOpen && currentDefinition && <section className="zeus-column-popover">
            <strong>{currentDefinition.label}</strong>
            <div className="zeus-option-sort-row">
              <button type="button" className={!optionDescending ? 'active' : ''} onClick={() => setOptionDescending(false)}><ArrowUpAZ size={16}/> A → Z</button>
              <button type="button" className={optionDescending ? 'active' : ''} onClick={() => setOptionDescending(true)}><ArrowDownAZ size={16}/> Z → A</button>
            </div>
            <label className="zeus-popover-search"><span>Filtrar</span><div><Search size={15}/><input value={optionSearch} onChange={event => setOptionSearch(event.target.value)} placeholder="Digite para filtrar"/></div></label>
            <small>Selecionar um ou mais</small>
            <div className="zeus-popover-options">{visibleOptions.map(option => <label key={option} className={draftSelected.includes(option) ? 'selected' : ''}>
              <input type="checkbox" checked={draftSelected.includes(option)} onChange={() => toggleOption(option)}/><span>{option}</span>{draftSelected.includes(option) && <Check size={14}/>} 
            </label>)}{!visibleOptions.length && <p>Nenhuma opção encontrada.</p>}</div>
            <footer><button type="button" className="secondary" onClick={clearFilter}>Limpar filtro</button><button type="button" className="primary" onClick={confirmFilter}>Confirmar</button></footer>
          </section>}
        </div>;
      })}
    </div>

    <style jsx global>{`
      .zeus-filter-shell{position:relative;z-index:40;display:grid;gap:10px;margin:0 0 16px;min-width:0;max-width:100%}
      .zeus-filter-search-main>.op-search{width:100%!important;max-width:none!important;margin:0!important;height:42px}
      .zeus-filter-column-bar{display:flex;align-items:center;gap:4px;width:100%;max-width:100%;min-width:0;box-sizing:border-box;overflow:visible;border:1px solid var(--op-line);border-radius:11px;background:var(--op-paper);padding:4px 6px}
      .zeus-filter-chip-wrap{position:relative;flex:1 1 0;min-width:0}
      .zeus-filter-chip{width:100%;min-width:0;min-height:34px;display:flex;align-items:center;justify-content:center;gap:6px;padding:0 9px;border:0;border-radius:8px;background:transparent;color:var(--op-muted);font:inherit;font-size:12px;font-weight:750;cursor:pointer;white-space:nowrap}
      .zeus-filter-chip span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .zeus-filter-chip svg{flex:0 0 auto}
      .zeus-filter-chip:hover,.zeus-filter-chip.open{background:var(--op-soft);color:var(--op-ink)}
      .zeus-filter-chip.active{color:var(--op-accent);background:color-mix(in srgb,var(--op-accent) 8%,var(--op-paper))}
      .zeus-filter-chip b{min-width:18px;height:18px;padding:0 5px;display:grid;place-items:center;border-radius:999px;background:var(--op-accent);color:var(--op-on-accent);font-size:10px}

      .zeus-column-popover{position:absolute;left:0;top:calc(100% + 7px);z-index:500;width:320px;display:grid;gap:10px;padding:12px;border:1px solid var(--op-line);border-radius:12px;background:var(--op-paper);color:var(--op-ink);box-shadow:0 18px 45px rgba(0,0,0,.2)}
      .zeus-filter-chip-wrap:nth-last-child(-n+2) .zeus-column-popover{left:auto;right:0}
      .zeus-column-popover>strong{font-size:13px}
      .zeus-column-popover>small{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--op-muted)}
      .zeus-option-sort-row{display:grid;grid-template-columns:1fr 1fr;gap:7px}
      .zeus-option-sort-row button{min-height:38px;display:flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--op-line);border-radius:8px;background:var(--op-paper);color:var(--op-muted);font:inherit;font-size:12px;cursor:pointer}
      .zeus-option-sort-row button.active{border-color:color-mix(in srgb,var(--op-accent) 45%,var(--op-line));color:var(--op-accent);background:color-mix(in srgb,var(--op-accent) 6%,var(--op-paper))}
      .zeus-popover-search{display:grid;gap:5px}.zeus-popover-search>span{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--op-muted)}
      .zeus-popover-search>div{height:39px;display:flex;align-items:center;gap:7px;padding:0 9px;border:1px solid var(--op-line);border-radius:8px;color:var(--op-muted)}
      .zeus-popover-search input{width:100%;height:36px;border:0!important;outline:0!important;background:transparent!important;color:var(--op-ink)!important;padding:0!important;font:inherit;font-size:12px}
      .zeus-popover-options{max-height:245px;overflow:auto;display:grid;gap:2px;border-top:1px solid var(--op-line);padding-top:5px}
      .zeus-popover-options label{min-height:34px;display:flex;align-items:center;gap:8px;padding:5px 7px;border-radius:7px;cursor:pointer;font-size:12px}
      .zeus-popover-options label:hover,.zeus-popover-options label.selected{background:var(--op-soft)}
      .zeus-popover-options label span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}.zeus-popover-options label svg{color:var(--op-accent)}
      .zeus-popover-options p{margin:8px 4px;color:var(--op-muted);font-size:12px}
      .zeus-column-popover footer{display:grid;grid-template-columns:1fr 1fr;gap:7px;padding-top:4px;border-top:1px solid var(--op-line)}
      .zeus-column-popover footer button{min-height:38px;border-radius:8px;font:inherit;font-size:12px;font-weight:750;cursor:pointer}
      .zeus-column-popover footer .secondary{border:1px solid var(--op-line);background:var(--op-paper);color:var(--op-muted)}
      .zeus-column-popover footer .primary{border:1px solid var(--op-accent);background:var(--op-accent);color:var(--op-on-accent)}

      @media(max-width:720px){
        .app-zeus .op-title>.op-actions{width:100%!important;display:flex!important;flex-wrap:nowrap!important;gap:8px!important}
        .app-zeus .op-title>.op-actions>.op-button,.app-zeus .op-title>.op-actions>a.op-button{width:auto!important;flex:1 1 0!important;min-width:0!important}
        .app-zeus .zeus-billing-summary{grid-template-columns:repeat(2,minmax(0,1fr))!important}
        .app-zeus .zeus-billing-summary>div+div{border-left:1px solid var(--op-line)!important;border-top:0!important}
        .zeus-filter-column-bar{overflow-x:auto;overflow-y:hidden;scrollbar-width:none}.zeus-filter-column-bar::-webkit-scrollbar{display:none}
        .zeus-filter-chip-wrap{flex:0 0 auto;min-width:auto}
        .zeus-filter-chip{width:auto;justify-content:flex-start}
        .zeus-filter-chip span{overflow:visible;text-overflow:clip}
        .zeus-column-popover,.zeus-filter-chip-wrap:nth-last-child(-n+2) .zeus-column-popover{position:fixed;left:12px;right:12px;top:auto;bottom:12px;width:auto;max-height:min(72dvh,560px)}
        .zeus-popover-options{max-height:36dvh}
      }
    `}</style>
  </div>;
}
