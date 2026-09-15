'use client';

import { useEffect, useState } from 'react';
import { createStoreClient } from '@/lib/supabase/storeClient';
import { ZeusCheckInPublicR2 as ZeusCheckInPublicR2Base } from './ZeusCheckInPublicR2Base';

function setReactInputValue(input:HTMLInputElement,value:string){
  const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')?.set;
  setter?.call(input,value);
  input.dispatchEvent(new Event('input',{bubbles:true}));
  input.dispatchEvent(new Event('change',{bubbles:true}));
}

export function ZeusCheckInPublicR2({token}:{token:string}){
  const [payload,setPayload]=useState<Record<string,any>|null>(null);

  useEffect(()=>{
    let active=true;
    void createStoreClient().functions.invoke('external-link',{body:{token,action:'read'}}).then(({data})=>{if(active&&data?.link?.payload)setPayload(data.link.payload);});
    return()=>{active=false;};
  },[token]);

  useEffect(()=>{
    if(!payload)return;
    let attempts=0;
    const apply=()=>{
      attempts++;
      const vehicleLabels=Array.from(document.querySelectorAll<HTMLLabelElement>('.check-page .top-grid .form-card:first-child .fields label'));
      if(vehicleLabels[0])vehicleLabels[0].style.display='none';
      const meterInput=vehicleLabels[4]?.querySelector('input');
      if(meterInput){meterInput.readOnly=true;meterInput.setAttribute('aria-readonly','true');}

      const customerCard=document.querySelector<HTMLElement>('.check-page .top-grid .form-card:nth-child(2)');
      const customerLabels=customerCard?Array.from(customerCard.querySelectorAll<HTMLLabelElement>('.fields label')):[];
      if(customerLabels[2])customerLabels[2].style.display='none';
      if(customerLabels[3])customerLabels[3].style.display='none';
      const title=customerCard?.querySelector('h2');if(title)title.textContent='Dados do cliente';
      const subtitle=customerCard?.querySelector('p');if(subtitle)subtitle.textContent='Dados já cadastrados no Zeus. Apenas confirme e assine.';

      const nameInput=document.querySelector<HTMLInputElement>('.check-page input[placeholder="Nome do responsável"]');
      const phoneInput=document.querySelector<HTMLInputElement>('.check-page input[placeholder="Telefone"]');
      if(nameInput&&!nameInput.value)setReactInputValue(nameInput,String(payload.customer||''));
      if(phoneInput&&!phoneInput.value)setReactInputValue(phoneInput,String(payload.customerPhone||''));
      if(nameInput){nameInput.readOnly=true;nameInput.setAttribute('aria-readonly','true');}
      if(phoneInput){phoneInput.readOnly=true;phoneInput.setAttribute('aria-readonly','true');}
      if(customerCard)customerCard.classList.add('zeus-auto-client-data');
      if(attempts<12&&(!nameInput||!customerCard))setTimeout(apply,120);
    };
    apply();
  },[payload]);

  return <><ZeusCheckInPublicR2Base token={token}/><style jsx global>{`
    .check-page .zeus-auto-client-data .fields{grid-template-columns:1fr 1fr!important}
    .check-page .zeus-auto-client-data input[readonly]{background:#f5f8fb!important;color:#52667b!important;cursor:default!important}
    .check-page .top-grid .form-card:first-child .fields label:nth-child(2){grid-column:auto!important}
  `}</style></>;
}
