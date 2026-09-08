import type { AppTone } from '@/lib/catalog';

export function AppArtwork({tone,compact=false}:{tone:AppTone;compact?:boolean}){
  if(tone==='zeus'){
    const src=compact?'/brand/zeus/zeus-cover-solid.svg':'/brand/zeus/zeus-cover-app.svg';
    return (
      <div className={`artwork artwork-photo artwork-zeus ${compact?'artwork-compact':''}`} aria-hidden="true">
        <img src={src} alt="" draggable={false} style={{width:'100%',height:'100%',display:'block',objectFit:'cover'}} />
      </div>
    );
  }

  if(tone==='artemis'){
    return (
      <div className={`artwork artwork-photo artwork-artemis ${compact?'artwork-compact':''}`} aria-hidden="true">
        <div className="app-photo"/>
        <div className="photo-vignette"/>
        <div className="art-title">RESTAURANTE</div>
        <div className="art-caption">PEDIDOS · COZINHA · CAIXA</div>
      </div>
    );
  }

  return (
    <div className={`artwork artwork-${tone} ${compact?'artwork-compact':''}`} aria-hidden="true">
      <div className="art-backdrop"/>
      <div className="art-title">{tone==='athena'?'EXPERIÊNCIA':tone==='kronos'?'VENDAS':'ORÇAMENTOS'}</div>

      {tone==='athena' && <div className="athena-readout">
        <div className="athena-mark">CX</div>
        <span>RESPOSTAS · LEITURA</span>
        <i/><i/><i/><i/><i/><i/>
      </div>}

      {tone==='kronos' && <div className="kronos-flow">
        <span>OPORTUNIDADES</span>
        <i/><i/><i/><i/><i/>
      </div>}

      {tone==='athena-budget' && <div className="budget-sheet">
        <span>ORÇAMENTO</span>
        <strong>Proposta digital</strong>
        <i/><i/><i/><i/>
        <div className="budget-action">COMPARTILHAR POR LINK</div>
      </div>}

      <div className="art-caption">{tone==='athena'?'PESQUISAS · RESPOSTAS':tone==='kronos'?'ROTINA · OPORTUNIDADES':'ITENS · LINK · DECISÃO'}</div>
    </div>
  );
}
