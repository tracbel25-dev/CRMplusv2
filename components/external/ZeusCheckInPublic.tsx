'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import { createStoreClient } from '@/lib/supabase/storeClient';

type LinkData={appId:string;kind:string;recordId?:string;title:string;payload:Record<string,any>;status:string};

async function invoke(token:string,action:'read'|'respond',response?:Record<string,unknown>){
  const {data,error}=await createStoreClient().functions.invoke('external-link',{body:{token,action,response}});
  if(error)throw error;
  if(data?.error)throw new Error(data.error);
  return data;
}

function SignaturePad({value,onChange}:{value:string;onChange:(value:string)=>void}){
  const ref=useRef<HTMLCanvasElement>(null);
  const drawing=useRef(false);
  useEffect(()=>{
    const canvas=ref.current;if(!canvas)return;
    const ratio=Math.max(1,window.devicePixelRatio||1);
    const box=canvas.getBoundingClientRect();
    canvas.width=Math.floor(box.width*ratio);canvas.height=Math.floor(150*ratio);
    const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.scale(ratio,ratio);ctx.lineWidth=2;ctx.lineCap='round';ctx.strokeStyle='#111827';
  },[]);
  const point=(event:React.PointerEvent<HTMLCanvasElement>)=>{const rect=event.currentTarget.getBoundingClientRect();return{x:event.clientX-rect.left,y:event.clientY-rect.top};};
  const start=(event:React.PointerEvent<HTMLCanvasElement>)=>{drawing.current=true;event.currentTarget.setPointerCapture(event.pointerId);const ctx=event.currentTarget.getContext('2d');const p=point(event);ctx?.beginPath();ctx?.moveTo(p.x,p.y);};
  const move=(event:React.PointerEvent<HTMLCanvasElement>)=>{if(!drawing.current)return;const ctx=event.currentTarget.getContext('2d');const p=point(event);ctx?.lineTo(p.x,p.y);ctx?.stroke();};
  const end=()=>{drawing.current=false;const canvas=ref.current;if(canvas)onChange(canvas.toDataURL('image/png',0.7));};
  const clear=()=>{const canvas=ref.current;const ctx=canvas?.getContext('2d');if(canvas&&ctx){ctx.clearRect(0,0,canvas.width,canvas.height);onChange('');}};
  return <div className="check-sign"><div><span>Assinatura</span><button type="button" onClick={clear}><RotateCcw size={14}/>Limpar</button></div><canvas ref={ref} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}/>{value&&<small>Assinatura registrada.</small>}</div>;
}

export function ZeusCheckInPublic({token}:{token:string}){
  const [link,setLink]=useState<LinkData|null>(null);
  const [error,setError]=useState('');
  const [sent,setSent]=useState(false);
  const [name,setName]=useState('');
  const [notes,setNotes]=useState('');
  const [meter,setMeter]=useState('');
  const [signature,setSignature]=useState('');
  const [answers,setAnswers]=useState<Record<string,{status:string;note:string}>>({});
  const [busy,setBusy]=useState(false);

  useEffect(()=>{void invoke(token,'read').then(result=>{if(result.link?.kind!=='zeus-checkin')throw new Error('Este link não é um checklist de entrada.');setLink(result.link);}).catch(reason=>setError(reason instanceof Error?reason.message:'Link indisponível.'));},[token]);

  if(error)return <main className="check-shell"><section className="check-card state"><h1>Este checklist não está disponível</h1><p>{error}</p></section></main>;
  if(!link)return <main className="check-shell"><section className="check-card state"><p>Abrindo checklist…</p></section></main>;
  if(sent)return <main className="check-shell"><section className="check-card state"><CheckCircle2 size={44}/><h1>Checklist enviado</h1><p>O registro já foi enviado para a oficina.</p></section></main>;

  const items=(link.payload.items||[]) as string[];
  const submit=async()=>{
    if(!name.trim()){setError('Informe quem realizou a conferência.');return;}
    const missing=items.find(item=>!answers[item]?.status);
    if(missing){setError(`Responda o item: ${missing}`);return;}
    if(link.payload.requireSignature&& !signature){setError('A assinatura é obrigatória para concluir.');return;}
    setBusy(true);setError('');
    try{
      await invoke(token,'respond',{name:name.trim(),notes:notes.trim(),meter:meter.trim(),signature,answers:items.map(item=>({item,status:answers[item].status,note:answers[item].note||''}))});
      setSent(true);
    }catch(reason){setError(reason instanceof Error?reason.message:'Não foi possível enviar o checklist.');}
    finally{setBusy(false);}
  };

  return <main className="check-shell"><section className="check-card">
    <header><span>{link.payload.business||'CRM PLUS'}</span><h1>{link.title}</h1><p>{[link.payload.customer,link.payload.asset].filter(Boolean).join(' · ')}</p></header>
    <div className="check-meta"><div><span>OS</span><strong>{String(link.payload.jobNumber||'').padStart(4,'0')}</strong></div><div><span>{link.payload.meterLabel||'Quilometragem'}</span><input value={meter} onChange={e=>setMeter(e.target.value)} placeholder="Informar"/></div></div>
    <div className="check-items">{items.map((item,index)=>{const current=answers[item]||{status:'',note:''};return <article key={item}><div className="check-item-title"><b>{String(index+1).padStart(2,'0')}</b><strong>{item}</strong></div><div className="check-options">{['OK','Atenção','Não se aplica'].map(status=><button type="button" key={status} className={current.status===status?'active':''} onClick={()=>setAnswers({...answers,[item]:{...current,status}})}>{status}</button>)}</div><input value={current.note} onChange={e=>setAnswers({...answers,[item]:{...current,note:e.target.value}})} placeholder="Observação deste item (opcional)"/></article>;})}</div>
    <label><span>Responsável pela conferência</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="Nome completo"/></label>
    <label><span>Observações gerais</span><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} placeholder="Avarias, objetos, ressalvas ou informações adicionais"/></label>
    <SignaturePad value={signature} onChange={setSignature}/>
    {error&&<p className="check-error">{error}</p>}
    <button className="check-submit" disabled={busy} onClick={()=>void submit()}>{busy?'Enviando…':'Concluir checklist'}</button>
  </section>
  <style jsx global>{`
    *{box-sizing:border-box}body{margin:0;background:#f3f5f7;color:#111827;font-family:Inter,Arial,sans-serif}.check-shell{min-height:100dvh;padding:28px 14px}.check-card{max-width:760px;margin:0 auto;background:#fff;border:1px solid #dde2e7;border-radius:18px;padding:28px;box-shadow:0 18px 50px rgba(15,23,42,.08)}.check-card.state{text-align:center;padding:60px 28px}.check-card header{padding-bottom:20px;border-bottom:1px solid #e5e7eb}.check-card header>span{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#64748b;font-weight:700}.check-card h1{margin:7px 0 6px;font-size:28px}.check-card header p{margin:0;color:#64748b}.check-meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:18px 0}.check-meta>div{border:1px solid #e5e7eb;border-radius:12px;padding:14px;display:grid;gap:6px}.check-meta span,.check-card label>span,.check-sign>div>span{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:700}.check-meta input,.check-card label input,.check-card label textarea,.check-items article>input{width:100%;border:1px solid #dbe1e7;border-radius:9px;min-height:42px;padding:9px 11px;font:inherit;background:#fff}.check-items{display:grid;gap:12px}.check-items article{border:1px solid #e5e7eb;border-radius:14px;padding:15px;display:grid;gap:12px}.check-item-title{display:flex;gap:10px;align-items:flex-start}.check-item-title b{font-size:11px;color:#94a3b8}.check-options{display:flex;gap:8px;flex-wrap:wrap}.check-options button{border:1px solid #d5dbe2;background:#fff;border-radius:999px;padding:8px 12px}.check-options button.active{background:#111827;color:#fff;border-color:#111827}.check-card label{display:grid;gap:7px;margin-top:16px}.check-sign{margin-top:18px;display:grid;gap:8px}.check-sign>div{display:flex;justify-content:space-between;align-items:center}.check-sign button{border:0;background:none;display:flex;gap:5px;align-items:center;color:#475569}.check-sign canvas{width:100%;height:150px;touch-action:none;border:1px dashed #94a3b8;border-radius:12px;background:#fff}.check-sign small{color:#64748b}.check-error{color:#b42318;background:#fff1f0;border:1px solid #fecaca;border-radius:10px;padding:10px 12px}.check-submit{width:100%;min-height:50px;margin-top:18px;border:0;border-radius:11px;background:#111827;color:#fff;font-weight:800}.check-submit:disabled{opacity:.6}@media(max-width:640px){.check-shell{padding:0}.check-card{border-radius:0;border-left:0;border-right:0;padding:20px 14px;min-height:100dvh}.check-meta{grid-template-columns:1fr}.check-card h1{font-size:24px}.check-options{display:grid;grid-template-columns:1fr 1fr 1fr}.check-options button{padding:10px 6px;font-size:12px}}
  `}</style></main>;
}
