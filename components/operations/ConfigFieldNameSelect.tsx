'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { AppId } from '@/lib/operations/model';
import { fieldLabelOptions } from '@/lib/operations/configurationLabels';
import { saveZeusServiceTypes, useZeusServiceTypes, zeusServiceTypeSuggestions } from '@/lib/operations/serviceTypes';

const optionEvent='crmplus:field-label-options';
const optionStorageKey=(app:AppId,fieldKey:string)=>`crmplus:${app}:field-label-options:${fieldKey}:v1`;

function normalize(values:string[]){
  const seen=new Set<string>();
  return values.map(value=>value.trim()).filter(value=>{
    const key=value.toLocaleLowerCase('pt-BR');
    if(!value||seen.has(key))return false;
    seen.add(key);
    return true;
  });
}

function readExtraOptions(app:AppId,fieldKey:string){
  if(typeof window==='undefined')return [] as string[];
  try{
    const parsed=JSON.parse(localStorage.getItem(optionStorageKey(app,fieldKey))||'[]');
    return Array.isArray(parsed)?normalize(parsed.map(String)):[];
  }catch{return [] as string[]}
}

function saveExtraOption(app:AppId,fieldKey:string,value:string){
  const next=normalize([...readExtraOptions(app,fieldKey),value]);
  localStorage.setItem(optionStorageKey(app,fieldKey),JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(optionEvent,{detail:{app,fieldKey}}));
}

function ZeusServiceTypesConfigurator(){
  const types=useZeusServiceTypes();
  const listId=useId();
  const [draft,setDraft]=useState('');
  const suggestions=normalize([...types,...zeusServiceTypeSuggestions]);
  const exists=types.some(value=>value.toLocaleLowerCase('pt-BR')===draft.trim().toLocaleLowerCase('pt-BR'));
  const add=()=>{
    const normalized=draft.trim();
    if(!normalized||exists)return;
    saveZeusServiceTypes([...types,normalized]);
    setDraft('');
  };
  return <div className="op-config-option-list">
    <span>Tipos disponíveis</span>
    <div className="op-config-option-chips">{types.map(type=><span key={type}>{type}<button type="button" aria-label={`Remover ${type}`} disabled={types.length===1} onClick={()=>saveZeusServiceTypes(types.filter(value=>value!==type))}><X size={13}/></button></span>)}</div>
    <div className="op-config-option-add">
      <input list={listId} value={draft} onChange={event=>setDraft(event.target.value)} placeholder="Digite ou escolha um tipo de atendimento" aria-label="Adicionar tipo de atendimento"/>
      <datalist id={listId}>{suggestions.map(value=><option key={value} value={value}/>)}</datalist>
      <button type="button" className="op-button secondary" disabled={!draft.trim()||exists} onClick={add}><Plus size={15}/>Incluir tipo</button>
    </div>
    <small>Você pode digitar livremente ou aproveitar uma sugestão. “Incluir tipo” salva a nova opção para os próximos atendimentos.</small>
  </div>;
}

export function ConfigFieldNameSelect({app,fieldKey,fallback,value,onChange}:{app:AppId;fieldKey:string;fallback:string;value:string;onChange:(value:string)=>void}){
  const listId=useId();
  const defaults=useMemo(()=>fieldLabelOptions(app,fieldKey,fallback),[app,fieldKey,fallback]);
  const [extras,setExtras]=useState<string[]>([]);
  useEffect(()=>{
    const sync=()=>setExtras(readExtraOptions(app,fieldKey));
    sync();
    const custom=(event:Event)=>{
      const detail=(event as CustomEvent<{app?:AppId;fieldKey?:string}>).detail;
      if(detail?.app===app&&detail.fieldKey===fieldKey)sync();
    };
    window.addEventListener('storage',sync);
    window.addEventListener(optionEvent,custom);
    return()=>{window.removeEventListener('storage',sync);window.removeEventListener(optionEvent,custom)};
  },[app,fieldKey]);
  const options=useMemo(()=>normalize([...defaults,...extras]),[defaults,extras]);
  const typed=value.trim();
  const exists=options.some(option=>option.toLocaleLowerCase('pt-BR')===typed.toLocaleLowerCase('pt-BR'));
  return <div className="op-config-name-control">
    <div className="op-config-combobox">
      <input list={listId} value={value} onChange={event=>onChange(event.target.value)} placeholder={fallback} aria-label={`Nome de ${fallback} no aplicativo`}/>
      <datalist id={listId}>{options.map(option=><option key={option} value={option}/>)}</datalist>
      <button type="button" className="op-button secondary" disabled={!typed||exists} onClick={()=>saveExtraOption(app,fieldKey,typed)}><Plus size={14}/>Incluir opção</button>
    </div>
    <small className="op-muted">Digite o nome que quiser. As sugestões aceleram o preenchimento; “Incluir opção” guarda um termo novo na lista da operação.</small>
    {app==='zeus'&&fieldKey==='serviceType'&&<ZeusServiceTypesConfigurator/>}
  </div>;
}
