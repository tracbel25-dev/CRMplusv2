'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Copy, ExternalLink, Link2, Plus, QrCode, RefreshCw, Settings2, Trash2 } from 'lucide-react';
import { createStoreClient } from '@/lib/supabase/storeClient';
import type { Workspace } from '@/lib/operations/storage';
import { Badge, Button, Empty, Modal, Section, Title } from './ui';
import { date, normalize, uid } from '@/lib/operations/model';

const CONFIG_KEY='__zeus_checkin_config__';
const DEFAULT_ITEMS=[
  'Documentos e chaves recebidos',
  'Quilometragem / horímetro conferido',
  'Nível de combustível registrado',
  'Avarias externas verificadas',
  'Pneus / rodas verificados',
  'Luzes e sinalização verificadas',
  'Painel / alertas registrados',
  'Objetos e acessórios deixados no veículo/equipamento',
  'Fotos de entrada registradas',
  'Observações informadas ao cliente'
];

type CheckConfig={enabled:boolean;requireSignature:boolean;items:string[]};
type ResponseRow={id:string;record_id:string;created_at:string;response:Record<string,unknown>};

type ShareState={jobId:string;url:string}|null;

function readConfig(w:Workspace):CheckConfig{
  try{
    const raw=w.data.customFieldValues?.[CONFIG_KEY]?.value;
    if(!raw)return {enabled:true,requireSignature:true,items:DEFAULT_ITEMS};
    const parsed=JSON.parse(raw) as Partial<CheckConfig>;
    return {enabled:parsed.enabled!==false,requireSignature:parsed.requireSignature!==false,items:Array.isArray(parsed.items)&&parsed.items.length?parsed.items:DEFAULT_ITEMS};
  }catch{return {enabled:true,requireSignature:true,items:DEFAULT_ITEMS};}
}

function writeConfig(data:Workspace['data'],config:CheckConfig){
  data.customFieldValues??={};
  data.customFieldValues[CONFIG_KEY]={value:JSON.stringify(config)};
}

export function ZeusCheckIn({w}:{w:Workspace}){
  const [tab,setTab]=useState<'checklists'|'config'>('checklists');
  const [responses,setResponses]=useState<ResponseRow[]>([]);
  const [busy,setBusy]=useState('');
  const [share,setShare]=useState<ShareState>(null);
  const [newItem,setNewItem]=useState('');
  const config=readConfig(w);
  const jobs=useMemo(()=>w.data.jobs.filter(job=>!['Encerrado','Cancelado','Reprovado'].includes(job.status)),[w.data.jobs]);

  const loadResponses=async()=>{
    if(!w.accountId||w.accountId==='guest')return;
    setBusy('responses');
    const supabase=createStoreClient();
    const {data,error}=await supabase.from('external_link_responses').select('id,record_id,created_at,response').eq('account_id',w.accountId).eq('app_id','zeus').eq('kind','zeus-checkin').order('created_at',{ascending:false});
    if(error)w.setError(error.message);else setResponses((data||[]) as ResponseRow[]);
    setBusy('');
  };

  useEffect(()=>{void loadResponses();},[w.accountId]);

  const latestFor=(jobId:string)=>responses.find(row=>row.record_id===jobId);

  const createLink=async(jobId:string)=>{
    if(!config.enabled){w.setError('O checklist de entrada está desativado.');return;}
    if(!w.accountId||w.accountId==='guest'){w.setError('Entre com a conta da oficina para gerar o link.');return;}
    const job=w.data.jobs.find(item=>item.id===jobId); if(!job)return;
    const customer=w.data.customers.find(item=>item.id===job.customerId);
    const asset=w.data.assets.find(item=>item.id===job.assetId);
    const supabase=createStoreClient();
    const {data:auth}=await supabase.auth.getUser(); if(!auth.user){w.setError('Sua sessão expirou.');return;}
    setBusy(jobId);
    const token=`${crypto.randomUUID().replaceAll('-','')}${crypto.randomUUID().replaceAll('-','')}`;
    const payload={
      business:w.data.settings.business,
      customer:customer?.name||'',
      asset:asset?`${asset.identifier} · ${asset.model}`:'',
      jobNumber:job.number,
      items:config.items,
      requireSignature:config.requireSignature,
      assetLabel:w.data.settings.assetLabel,
      meterLabel:w.data.settings.meterLabel
    };
    const {error}=await supabase.from('external_links').insert({account_id:w.accountId,app_id:'zeus',kind:'zeus-checkin',record_id:job.id,token,title:`Checklist de entrada · OS ${String(job.number).padStart(4,'0')}`,payload,created_by:auth.user.id});
    if(error){w.setError(error.message);setBusy('');return;}
    const url=`${window.location.origin}/checklist/${token}`;
    setShare({jobId,url});
    await w.mutate(data=>{const current=data.jobs.find(item=>item.id===jobId);if(current)current.events.push({id:uid(),at:new Date().toISOString(),text:`Checklist de entrada enviado por ${data.settings.operator||'usuário'}`});},'Link do checklist criado.');
    setBusy('');
  };

  const saveConfig=async(next:CheckConfig,message='Configuração do checklist salva.')=>{
    await w.mutate(data=>writeConfig(data,next),message);
  };

  const addItem=async()=>{
    const value=newItem.trim();if(!value)return;
    if(config.items.some(item=>normalize(item)===normalize(value))){w.setError('Esse item já existe no checklist.');return;}
    await saveConfig({...config,items:[...config.items,value]});setNewItem('');
  };

  const removeItem=async(index:number)=>{
    if(config.items.length<=1){w.setError('O checklist precisa ter ao menos um item.');return;}
    await saveConfig({...config,items:config.items.filter((_,i)=>i!==index)});
  };

  return <>
    <Title eyebrow="Recepção" title="Checklist de entrada">Padronize a conferência do veículo ou equipamento antes de iniciar o serviço.</Title>
    <div className="op-compact-tabs" style={{marginBottom:18}}><button aria-current={tab==='checklists'?'page':undefined} onClick={()=>setTab('checklists')}>Checklists</button><button aria-current={tab==='config'?'page':undefined} onClick={()=>setTab('config')}>Configuração</button></div>

    {tab==='checklists'&&<Section title="Ordens em aberto" action={<Button variant="secondary" disabled={busy==='responses'} onClick={()=>void loadResponses()}><RefreshCw size={16}/>{busy==='responses'?'Atualizando…':'Atualizar respostas'}</Button>}>
      {!config.enabled?<Empty>O checklist de entrada está desativado na configuração.</Empty>:jobs.length?<div className="zeus-checkin-list">{jobs.map(job=>{
        const customer=w.data.customers.find(item=>item.id===job.customerId);
        const asset=w.data.assets.find(item=>item.id===job.assetId);
        const latest=latestFor(job.id);
        return <div className="zeus-checkin-row" key={job.id}>
          <div><small>OS {String(job.number).padStart(4,'0')}</small><strong>{asset?.identifier||'Sem identificação'}</strong><span>{customer?.name||'Cliente'} · {asset?.model||''}</span></div>
          <div className="zeus-checkin-status">{latest?<><Badge><CheckCircle2 size={13}/>Preenchido</Badge><small>{date(latest.created_at,true)}</small></>:<Badge tone="warning">Pendente</Badge>}</div>
          <Button variant="secondary" disabled={busy===job.id} onClick={()=>void createLink(job.id)}><Link2 size={16}/>{busy===job.id?'Gerando…':'Gerar link / QR'}</Button>
        </div>;
      })}</div>:<Empty>Nenhuma OS em aberto.</Empty>}
    </Section>}

    {tab==='config'&&<>
      <Section title="Comportamento do checklist">
        <div className="op-module-choice"><input type="checkbox" checked={config.enabled} onChange={e=>void saveConfig({...config,enabled:e.target.checked})}/><span><strong>Usar checklist de entrada</strong><small>Quando desligado, o Zeus continua funcionando normalmente sem esta etapa.</small></span><Badge>{config.enabled?'Ativo':'Desativado'}</Badge></div>
        <div className="op-module-choice"><input type="checkbox" checked={config.requireSignature} disabled={!config.enabled} onChange={e=>void saveConfig({...config,requireSignature:e.target.checked})}/><span><strong>Exigir assinatura</strong><small>O preenchimento só é concluído depois da assinatura na tela.</small></span><Badge>{config.requireSignature?'Obrigatória':'Opcional'}</Badge></div>
      </Section>
      <Section title="Itens padrão">
        <p className="op-muted">Você pode usar este modelo como está ou adaptar para a rotina da oficina.</p>
        <div className="zeus-checkin-config-list">{config.items.map((item,index)=><div key={`${item}-${index}`}><span>{String(index+1).padStart(2,'0')}</span><input value={item} onChange={e=>{const next=[...config.items];next[index]=e.target.value;void saveConfig({...config,items:next},'Item do checklist atualizado.')}}/><button className="op-icon" type="button" aria-label={`Remover ${item}`} onClick={()=>void removeItem(index)}><Trash2 size={16}/></button></div>)}</div>
        <div className="op-config-add"><label className="op-field"><span>Novo item</span><input value={newItem} onChange={e=>setNewItem(e.target.value)} placeholder="Ex.: Estepe e macaco conferidos"/></label><Button variant="secondary" onClick={()=>void addItem()}><Plus size={16}/>Adicionar</Button></div>
      </Section>
    </>}

    {share&&<Modal title="Link do checklist" onClose={()=>setShare(null)}>
      <div className="zeus-checkin-share">
        <div className="zeus-qr"><img alt="QR Code do checklist" src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(share.url)}`}/></div>
        <p className="op-muted">O cliente ou responsável pode abrir pelo QR Code ou pelo link abaixo e preencher pelo celular.</p>
        <label className="op-field"><span>Link</span><input readOnly value={share.url}/></label>
        <div className="op-actions"><Button variant="secondary" onClick={()=>void navigator.clipboard.writeText(share.url)}><Copy size={16}/>Copiar</Button><Button onClick={()=>window.open(share.url,'_blank','noopener,noreferrer')}><ExternalLink size={16}/>Abrir</Button></div>
      </div>
    </Modal>}

    <style jsx global>{`
      .zeus-checkin-list{display:grid;border-top:1px solid var(--op-line)}
      .zeus-checkin-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:16px;align-items:center;padding:15px 0;border-bottom:1px solid var(--op-line)}
      .zeus-checkin-row>div:first-child{display:grid;gap:3px}.zeus-checkin-row small,.zeus-checkin-row span{color:var(--op-muted)}
      .zeus-checkin-status{display:grid;gap:4px;justify-items:end}.zeus-checkin-status .op-badge{display:flex;gap:5px;align-items:center}
      .zeus-checkin-config-list{display:grid;gap:8px;margin:16px 0}.zeus-checkin-config-list>div{display:grid;grid-template-columns:34px minmax(0,1fr) auto;align-items:center;gap:10px}.zeus-checkin-config-list>div>span{color:var(--op-muted);font-size:12px}.zeus-checkin-config-list input{min-height:42px;border:1px solid var(--op-line);background:var(--op-paper);color:var(--op-ink);padding:8px 10px;border-radius:8px}
      .zeus-checkin-share{display:grid;gap:14px}.zeus-qr{display:grid;place-items:center;padding:16px;background:#fff;border:1px solid var(--op-line);border-radius:12px}.zeus-qr img{width:220px;max-width:100%;height:auto}
      @media(max-width:720px){.zeus-checkin-row{grid-template-columns:1fr}.zeus-checkin-status{justify-items:start}.zeus-checkin-row .op-button{width:100%}.zeus-checkin-config-list>div{grid-template-columns:28px minmax(0,1fr) auto}}
    `}</style>
  </>;
}
