import type { AppTone } from '@/lib/catalog';

export function AppArtwork({tone,compact=false}:{tone:AppTone;compact?:boolean}){
  return <div className={`artwork artwork-${tone} ${compact?'artwork-compact':''}`} aria-hidden="true">
    <div className="art-grid"/><div className="art-panel art-panel-main"><span className="art-kicker">{tone==='artemis'?'PEDIDOS • COZINHA • CAIXA':tone==='zeus'?'OS • FLUXO • HISTÓRICO':'CRM PLUS STORE'}</span><div className="art-line art-line-lg"/><div className="art-line"/><div className="art-line art-line-sm"/></div>
    <div className="art-panel art-panel-side"><div className="art-chip"/><div className="art-chip"/><div className="art-chip"/></div>
    <div className="art-index">{tone==='zeus'?'OS-0248':tone==='artemis'?'MESA 08':'CRM+'}</div>
  </div>;
}
