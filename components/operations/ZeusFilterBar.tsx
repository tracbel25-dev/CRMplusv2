'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDownAZ, ArrowUpAZ, Check, ChevronsUpDown, Filter, Search, X } from 'lucide-react';
import { Button, SearchBox } from './ui';

export type FilterDefinition = { key: string; label: string; options: string[] };
export type SortOption = { value: string; label: string };

function MultiFilter({ definition, selected, open, onOpen, onClose, onApply }: {
  definition: FilterDefinition;
  selected: string[];
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onApply: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState(selected);
  const [search, setSearch] = useState('');
  useEffect(() => {
    if (!open) return;
    setDraft(selected);
    setSearch('');
  }, [open, selected]);

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR');
    return definition.options.filter(option => !query || option.toLocaleLowerCase('pt-BR').includes(query));
  }, [definition.options, search]);
  const toggle = (value: string) => setDraft(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value]);
  const selectVisible = () => setDraft(current => Array.from(new Set([...current, ...visible])));
  const apply = () => { onApply(draft); onClose(); };

  return <div className={`zeus-filter-menu${open ? ' is-open' : ''}`}>
    <button type="button" className="zeus-filter-trigger" aria-expanded={open} onClick={() => open ? onClose() : onOpen()}>
      <Filter size={15} />
      <span>{definition.label}</span>
      {selected.length > 0 && <b>{selected.length}</b>}
    </button>
    {open && <>
      <button type="button" className="zeus-filter-backdrop" aria-label="Fechar filtro" onClick={onClose} />
      <div className="zeus-filter-popover" role="dialog" aria-label={`Filtrar por ${definition.label}`}>
        <div className="zeus-filter-panel-head"><div><small>Filtrar por</small><strong>{definition.label}</strong></div><button type="button" className="op-icon" aria-label="Fechar" onClick={onClose}><X size={17} /></button></div>
        <label className="zeus-filter-search"><Search size={16} /><input autoFocus value={search} onChange={event => setSearch(event.target.value)} placeholder={`Digitar ${definition.label.toLocaleLowerCase('pt-BR')}`} /></label>
        <div className="zeus-filter-selection-tools"><button type="button" onClick={selectVisible}>Selecionar {search ? 'resultados' : 'todos'}</button><span>{draft.length} selecionado(s)</span></div>
        <div className="zeus-filter-options">
          {visible.map(option => <label key={option} className={draft.includes(option) ? 'selected' : ''}><input type="checkbox" checked={draft.includes(option)} onChange={() => toggle(option)} /><span>{option}</span>{draft.includes(option) && <Check size={15} />}</label>)}
          {!visible.length && <p className="op-muted">Nenhuma opção encontrada.</p>}
        </div>
        <div className="zeus-filter-footer"><button type="button" className="op-text-link" onClick={() => setDraft([])}>Limpar filtro</button><Button onClick={apply}>Aplicar</Button></div>
      </div>
    </>}
  </div>;
}

function SortMenu({ sort, options, descending, open, onOpen, onClose, onApply }: {
  sort: string;
  options: SortOption[];
  descending: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onApply: (sort: string, descending: boolean) => void;
}) {
  const [draftSort, setDraftSort] = useState(sort);
  const [draftDescending, setDraftDescending] = useState(descending);
  useEffect(() => {
    if (!open) return;
    setDraftSort(sort);
    setDraftDescending(descending);
  }, [open, sort, descending]);
  const label = options.find(option => option.value === sort)?.label || 'Classificar';
  return <div className={`zeus-sort-menu${open ? ' is-open' : ''}`}>
    <button type="button" className="zeus-sort-trigger" aria-expanded={open} onClick={() => open ? onClose() : onOpen()}>
      {descending ? <ArrowDownAZ size={17} /> : <ArrowUpAZ size={17} />}<span>Classificar: {label}</span><ChevronsUpDown size={15} />
    </button>
    {open && <>
      <button type="button" className="zeus-filter-backdrop" aria-label="Fechar classificação" onClick={onClose} />
      <div className="zeus-filter-popover zeus-sort-popover" role="dialog" aria-label="Classificar resultados">
        <div className="zeus-filter-panel-head"><div><small>Organizar resultados</small><strong>Classificar</strong></div><button type="button" className="op-icon" aria-label="Fechar" onClick={onClose}><X size={17} /></button></div>
        <div className="zeus-sort-options">{options.map(option => <label key={option.value} className={draftSort === option.value ? 'selected' : ''}><input type="radio" name="zeus-sort" checked={draftSort === option.value} onChange={() => setDraftSort(option.value)} /><span>{option.label}</span>{draftSort === option.value && <Check size={15} />}</label>)}</div>
        <div className="zeus-sort-direction"><button type="button" className={!draftDescending ? 'active' : ''} onClick={() => setDraftDescending(false)}><ArrowUpAZ size={17} />Menor → maior</button><button type="button" className={draftDescending ? 'active' : ''} onClick={() => setDraftDescending(true)}><ArrowDownAZ size={17} />Maior → menor</button></div>
        <div className="zeus-filter-footer"><span className="op-muted">A ordem só muda ao confirmar.</span><Button onClick={() => { onApply(draftSort, draftDescending); onClose(); }}>Confirmar</Button></div>
      </div>
    </>}
  </div>;
}

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
  const [openKey, setOpenKey] = useState('');
  const [mobileFilterKey, setMobileFilterKey] = useState('');
  const count = Object.values(active).reduce((sum, values) => sum + values.length, 0);
  const closeFilter = () => { setOpenKey(''); setMobileFilterKey(''); };
  const clear = () => { onActive({}); closeFilter(); };
  const selectMobileFilter = (key: string) => {
    setMobileFilterKey(key);
    setOpenKey(key ? `filter:${key}` : '');
  };

  return <div className="zeus-filter-bar">
    <SearchBox value={query} onChange={onQuery} placeholder={placeholder} />

    <div className="zeus-mobile-filter-picker">
      <Filter size={18} />
      <select aria-label="Selecione o filtro" value={mobileFilterKey} onChange={event => selectMobileFilter(event.target.value)}>
        <option value="">Selecione o filtro</option>
        {definitions.map(definition => <option key={definition.key} value={definition.key}>{definition.label}{active[definition.key]?.length ? ` (${active[definition.key].length})` : ''}</option>)}
      </select>
      <ChevronsUpDown size={16} />
    </div>

    {count > 0 && <div className="zeus-mobile-active-filters">
      {definitions.filter(definition => active[definition.key]?.length).map(definition => <button type="button" key={definition.key} onClick={() => selectMobileFilter(definition.key)}>{definition.label}: {active[definition.key].length}</button>)}
    </div>}

    <div className="zeus-filter-set">{definitions.map(definition => <MultiFilter key={definition.key} definition={definition} selected={active[definition.key] || []} open={openKey === `filter:${definition.key}`} onOpen={() => setOpenKey(`filter:${definition.key}`)} onClose={closeFilter} onApply={values => onActive({ ...active, [definition.key]: values })} />)}</div>
    <SortMenu sort={sort} options={sortOptions} descending={descending} open={openKey === 'sort'} onOpen={() => setOpenKey('sort')} onClose={closeFilter} onApply={(nextSort, nextDescending) => { onSort(nextSort); onDescending(nextDescending); }} />
    {count > 0 && <button className="zeus-clear-filters" type="button" onClick={clear}><X size={14} />Limpar filtros ({count})</button>}

    <style jsx global>{`
      .zeus-mobile-filter-picker,.zeus-mobile-active-filters{display:none}
      @media(max-width:720px){
        .zeus-mobile-filter-picker{display:flex;align-items:center;gap:10px;width:100%;min-height:48px;padding:0 13px;border:1px solid var(--op-line);background:var(--op-paper);color:var(--op-ink);border-radius:var(--op-radius)}
        .zeus-mobile-filter-picker>svg:first-child{flex:0 0 auto;color:var(--op-muted)}
        .zeus-mobile-filter-picker>svg:last-child{flex:0 0 auto;color:var(--op-muted);pointer-events:none}
        .zeus-mobile-filter-picker select{appearance:none;-webkit-appearance:none;min-width:0;flex:1;border:0!important;outline:0!important;background:transparent!important;color:var(--op-ink)!important;font:inherit;font-size:16px!important;box-shadow:none!important;padding:0!important}
        .zeus-mobile-active-filters{display:flex;width:100%;gap:7px;flex-wrap:wrap}
        .zeus-mobile-active-filters button{border:1px solid color-mix(in srgb,var(--op-accent) 34%,var(--op-line));background:var(--op-tint);color:var(--op-accent);border-radius:999px;padding:7px 10px;font-size:12px;font-weight:650}
        .zeus-filter-bar .zeus-filter-set{display:block!important;position:absolute;width:0;height:0;overflow:visible;margin:0;padding:0}
        .zeus-filter-bar .zeus-filter-set .zeus-filter-menu{position:static}
        .zeus-filter-bar .zeus-filter-set .zeus-filter-trigger{display:none!important}
      }
    `}</style>
  </div>;
}
