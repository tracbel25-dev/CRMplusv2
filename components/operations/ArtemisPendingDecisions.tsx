'use client';

import { useMemo, useState } from 'react';
import { BellRing, ChevronDown, MapPin, ShoppingBag, UserRound } from 'lucide-react';
import { advanceOrder, cancelOrder, money, orderTotal, type Order } from '@/lib/operations/model';
import type { Workspace } from '@/lib/operations/storage';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { Badge, Button } from './ui';
import './artemis-direct.css';

type ArtemisView = 'inicio' | 'atendimento' | 'cozinha' | 'gestao';

function responsibility(order: Order, w: Workspace): Exclude<ArtemisView,'inicio'> {
  if (order.channel === 'Delivery') {
    const configured = w.data.settings.deliveryAcceptanceView;
    return configured === 'cozinha' || configured === 'gestao' ? configured : 'atendimento';
  }
  return 'atendimento';
}

function ageLabel(createdAt:string){
  const minutes=Math.max(0,Math.floor((Date.now()-new Date(createdAt).getTime())/60000));
  if(minutes<60)return `${minutes} min`;
  return `${Math.floor(minutes/60)}h ${minutes%60}min`;
}

export function ArtemisPendingDecisions({ w, view = 'inicio' }: { w: Workspace; view?: ArtemisView }) {
  const access=useStoreAccess();
  const [selected,setSelected]=useState('');
  const [rejecting,setRejecting]=useState(false);
  const [reason,setReason]=useState('');

  const permanentService=access.hasPermission('artemis','artemis_service');
  const permanentKitchen=access.hasPermission('artemis','artemis_kitchen');
  const temporarySwitch=!access.isOwner && !!w.data.settings.staffViewSwitchEnabled && (permanentService||permanentKitchen);
  const canView=(target:Exclude<ArtemisView,'inicio'>)=>{
    if(target==='gestao')return access.hasPermission('artemis','artemis_manage');
    if(target==='cozinha')return permanentKitchen||temporarySwitch;
    return permanentService||temporarySwitch;
  };

  const pending=useMemo(()=>w.data.orders
    .filter(order=>order.status==='Novo')
    .filter(order=>{
      const target=responsibility(order,w);
      return view==='inicio' ? canView(target) : target===view && canView(target);
    })
    .sort((a,b)=>a.createdAt.localeCompare(b.createdAt)),[
      w.data.orders,w.data.settings.deliveryAcceptanceView,w.data.settings.staffViewSwitchEnabled,
      view,permanentService,permanentKitchen,temporarySwitch
    ]);

  if(!pending.length)return null;
  const accept=async(order:Order)=>{
    const ok=await w.mutate(data=>advanceOrder(data,order.id,'Novo'),`Pedido #${order.number} aceito.`);
    if(ok){setSelected('');setRejecting(false);setReason('');}
  };
  const reject=async(order:Order)=>{
    const clean=reason.trim();
    if(!clean){w.setError('Informe o motivo da recusa.');return;}
    const ok=await w.mutate(data=>cancelOrder(data,order.id,clean),`Pedido #${order.number} recusado.`);
    if(ok){setSelected('');setRejecting(false);setReason('');}
  };

  return <section className="artemis-pending-decisions" aria-label="Pedidos aguardando decisão">
    <div className="artemis-pending-head">
      <div><span className="artemis-pending-icon"><BellRing size={18}/></span><span><strong>Pedidos aguardando decisão</strong><small>{pending.length} pedido(s) para aceitar ou recusar</small></span></div>
      <Badge>{pending.length}</Badge>
    </div>
    <div className="artemis-pending-list">
      {pending.map(order=>{
        const target=responsibility(order,w);
        const open=selected===order.id;
        return <article className={open?'is-open':''} key={order.id}>
          <button className="artemis-pending-summary" onClick={()=>{setSelected(open?'':order.id);setRejecting(false);setReason('');}} aria-expanded={open}>
            <span><strong>#{String(order.number).padStart(3,'0')}</strong><Badge>{order.channel}</Badge></span>
            <span className="artemis-pending-customer">{order.customerName||'Cliente não identificado'}</span>
            <span className="artemis-pending-meta">{ageLabel(order.createdAt)} · {money(orderTotal(order))}</span>
            <ChevronDown size={17}/>
          </button>
          {open&&<div className="artemis-pending-popover">
            <div className="artemis-pending-detail">
              <span><UserRound size={15}/>{order.customerName||'Cliente não identificado'}{order.phone?` · ${order.phone}`:''}</span>
              {order.channel==='Delivery'&&order.address&&<span><MapPin size={15}/>{order.address}</span>}
              <small>Responsável: {target==='atendimento'?'Atendimento':target==='cozinha'?'Cozinha':'Gestão'}</small>
            </div>
            <div className="artemis-pending-items">
              {order.lines.map(line=><div key={line.id}><span><b>{line.quantity}×</b> {line.description}{line.note?` · ${line.note}`:''}</span><strong>{money(line.quantity*line.price)}</strong></div>)}
            </div>
            {order.notes&&<p className="artemis-pending-note"><ShoppingBag size={14}/> {order.notes}</p>}
            {!rejecting?<div className="artemis-pending-actions">
              <Button onClick={()=>void accept(order)}>Aceitar pedido</Button>
              <Button variant="secondary" onClick={()=>setRejecting(true)}>Recusar</Button>
            </div>:<div className="artemis-reject-box">
              <label><span>Motivo da recusa</span><textarea rows={2} value={reason} onChange={event=>setReason(event.target.value)} autoFocus placeholder="Ex.: área fora da entrega, item indisponível..." /></label>
              <div><Button variant="secondary" onClick={()=>{setRejecting(false);setReason('');}}>Voltar</Button><Button onClick={()=>void reject(order)}>Confirmar recusa</Button></div>
            </div>}
          </div>}
        </article>;
      })}
    </div>
  </section>;
}
