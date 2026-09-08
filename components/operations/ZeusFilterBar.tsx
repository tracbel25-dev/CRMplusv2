'use client';

import { useEffect, useState } from 'react';
import { ArrowDownAZ, ArrowUpAZ, Filter, X } from 'lucide-react';
import { Button, SearchBox } from './ui';

export type FilterDefinition = { key: string; label: string; options: string[] };
export type SortOption = { value: string; label: string };

function MultiFilter({ definition, selected, onApply }: { definition: FilterDefinition; selected: string[]; onApply: (values: string[]) => void }) {
  const [draft, setDraft] = useState(selected);
  useEffect(() => setDraft(selected), [selected]);
  const toggle = (value: string) => setDraft(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value]);
  return <details className="zeus-filter-menu">
    <summary><Filter size={15} />{definition.label}{selected.length > 0 && <b>{selected.length}</b>}</summary>
    <div className="zeus-filter-popover">
      <div className="zeus-filter-options">{definition.options.map(option => <label key={option}><input type="checkbox" checked={draft.includes(option)} onChange={() => toggle(option)} /><span>{option}</span></label>)}</div>
      <div className="zeus-filter-footer"><button type="button" className="op-text-link" onClick={() => { setDraft([]); onApply([]); }}>Limpar</button><Button onClick={() => onApply(draft)}>Aplicar</Button></div>
    </div>
  </details>;
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
  const count = Object.values(active).reduce((sum, values) => sum + values.length, 0);
  const clear = () => onActive({});
  return <div className="zeus-filter-bar">
    <SearchBox value={query} onChange={onQuery} placeholder={placeholder} />
    <div className="zeus-filter-set">{definitions.map(definition => <MultiFilter key={definition.key} definition={definition} selected={active[definition.key] || []} onApply={values => onActive({ ...active, [definition.key]: values })} />)}</div>
    <div className="zeus-sort-control"><select aria-label="Classificar por" value={sort} onChange={event => onSort(event.target.value)}>{sortOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><button type="button" className="op-icon" title={descending ? 'Maior para menor' : 'Menor para maior'} aria-label={descending ? 'Classificação decrescente' : 'Classificação crescente'} onClick={() => onDescending(!descending)}>{descending ? <ArrowDownAZ size={18} /> : <ArrowUpAZ size={18} />}</button></div>
    {count > 0 && <button className="zeus-clear-filters" type="button" onClick={clear}><X size={14} />Limpar filtros ({count})</button>}
  </div>;
}
