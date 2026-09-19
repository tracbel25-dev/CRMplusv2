'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import type { AppId } from '@/lib/operations/model';
import { useCurrentWorkspace } from '@/lib/operations/storage';
import { fieldLabelOptions } from '@/lib/operations/configurationLabels';

const optionEvent='crmplus:field-label-options';
const optionStorageKey=(accountId:string,app:AppId,fieldKey:string)=>`crmplus:${accountId}:${app}:field-label-options:${fieldKey}:v1`;

function normalize(values:string[]){
  const seen=new Set<string>();
  return values.map(value=>value.trim()).filter(value=>{
    const key=value.toLocaleLowerCase('pt-BR');
    if(!value||seen.has(key))return false;
    seen.add(key);
    return true;
  });
}

function readExtraOptions(accountId:string,app:AppId,fieldKey:string){
  if(typeof window==='undefined')return [] as string[];
  try{
    const parsed=JSON.parse(localStorage.getItem(optionStorageKey(accountId,app,fieldKey))||'[]');
    return Array.isArray(parsed)?normalize(parsed.map(String)):[];
  }catch{return [] as string[]}
}

function saveExtraOption(accountId:string,app:AppId,fieldKey:string,value:string){
  const next=normalize([...readExtraOptions(accountId,app,fieldKey),value]);
  localStorage.setItem(optionStorageKey(accountId,app,fieldKey),JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(optionEvent,{detail:{accountId,app,fieldKey}}));
}

export function resetFieldLabelOptions(app:AppId,fieldKeys:string[],accountId='guest'){
  if(typeof window==='undefined')return;
  for(const fieldKey of fieldKeys)localStorage.removeItem(optionStorageKey(accountId,app,fieldKey));
  for(const fieldKey of fieldKeys)window.dispatchEvent(new CustomEvent(optionEvent,{detail:{accountId,app,fieldKey}}));
}

export function ConfigFieldNameSelect({app,fieldKey,fallback,value,onChange}:{app:AppId;fieldKey:string;fallback:string;value:string;onChange:(value:string)=>void}){
  const workspace=useCurrentWorkspace();
  const accountId=workspace?.accountId||'guest';
  const listId=useId();
  const defaults=useMemo(()=>fieldLabelOptions(app,fieldKey,fallback),[app,fieldKey,fallback]);
  const [extras,setExtras]=useState<string[]>([]);
  useEffect(()=>{
    const sync=()=>setExtras(readExtraOptions(accountId,app,fieldKey));
    sync();
    const custom=(event:Event)=>{
      const detail=(event as CustomEvent<{accountId?:string;app?:AppId;fieldKey?:string}>).detail;
      if(detail?.accountId===accountId&&detail.app===app&&detail.fieldKey===fieldKey)sync();
    };
    window.addEventListener('storage',sync);
    window.addEventListener(optionEvent,custom);
    return()=>{window.removeEventListener('storage',sync);window.removeEventListener(optionEvent,custom)};
  },[accountId,app,fieldKey]);
  const options=useMemo(()=>normalize([...defaults,...extras]),[defaults,extras]);
  const typed=value.trim();
  const exists=options.some(option=>option.toLocaleLowerCase('pt-BR')===typed.toLocaleLowerCase('pt-BR'));
  return <div className="op-config-name-control">
    <div className="op-config-combobox">
      <input list={listId} value={value} onChange={event=>onChange(event.target.value)} onBlur={()=>{if(typed&&!exists)saveExtraOption(accountId,app,fieldKey,typed)}} placeholder={fallback} aria-label={`Nome de ${fallback} no aplicativo`}/>
      <datalist id={listId}>{options.map(option=><option key={option} value={option}/>)}</datalist>
    </div>
    <small className="op-muted">Digite livremente ou escolha uma sugestão.</small>
  </div>;
}
