'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownAZ, ArrowUpAZ, Check, Funnel, Search, X } from 'lucide-react';
import { SearchBox } from './ui';

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
  const rootRef = useRef<HTMLDivElement>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState('');
  const [draftSelected, setDraftSelected] = useState<string[]>([]);
  const [optionSearch, setOptionSearch] = useState('');
  const [optionDescending, setOptionDescending] = useState(false);

  const currentDefinition = definitions.find(item => item.key === selectedKey) || definitions[0];
  const activeKeys = definitions.filter(definition => (active[definition.key] || []).length > 0);
  const activeCount = activeKeys.reduce((sum, definition) => sum + (active[definition.key] || []).length, 0);

  useEffect(() => {
    if (!filterOpen) return;
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setFilterOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [filterOpen]);

  useEffect(() => {
    if (!definitions.length) {
      setSelectedKey('');
      setDraftSelected([]);
      return;
    }
    if (!definitions.some(item => item.key === selectedKey)) {
      setSelectedKey(definitions[0].key);
      setDraftSelected(active[definitions[0].key] || []);
    }
  }, [definitions, selectedKey, active]);

  const openFilters = () => {
    const key = currentDefinition?.key || definitions[0]?.key || '';
    setSelectedKey(key);
    setDraftSelected(key ? active[key] || [] : []);
    setOptionSearch('');
    setOptionDescending(false);
    setFilterOpen(current => !current);
  };

  const chooseDefinition = (definition: FilterDefinition) => {
    setSelectedKey(definition.key);
    setDraftSelected(active[definition.key] || []);
    setOptionSearch('');
    setOptionDescending(false);
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
  };

  const clearCurrent = () => {
    if (!currentDefinition) return;
    onActive({ ...active, [currentDefinition.key]: [] });
    setDraftSelected([]);
  };

  const clearKey = (key: string) => onActive({ ...active, [key]: [] });

  return <div className="zeus-filter-shell" ref={rootRef}>
    <div className="zeus-filter-toolbar">
      <div className="zeus-filter-search-main">
        <SearchBox value={query} onChange={onQuery} placeholder={placeholder}/>
      </div>

      <div className="zeus-sort-control">
        <select aria-label="Ordenar atendimentos" value={sort} onChange={event => onSort(event.target.value)}>
          {sortOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <button type="button" title={descending ? 'Mais recentes primeiro' : 'Mais antigos primeiro'} aria-label={descending ? 'Ordem decrescente' : 'Ordem crescente'} onClick={() => onDescending(!descending)}>
          {descending ? <ArrowDownAZ size={17}/> : <ArrowUpAZ size={17}/>}
        </button>
      </div>

      <button type="button" className={`zeus-filter-trigger${activeCount ? ' active' : ''}`} onClick={openFilters} aria-expanded={filterOpen}>
        <Funnel size={16}/><span>Filtros</span>{activeCount > 0 && <b>{activeCount}</b>}
      </button>
    </div>

    {activeKeys.length > 0 && <div className="zeus-active-filters">
      {activeKeys.map(definition => <button type="button" key={definition.key} onClick={() => clearKey(definition.key)} title="Remover filtro">
        <span>{definition.label}</span><strong>{(active[definition.key] || []).join(', ')}</strong><X size={13}/>
      </button>)}
      <button type="button" className="clear-all" onClick={() => onActive({})}>Limpar todos</button>
    </div>}

    {filterOpen && currentDefinition && <section className="zeus-filter-popover">
      <header>
        <div><span>Filtrar atendimentos</span><strong>{currentDefinition.label}</strong></div>
        <button type="button" aria-label="Fechar filtros" onClick={() => setFilterOpen(false)}><X size={17}/></button>
      </header>

      <div className="zeus-filter-categories">
        {definitions.map(definition => {
          const count = (active[definition.key] || []).length;
          return <button type="button" key={definition.key} className={definition.key === currentDefinition.key ? 'active' : ''} onClick={() => chooseDefinition(definition)}>
            <span>{definition.label}</span>{count > 0 && <b>{count}</b>}
          </button>;
        })}
      </div>

      <div className="zeus-filter-options-head">
        <label className="zeus-popover-search"><Search size={15}/><input value={optionSearch} onChange={event => setOptionSearch(event.target.value)} placeholder={`Buscar em ${currentDefinition.label.toLowerCase()}`}/></label>
        <div className="zeus-option-sort-row">
          <button type="button" className={!optionDescending ? 'active' : ''} onClick={() => setOptionDescending(false)}><ArrowUpAZ size={15}/> A–Z</button>
          <button type="button" className={optionDescending ? 'active' : ''} onClick={() => setOptionDescending(true)}><ArrowDownAZ size={15}/> Z–A</button>
        </div>
      </div>

      <div className="zeus-popover-options">
        {visibleOptions.map(option => <label key={option} className={draftSelected.includes(option) ? 'selected' : ''}>
          <input type="checkbox" checked={draftSelected.includes(option)} onChange={() => toggleOption(option)}/>
          <span>{option}</span>{draftSelected.includes(option) && <Check size={14}/>}
        </label>)}
        {!visibleOptions.length && <p>Nenhuma opção encontrada.</p>}
      </div>

      <footer>
        <button type="button" className="secondary" onClick={clearCurrent}>Limpar</button>
        <button type="button" className="primary" onClick={() => { confirmFilter(); setFilterOpen(false); }}>Aplicar filtro</button>
      </footer>
    </section>}

    <style jsx global>{`
      .zeus-filter-shell{position:relative;z-index:40;display:grid;gap:8px;margin:0 0 16px;min-width:0;max-width:100%}
      .zeus-filter-toolbar{display:grid;grid-template-columns:minmax(260px,1fr) auto auto;gap:8px;align-items:center}
      .zeus-filter-search-main>.op-search{width:100%!important;max-width:none!important;margin:0!important;height:42px}
      .zeus-sort-control{height:42px;display:flex;align-items:center;border:1px solid var(--op-line);border-radius:10px;background:var(--op-paper);overflow:hidden}
      .zeus-sort-control select{height:40px;min-width:150px;border:0!important;outline:0;background:transparent;color:var(--op-ink);padding:0 10px;font:inherit;font-size:11px;font-weight:700}
      .zeus-sort-control button{width:40px;height:40px;display:grid;place-items:center;border:0;border-left:1px solid var(--op-line);background:transparent;color:var(--op-muted);cursor:pointer}
      .zeus-sort-control button:hover{color:var(--op-ink);background:var(--op-soft)}
      .zeus-filter-trigger{height:42px;display:flex;align-items:center;gap:7px;padding:0 13px;border:1px solid var(--op-line);border-radius:10px;background:var(--op-paper);color:var(--op-ink);font:inherit;font-size:12px;font-weight:800;cursor:pointer}
      .zeus-filter-trigger:hover,.zeus-filter-trigger.active{border-color:color-mix(in srgb,var(--op-accent) 40%,var(--op-line))}
      .zeus-filter-trigger.active{color:var(--op-accent)}
      .zeus-filter-trigger b{min-width:19px;height:19px;padding:0 5px;display:grid;place-items:center;border-radius:999px;background:var(--op-accent);color:var(--op-on-accent);font-size:9px}

      .zeus-active-filters{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
      .zeus-active-filters>button{min-height:28px;max-width:300px;display:flex;align-items:center;gap:6px;padding:4px 8px;border:1px solid var(--op-line);border-radius:999px;background:var(--op-paper);color:var(--op-muted);font:inherit;font-size:10px;cursor:pointer}
      .zeus-active-filters>button span{font-weight:800;color:var(--op-ink)}
      .zeus-active-filters>button strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
      .zeus-active-filters>button.clear-all{border-color:transparent;background:transparent;color:var(--op-accent);font-weight:800}

      .zeus-filter-popover{position:absolute;right:0;top:50px;z-index:500;width:min(620px,calc(100vw - 56px));display:grid;gap:12px;padding:14px;border:1px solid var(--op-line);border-radius:14px;background:var(--op-paper);color:var(--op-ink);box-shadow:0 22px 55px rgba(0,0,0,.24)}
      .zeus-filter-popover>header{display:flex;align-items:center;justify-content:space-between;gap:16px}
      .zeus-filter-popover>header>div{display:grid;gap:2px}.zeus-filter-popover>header span{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--op-muted);font-weight:800}.zeus-filter-popover>header strong{font-size:15px}
      .zeus-filter-popover>header>button{width:34px;height:34px;display:grid;place-items:center;border:0;border-radius:8px;background:transparent;color:var(--op-muted);cursor:pointer}.zeus-filter-popover>header>button:hover{background:var(--op-soft);color:var(--op-ink)}
      .zeus-filter-categories{display:flex;gap:5px;overflow:auto;padding-bottom:2px;scrollbar-width:none}.zeus-filter-categories::-webkit-scrollbar{display:none}
      .zeus-filter-categories button{flex:0 0 auto;min-height:34px;display:flex;align-items:center;gap:6px;padding:0 10px;border:1px solid var(--op-line);border-radius:8px;background:transparent;color:var(--op-muted);font:inherit;font-size:10px;font-weight:750;cursor:pointer}
      .zeus-filter-categories button.active{border-color:color-mix(in srgb,var(--op-accent) 45%,var(--op-line));background:color-mix(in srgb,var(--op-accent) 7%,var(--op-paper));color:var(--op-accent)}
      .zeus-filter-categories button b{min-width:17px;height:17px;display:grid;place-items:center;border-radius:999px;background:var(--op-soft);font-size:9px}
      .zeus-filter-options-head{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}
      .zeus-popover-search{height:38px;display:flex;align-items:center;gap:7px;padding:0 9px;border:1px solid var(--op-line);border-radius:8px;color:var(--op-muted)}
      .zeus-popover-search input{width:100%;height:36px;border:0!important;outline:0!important;background:transparent!important;color:var(--op-ink)!important;padding:0!important;font:inherit;font-size:11px}
      .zeus-option-sort-row{display:flex;gap:5px}.zeus-option-sort-row button{height:38px;display:flex;align-items:center;gap:5px;padding:0 9px;border:1px solid var(--op-line);border-radius:8px;background:var(--op-paper);color:var(--op-muted);font:inherit;font-size:10px;cursor:pointer}.zeus-option-sort-row button.active{color:var(--op-accent);background:var(--op-soft)}
      .zeus-popover-options{max-height:250px;overflow:auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;padding:2px}
      .zeus-popover-options label{min-height:38px;display:flex;align-items:center;gap:8px;padding:6px 9px;border:1px solid transparent;border-radius:8px;cursor:pointer;font-size:11px}
      .zeus-popover-options label:hover,.zeus-popover-options label.selected{background:var(--op-soft);border-color:var(--op-line)}
      .zeus-popover-options label span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}.zeus-popover-options label svg{color:var(--op-accent)}
      .zeus-popover-options p{grid-column:1/-1;margin:12px 4px;color:var(--op-muted);font-size:11px}
      .zeus-filter-popover footer{display:flex;justify-content:flex-end;gap:7px;padding-top:10px;border-top:1px solid var(--op-line)}
      .zeus-filter-popover footer button{min-height:38px;padding:0 14px;border-radius:8px;font:inherit;font-size:11px;font-weight:800;cursor:pointer}.zeus-filter-popover footer .secondary{border:1px solid var(--op-line);background:var(--op-paper);color:var(--op-muted)}.zeus-filter-popover footer .primary{border:1px solid var(--op-accent);background:var(--op-accent);color:var(--op-on-accent)}

      @media(max-width:760px){
        .zeus-filter-toolbar{grid-template-columns:1fr auto}
        .zeus-filter-search-main{grid-column:1/-1}
        .zeus-sort-control{min-width:0}.zeus-sort-control select{min-width:0;width:145px}
        .zeus-filter-popover{position:fixed;left:10px;right:10px;top:auto;bottom:10px;width:auto;max-height:78dvh}
        .zeus-filter-options-head{grid-template-columns:1fr}
        .zeus-popover-options{grid-template-columns:1fr;max-height:36dvh}
        .zeus-active-filters{flex-wrap:nowrap;overflow:auto;scrollbar-width:none}.zeus-active-filters::-webkit-scrollbar{display:none}.zeus-active-filters>button{flex:0 0 auto}
      }
    `}</style>
  </div>;
}
