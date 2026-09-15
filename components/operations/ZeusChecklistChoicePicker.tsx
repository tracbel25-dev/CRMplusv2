'use client';

import { useEffect, useState } from 'react';
import type { ZeusChecklistAssetFolder } from '@/lib/operations/checklistAssets';
import {
  ZEUS_CHECKLIST_CATEGORIES,
  ZEUS_CHECKLIST_FOLDER_LABELS,
  zeusChecklistCategoryForFolder,
  type ZeusChecklistCategoryId,
} from '@/lib/operations/zeusChecklist';

export function ZeusChecklistChoicePicker({ value, onChange, defaultFolder, disabled = false, allowNone = true }: {
  value: ZeusChecklistAssetFolder | '';
  onChange: (value: ZeusChecklistAssetFolder | '') => void;
  defaultFolder?: ZeusChecklistAssetFolder;
  disabled?: boolean;
  allowNone?: boolean;
}) {
  const [category, setCategory] = useState<ZeusChecklistCategoryId>(() => value ? zeusChecklistCategoryForFolder(value) : defaultFolder ? zeusChecklistCategoryForFolder(defaultFolder) : 'light');
  useEffect(() => { if (value) setCategory(zeusChecklistCategoryForFolder(value)); }, [value]);
  const current = ZEUS_CHECKLIST_CATEGORIES.find(item => item.id === category) || ZEUS_CHECKLIST_CATEGORIES[0];
  return <div className="zeus-choice-picker">
    <div className="zeus-choice-head"><div><strong>Checklist de entrada</strong><small>Escolha o segmento e depois o modelo específico.</small></div>{allowNone && <button type="button" disabled={disabled} className={!value ? 'active' : ''} onClick={() => onChange('')}>Não usar checklist</button>}</div>
    <div className="zeus-choice-categories">{ZEUS_CHECKLIST_CATEGORIES.map(item => <button type="button" disabled={disabled} className={category === item.id ? 'active' : ''} key={item.id} onClick={() => setCategory(item.id)}><strong>{item.label}</strong><small>{item.description}</small></button>)}</div>
    <div className="zeus-choice-models">{current.folders.map(folder => <button type="button" disabled={disabled} key={folder} className={value === folder ? 'active' : ''} onClick={() => onChange(folder)}><strong>{ZEUS_CHECKLIST_FOLDER_LABELS[folder]}</strong>{defaultFolder === folder && <em>Padrão</em>}</button>)}</div>
    <style jsx global>{`
      .zeus-choice-picker{display:grid;gap:12px;padding:14px;border:1px solid var(--op-line);background:var(--op-paper);margin:14px 0}.zeus-choice-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.zeus-choice-head>div{display:grid;gap:3px}.zeus-choice-head small{color:var(--op-muted)}.zeus-choice-head>button,.zeus-choice-categories button,.zeus-choice-models button{border:1px solid var(--op-line);background:var(--op-paper);color:inherit;cursor:pointer}.zeus-choice-head>button{padding:9px 12px}.zeus-choice-categories{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}.zeus-choice-categories button{padding:10px;text-align:left;display:grid;gap:3px}.zeus-choice-categories small{font-size:10px;color:var(--op-muted)}.zeus-choice-models{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;padding-top:10px;border-top:1px solid var(--op-line)}.zeus-choice-models button{min-height:44px;padding:9px;text-align:left;display:flex;align-items:center;justify-content:space-between;gap:6px}.zeus-choice-models em{font-size:9px;font-style:normal;text-transform:uppercase;color:var(--op-accent)}.zeus-choice-head>button.active,.zeus-choice-categories button.active,.zeus-choice-models button.active{border-color:var(--op-accent);box-shadow:inset 0 0 0 1px var(--op-accent)}
      @media(max-width:900px){.zeus-choice-categories{grid-template-columns:repeat(2,minmax(0,1fr))}.zeus-choice-models{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.zeus-choice-head{align-items:stretch;flex-direction:column}.zeus-choice-categories,.zeus-choice-models{grid-template-columns:1fr}}
    `}</style>
  </div>;
}
