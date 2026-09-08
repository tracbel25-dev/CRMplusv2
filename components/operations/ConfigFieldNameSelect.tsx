'use client';

import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { AppId } from '@/lib/operations/model';
import { fieldLabelOptions } from '@/lib/operations/configurationLabels';
import { saveZeusServiceTypes, useZeusServiceTypes, zeusServiceTypeSuggestions } from '@/lib/operations/serviceTypes';

const customValue='__crmplus_custom_label__';
const customTypeValue='__crmplus_custom_service_type__';

function ZeusServiceTypesConfigurator(){
  const types=useZeusServiceTypes();
  const [choice,setChoice]=useState('');
  const [custom,setCustom]=useState(false);
  const [customType,setCustomType]=useState('');
  const suggestions=zeusServiceTypeSuggestions.filter(value=>!types.includes(value));
  const add=(value:string)=>{
    const normalized=value.trim();
    if(!normalized)return;
    saveZeusServiceTypes([...types,normalized]);
    setChoice('');
    setCustom(false);
    setCustomType('');
  };
  return <div className="op-config-option-list">
    <span>Tipos disponíveis</span>
    <div className="op-config-option-chips">{types.map(type=><span key={type}>{type}<button type="button" aria-label={`Remover ${type}`} disabled={types.length===1} onClick={()=>saveZeusServiceTypes(types.filter(value=>value!==type))}><X size={13}/></button></span>)}</div>
    <div className="op-config-option-add">
      <select value={custom?customTypeValue:choice} onChange={event=>{
        const value=event.target.value;
        if(value===customTypeValue){setCustom(true);setChoice('');return;}
        setChoice(value);
        if(value)add(value);
      }} aria-label="Adicionar tipo de atendimento">
        <option value="">Adicionar tipo…</option>
        {suggestions.map(value=><option key={value} value={value}>{value}</option>)}
        <option value={customTypeValue}>Adicionar outro tipo…</option>
      </select>
      {custom&&<div className="op-config-option-custom"><input autoFocus value={customType} onChange={event=>setCustomType(event.target.value)} placeholder="Nome do tipo usado pela oficina"/><button type="button" className="op-icon" aria-label="Adicionar tipo personalizado" onClick={()=>add(customType)}><Plus size={15}/></button></div>}
    </div>
    <small>Essa lista aparece no agendamento e na abertura da OS. Registros antigos mantêm o tipo já gravado.</small>
  </div>;
}

export function ConfigFieldNameSelect({app,fieldKey,fallback,value,onChange}:{app:AppId;fieldKey:string;fallback:string;value:string;onChange:(value:string)=>void}){
  const options=useMemo(()=>fieldLabelOptions(app,fieldKey,fallback),[app,fieldKey,fallback]);
  const [custom,setCustom]=useState(()=>!options.includes(value));
  const selectValue=custom||!options.includes(value)?customValue:value;
  return <div className="op-config-name-control">
    <select value={selectValue} onChange={event=>{
      if(event.target.value===customValue){setCustom(true);return;}
      setCustom(false);
      onChange(event.target.value);
    }} aria-label={`Nome de ${fallback} no aplicativo`}>
      {options.map(option=><option key={option} value={option}>{option}</option>)}
      <option value={customValue}>Adicionar outro nome…</option>
    </select>
    {custom&&<input autoFocus value={value} onChange={event=>onChange(event.target.value)} placeholder="Digite o nome usado pela sua operação" aria-label={`Outro nome para ${fallback}`}/>} 
    {app==='zeus'&&fieldKey==='serviceType'&&<ZeusServiceTypesConfigurator/>}
  </div>;
}
