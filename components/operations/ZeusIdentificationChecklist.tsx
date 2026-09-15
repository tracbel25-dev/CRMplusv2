'use client';

import { useEffect, useMemo, useState } from 'react';
import { Camera, CheckCircle2, ExternalLink, RefreshCw } from 'lucide-react';
import { createPortal } from 'react-dom';
import { createStoreClient } from '@/lib/supabase/storeClient';
import { uploadOperationalFile, R2AuthRequiredError } from '@/lib/r2/client';
import { activeJob, customValues, event, setCustomValues, uid, type Job } from '@/lib/operations/model';
import type { Workspace } from '@/lib/operations/storage';
import { ZEUS_CHECKLIST_TEMPLATES, type ZeusChecklistSegment } from '@/lib/operations/checklistTemplates';
import { ZEUS_CHECKLIST_ASSET_FOLDERS, isZeusChecklistAssetFolder, type ZeusChecklistAssetFolder } from '@/lib/operations/checklistAssets';
import { Badge, Button, Empty, Section } from './ui';

const CONFIG_KEY='__zeus_checkin_config__';
const JOB_FOLDER_KEY='__zeus_checklist_asset_folder__';
const JOB_ENABLED_KEY='__zeus_checklist_enabled__';

const FOLDER_LABELS:Record<ZeusChecklistAssetFolder,string>={
  caminhao_cavalo_mecanico:'Caminhão cavalo mecânico',
  caminhao_medio:'Caminhão médio',
  caminhao_pequeno:'Caminhão pequeno',
  carro:'Carro',
  empilhadeira:'Empilhadeira',
  maquina_carregadeira:'Carregadeira',
  maquina_escavadeira:'Escavadeira',
  maquina_motoniveladora:'Motoniveladora',
  maquina_retroescavadeira:'Retroescavadeira',
  maquina_rolo_compactador:'Rolo compactador',
  micro_onibus:'Micro-ônibus',
  moto:'Moto',
  onibus:'Ônibus',
  trator_agricola:'Trator agrícola',
  van:'Van',
};
const SEGMENT_BY_FOLDER:Record<ZeusChecklistAssetFolder,ZeusChecklistSegment>={
  caminhao_cavalo_mecanico:'truck',caminhao_medio:'truck',caminhao_pequeno:'truck',carro:'auto',empilhadeira:'machine',
  maquina_carregadeira:'machine',maquina_escavadeira:'machine',maquina_motoniveladora:'machine',maquina_retroescavadeira:'machine',
  maquina_rolo_compactador:'machine',micro_onibus:'truck',moto:'moto',onibus:'truck',trator_agricola:'machine',van:'truck',
};

type CheckConfig={enabled:boolean;requireSignature:boolean;defaultAssetFolder:ZeusChecklistAssetFolder;itemsBySegment:Record<ZeusChecklistSegment,string[]>};

function readConfig(w:Workspace):CheckConfig{
  const fallback:CheckConfig={
    enabled:true,
    requireSignature:true,
    defaultAssetFolder:'carro',
    itemsBySegment:{
      auto:[...ZEUS_CHECKLIST_TEMPLATES.auto.items],
      moto:[...ZEUS_CHECKLIST_TEMPLATES.moto.items],
      truck:[...ZEUS_CHECKLIST_TEMPLATES.truck.items],
      machine:[...ZEUS_CHECKLIST_TEMPLATES.machine.items],
    },
  };
  try{
    const raw=w.data.customFieldValues?.[CONFIG_KEY]?.value;
    if(!raw)return fallback;
    const parsed=JSON.parse(raw) as Partial<CheckConfig>;
    const defaultAssetFolder=isZeusChecklistAssetFolder(String(parsed.defaultAssetFolder||''))?parsed.defaultAssetFolder as ZeusChecklistAssetFolder:fallback.defaultAssetFolder;
    return {
      enabled:parsed.enabled!==false,
      requireSignature:parsed.requireSignature!==false,
      defaultAssetFolder,
      itemsBySegment:{...fallback.itemsBySegment,...(parsed.itemsBySegment||{})},
    };
  }catch{return fallback;}
}

async function localPhoto(file:File){
  if(file.size>750000)throw new Error('Sem sessão de armazenamento, escolha uma foto de até 750 KB.');
  return await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(new Error('Não foi possível ler a foto.'));reader.readAsDataURL(file);});
}

export function ZeusIdentificationChecklist({w,jobId}:{w:Workspace;jobId:string}){
  const [target,setTarget]=useState<HTMLElement|null>(null);
  const [done,setDone]=useState(false);
  const [busy,setBusy]=useState('');
  const [shareUrl,setShareUrl]=useState('');
  const job=w.data.jobs.find(item=>item.id===jobId);
  const config=readConfig(w);
  const saved=job?customValues(w.data,job.id):{};
  const savedFolder=isZeusChecklistAssetFolder(String(saved[JOB_FOLDER_KEY]||''))?saved[JOB_FOLDER_KEY] as ZeusChecklistAssetFolder:'';
  const inheritedFolder=config.enabled?config.defaultAssetFolder:'';
  const selectedFolder=(saved[JOB_ENABLED_KEY]==='false'?'':savedFolder||inheritedFolder) as ZeusChecklistAssetFolder|'';
  const asset=job?w.data.assets.find(item=>item.id===job.assetId):undefined;
  const customer=job?w.data.customers.find(item=>item.id===job.customerId):undefined;
  const active=!!job&&activeJob(job);

  const checkStatus=async()=>{
    if(!job||!w.accountId||w.accountId==='guest')return;
    const supabase=createStoreClient();
    const {data,error}=await supabase.from('external_link_responses').select('id').eq('account_id',w.accountId).eq('app_id','zeus').eq('kind','zeus-checkin').eq('record_id',job.id).limit(1);
    if(!error)setDone(!!data?.length);
  };

  useEffect(()=>{
    const host=document.getElementById('zeus-current-work');
    if(!host||!job||job.stage!=='Identificação')return;
    let slot=document.getElementById('zeus-identification-checklist-slot') as HTMLElement|null;
    if(!slot){slot=document.createElement('div');slot.id='zeus-identification-checklist-slot';const sections=host.querySelectorAll(':scope > .op-section');const first=sections.item(0);if(first?.parentElement===host)first.after(slot);else host.appendChild(slot);}
    setTarget(slot);
    return()=>{slot?.remove();};
  },[job?.id,job?.stage]);

  useEffect(()=>{void checkStatus();const onFocus=()=>void checkStatus();window.addEventListener('focus',onFocus);return()=>window.removeEventListener('focus',onFocus);},[job?.id,w.accountId]);

  useEffect(()=>{
    if(!job||job.stage!=='Identificação')return;
    const button=document.querySelector<HTMLButtonElement>('#zeus-current-work .zeus-primary-action button');
    if(!button)return;
    const mustFinish=!!selectedFolder&&!done;
    button.disabled=mustFinish;
    button.title=mustFinish?'Conclua o checklist de entrada antes de avançar.':'';
  },[job?.id,job?.stage,selectedFolder,done]);

  const choose=async(value:string)=>{
    if(!job||done)return;
    const folder=isZeusChecklistAssetFolder(value)?value:'';
    await w.mutate(data=>setCustomValues(data,job.id,{[JOB_ENABLED_KEY]:folder?'true':'false',[JOB_FOLDER_KEY]:folder}),folder?'Checklist habilitado para esta OS.':'Checklist desabilitado para esta OS.');
  };

  const openChecklist=async()=>{
    if(!job||!asset||!customer||!selectedFolder||done)return;
    if(!w.accountId||w.accountId==='guest'){w.setError('Entre com a conta da oficina para abrir o checklist.');return;}
    setBusy('checklist');
    try{
      const supabase=createStoreClient();
      const {data:existing}=await supabase.from('external_link_responses').select('id').eq('account_id',w.accountId).eq('app_id','zeus').eq('kind','zeus-checkin').eq('record_id',job.id).limit(1);
      if(existing?.length){setDone(true);w.setError('Este checklist já foi executado e não pode ser realizado novamente.');return;}
      const {data:auth}=await supabase.auth.getUser();if(!auth.user)throw new Error('Sua sessão expirou.');
      const segment=SEGMENT_BY_FOLDER[selectedFolder];const template=ZEUS_CHECKLIST_TEMPLATES[segment];
      const token=`${crypto.randomUUID().replaceAll('-','')}${crypto.randomUUID().replaceAll('-','')}`;
      const payload={
        business:w.data.settings.business,
        customer:customer.name,
        customerPhone:customer.phone||'',
        asset:`${asset.identifier} · ${asset.model}`,
        assetInfo:{identifier:asset.identifier,model:asset.model,year:asset.year||'',meter:asset.meter||'',checklistAssetFolder:selectedFolder},
        checklistAssetFolder:selectedFolder,
        jobNumber:job.number,
        segment,
        segmentLabel:template.label,
        items:config.itemsBySegment[segment],
        requireSignature:config.requireSignature,
        assetLabel:w.data.settings.assetLabel,
        meterLabel:w.data.settings.meterLabel,
        identifierLabel:w.data.settings.identifierLabel,
      };
      const {error}=await supabase.from('external_links').insert({account_id:w.accountId,app_id:'zeus',kind:'zeus-checkin',record_id:job.id,token,title:`Checklist de entrada · ${FOLDER_LABELS[selectedFolder]} · OS ${String(job.number).padStart(4,'0')}`,payload,created_by:auth.user.id});
      if(error)throw error;
      const url=`${window.location.origin}/checklist/${token}`;setShareUrl(url);window.open(url,'_blank','noopener,noreferrer');
      await w.mutate(data=>{const current=data.jobs.find(item=>item.id===job.id);current?.events.push(event(`Checklist de entrada (${FOLDER_LABELS[selectedFolder]}) aberto na identificação`));},'Checklist aberto em nova aba.');
    }catch(reason){w.setError(reason instanceof Error?reason.message:'Não foi possível abrir o checklist.');}
    finally{setBusy('');}
  };

  const addPhotos=async(files:FileList|null)=>{
    if(!job||!files?.length)return;
    setBusy('photo');
    try{
      for(const file of Array.from(files)){
        if(file.size>8*1024*1024)throw new Error(`${file.name}: escolha uma foto de até 8 MB.`);
        let data='';
        try{const uploaded=await uploadOperationalFile('zeus',file);data=`r2:${uploaded.key}|${uploaded.url}`;}
        catch(reason){if(!(reason instanceof R2AuthRequiredError))throw reason;data=await localPhoto(file);}
        await w.mutate(store=>{const current=store.jobs.find(item=>item.id===job.id);if(current){current.attachments.push({id:uid(),name:file.name,data});current.events.push(event(`Foto da identificação anexada: ${file.name}`));}},'Foto vinculada à identificação.');
      }
    }catch(reason){w.setError(reason instanceof Error?reason.message:'Não foi possível anexar as fotos.');}
    finally{setBusy('');}
  };

  const content=useMemo(()=>{
    if(!job||job.stage!=='Identificação')return null;
    return <Section title="Checklist e fotos da identificação" action={done?<Badge><CheckCircle2 size={13}/>Checklist concluído</Badge>:undefined}>
      <div className="zeus-identification-checklist-grid">
        <label className="op-field"><span>Checklist desta OS</span><select value={selectedFolder} disabled={!active||done} onChange={e=>void choose(e.target.value)}><option value="">Não usar checklist nesta OS</option>{ZEUS_CHECKLIST_ASSET_FOLDERS.map(folder=><option key={folder} value={folder}>{FOLDER_LABELS[folder]}</option>)}</select><small>{done?'Checklist bloqueado após a conclusão.':'O padrão vem da Configuração, mas pode ser trocado nesta OS antes de executar.'}</small></label>
        <div className="zeus-identification-actions"><div><strong>{selectedFolder?FOLDER_LABELS[selectedFolder]:'Checklist desabilitado'}</strong><small>{done?'Já executado. Não é possível preencher novamente.':selectedFolder?'Preencha antes de avançar para a próxima etapa.':'A OS pode seguir sem checklist.'}</small></div>{selectedFolder&&!done&&<Button disabled={busy==='checklist'} onClick={()=>void openChecklist()}><ExternalLink size={16}/>{busy==='checklist'?'Abrindo…':'Preencher checklist'}</Button>}</div>
        <label className="op-field span-full"><span>Fotos da identificação</span><div className="op-actions"><label className="op-button secondary"><Camera size={16}/>{busy==='photo'?'Enviando…':'Tirar / anexar fotos'}<input hidden multiple disabled={busy==='photo'||!active} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e=>{const files=e.currentTarget.files;void addPhotos(files).finally(()=>{e.currentTarget.value='';});}}/></label><Badge>{job.attachments.length} foto(s)</Badge></div><small>Este campo é da identificação. O campo geral de Fotos e evidências continua disponível na ficha da OS.</small></label>
        {shareUrl&&<div className="op-callout span-full"><strong>Checklist aberto</strong><span> Ao concluir na outra aba, volte para a OS. O status será atualizado automaticamente.</span><Button variant="secondary" onClick={()=>void checkStatus()}><RefreshCw size={15}/>Atualizar status</Button></div>}
      </div>
      <style jsx global>{`.zeus-identification-checklist-grid{display:grid;grid-template-columns:minmax(260px,.9fr) minmax(300px,1.1fr);gap:16px;align-items:end}.zeus-identification-actions{min-height:74px;padding:12px 14px;border:1px solid var(--op-line);border-radius:10px;background:var(--op-soft);display:flex;align-items:center;justify-content:space-between;gap:14px}.zeus-identification-actions>div{display:grid;gap:4px}.zeus-identification-actions small{color:var(--op-muted)}@media(max-width:760px){.zeus-identification-checklist-grid{grid-template-columns:1fr}.zeus-identification-actions{align-items:flex-start;flex-direction:column}.zeus-identification-actions .op-button{width:100%}}`}</style>
    </Section>;
  },[job?.id,job?.stage,job?.attachments.length,selectedFolder,done,busy,shareUrl,active]);

  return target&&content?createPortal(content,target):null;
}
