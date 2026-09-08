import type { AppTone } from '@/lib/catalog';

type ArtworkLayout = 'default' | 'portrait' | 'landscape';

export function AppArtwork({tone,compact=false,layout='default'}:{tone:AppTone;compact?:boolean;layout?:ArtworkLayout}){
  if(tone==='zeus'){
    const src = layout==='portrait'
      ? '/brand/zeus/zeus-cover-card.svg'
      : compact || layout==='landscape'
        ? '/brand/zeus/zeus-cover-solid.svg'
        : '/brand/zeus/zeus-cover-app.svg';

    return (
      <div className={`artwork artwork-photo artwork-zeus artwork-zeus-asset ${compact?'artwork-compact':''}`} aria-hidden="true">
        <img className="zeus-art-image" src={src} alt="" draggable={false} />
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
