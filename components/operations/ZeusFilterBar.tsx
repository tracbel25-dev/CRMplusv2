'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDownAZ, ArrowUpAZ, Check, ChevronsUpDown, Filter, Search, X } from 'lucide-react';
import { Button, SearchBox } from './ui';

export type FilterDefinition = { key: string; label: string; options: string[] };
export type SortOption = { value: string; label: string };

function FilterMenu({ definitions, active, open, initialKey, onOpen, onClose, onApply }: {
  definitions: FilterDefinition[];
  active: Record<string, string[]>;
  open: boolean;
  initialKey: string;
  onOpen: () => void;
  onClose: () => void;
  onApply: (value: Record<string, string[]>) => void;
}) {
  const [fieldKey, setFieldKey] = useState(initialKey || definitions[0]?.key || '');
  const [draft, setDraft] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const definition = definitions.find(item => item.key === fieldKey) || definitions[0];

  useEffect(() => {
    if (!open) return;
    const nextKey = initialKey || definitions[0]?.key || '';
    setFieldKey(nextKey);
    setDraft(active[nextKey] || []);
    setSearch('');
  }, [open, initialKey, definitions, active]);

  useEffect(() => {
    if (!open || !fieldKey) return;
    setDraft(active[fieldKey] || []);
    setSearch('');
  }, [fieldKey, open, active]);

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR');
    return (definition?.options || []).filter(option => !query || option.toLocaleLowerCase('pt-BR').includes(query));
  }, [definition, search]);

  const toggle = (value: string) => setDraft(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value]);
  const selectVisible = () => setDraft(current => Array.from(new Set([...current, ...visible])));
  const count = Object.values(active).reduce((sum, values) => sum + values.length, 0);

  return <div className={`zeus-filter-menu${open ? ' is-open' : ''}`}>
    <button type="button" className="zeus-filter-trigger" aria-expanded={open} onClick={() => open ? onClose() : onOpen()}>
      <Filter size={16}/><span>Filtrar</span>{count > 0 && <b>{count}</b>}<ChevronsUpDown size={15}/>
    </button>
    {open && definition && <>
      <button type="button" className="zeus-filter-backdrop" aria-label="Fechar filtros" onClick={onClose}/>
      <div className="zeus-filter-popover" role="dialog" aria-label="Filtrar resultados">
        <div className="zeus-filter-panel-head"><div><small>Refinar resultados</small><strong>Filtrar</strong></div><button type="button" className="op-icon" aria-label="Fechar" onClick={onClose}><X size={17}/></button></div>
        <label className="op-field"><span>Filtrar por</span><select value={fieldKey} onChange={event => setFieldKey(event.target.value)}>{definitions.map(item => <option value={item.key} key={item.key}>{item.label}{active[item.key]?.length ? ` (${active[item.key].length})` : ''}</option>)}</select></label>
        <label className="zeus-filter-search"><Search size={16}/><input autoFocus value={search} onChange={event => setSearch(event.target.value)} placeholder={`Buscar em ${definition.label.toLocaleLowerCase('pt-BR')}`}/></label>
        <div className="zeus-filter-selection-tools"><button type="button" onClick={selectVisible}>Selecionar {search ? 'resultados' : 'todos'}</button><span>{draft.length} selecionado(s)</span></div>
        <div className="zeus-filter-options">
          {visible.map(option => <label key={option} className={draft.includes(option) ? 'selected' : ''}><input type="checkbox" checked={draft.includes(option)} onChange={() => toggle(option)}/><span>{option}</span>{draft.includes(option) && <Check size={15}/>}</label>)}
          {!visible.length && <p className="op-muted">Nenhuma opção encontrada.</p>}
        </div>
        <div className="zeus-filter-footer"><button type="button" className="op-text-link" onClick={() => setDraft([])}>Limpar este filtro</button><Button onClick={() => { onApply({ ...active, [definition.key]: draft }); onClose(); }}>Aplicar</Button></div>
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
  useEffect(() => { if (open) { setDraftSort(sort); setDraftDescending(descending); } }, [open, sort, descending]);
  const label = options.find(option => option.value === sort)?.label || 'Classificar';
  return <div className={`zeus-sort-menu${open ? ' is-open' : ''}`}>
    <button type="button" className="zeus-sort-trigger" aria-expanded={open} onClick={() => open ? onClose() : onOpen()}>
      {descending ? <ArrowDownAZ size={17}/> : <ArrowUpAZ size={17}/>}<span>Classificar: {label}</span><ChevronsUpDown size={15}/>
    </button>
    {open && <>
      <button type="button" className="zeus-filter-backdrop" aria-label="Fechar classificação" onClick={onClose}/>
      <div className="zeus-filter-popover zeus-sort-popover" role="dialog" aria-label="Classificar resultados">
        <div className="zeus-filter-panel-head"><div><small>Organizar resultados</small><strong>Classificar</strong></div><button type="button" className="op-icon" aria-label="Fechar" onClick={onClose}><X size={17}/></button></div>
        <div className="zeus-sort-options">{options.map(option => <label key={option.value} className={draftSort === option.value ? 'selected' : ''}><input type="radio" name="zeus-sort" checked={draftSort === option.value} onChange={() => setDraftSort(option.value)}/><span>{option.label}</span>{draftSort === option.value && <Check size={15}/>}</label>)}</div>
        <div className="zeus-sort-direction"><button type="button" className={!draftDescending ? 'active' : ''} onClick={() => setDraftDescending(false)}><ArrowUpAZ size={17}/>Menor → maior</button><button type="button" className={draftDescending ? 'active' : ''} onClick={() => setDraftDescending(true)}><ArrowDownAZ size={17}/>Maior → menor</button></div>
        <div className="zeus-filter-footer"><span className="op-muted">A ordem só muda ao confirmar.</span><Button onClick={() => { onApply(draftSort, draftDescending); onClose(); }}>Confirmar</Button></div>
      </div>
    </>}
  </div>;
}

export function ZeusFilterBar({ query, onQuery, definitions, active, onActive, sort, sortOptions, descending, onSort, onDescending, placeholder = 'Buscar' }: {
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
  const [filterKey, setFilterKey] = useState('');
  const count = Object.values(active).reduce((sum, values) => sum + values.length, 0);
  const close = () => setOpenKey('');
  const openFilter = (key = '') => { setFilterKey(key || definitions[0]?.key || ''); setOpenKey('filter'); };
  const clear = () => { onActive({}); setFilterKey(''); close(); };

  return <div className="zeus-filter-bar zeus-filter-bar-clean">
    <div className="zeus-filter-search-main"><SearchBox value={query} onChange={onQuery} placeholder={placeholder}/></div>
    {definitions.length > 0 && <FilterMenu definitions={definitions} active={active} open={openKey === 'filter'} initialKey={filterKey} onOpen={() => openFilter()} onClose={close} onApply={onActive}/>} 
    <SortMenu sort={sort} options={sortOptions} descending={descending} open={openKey === 'sort'} onOpen={() => setOpenKey('sort')} onClose={close} onApply={(nextSort, nextDescending) => { onSort(nextSort); onDescending(nextDescending); }}/>
    {count > 0 && <div className="zeus-active-filter-row"><div className="zeus-active-filter-chips">{definitions.filter(definition => active[definition.key]?.length).map(definition => <button type="button" key={definition.key} onClick={() => openFilter(definition.key)}>{definition.label}: {active[definition.key].length}</button>)}</div><button className="zeus-clear-filters" type="button" onClick={clear}><X size={14}/>Limpar filtros ({count})</button></div>}
  </div>;
}
