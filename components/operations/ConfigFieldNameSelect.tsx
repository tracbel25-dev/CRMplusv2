'use client';

import { useMemo, useState } from 'react';
import type { AppId } from '@/lib/operations/model';
import { fieldLabelOptions } from '@/lib/operations/configurationLabels';

const customValue='__crmplus_custom_label__';

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
  </div>;
}
