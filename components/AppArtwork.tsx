import type { AppTone } from '@/lib/catalog';

type ArtworkLayout = 'default' | 'portrait' | 'landscape';

export function AppArtwork({tone,compact=false,layout='default'}:{tone:AppTone;compact?:boolean;layout?:ArtworkLayout}){
  if(tone==='zeus'){
    const src = layout==='landscape'
      ? '/brand/zeus/zeus-cover-solid.svg'
      : compact || layout==='portrait'
        ? '/brand/zeus/zeus-cover-card.svg'
        : '/brand/zeus/zeus-cover-app.svg';

    return (
      <div className={`artwork artwork-photo artwork-zeus-asset ${compact?'artwork-compact':''}`} aria-hidden="true" style={{background:'#070707'}}>
        <img
          className="zeus-art-image"
          src={src}
          alt=""
          draggable={false}
          style={{width:'100%',height:'100%',display:'block',objectFit:'contain',objectPosition:'center top'}}
        />
      </div>
    );
  }

  if(tone==='artemis'){
    const src = layout==='landscape'
      ? '/brand/artemis/artemis-cover-solid.svg'
      : compact || layout==='portrait'
        ? '/brand/artemis/artemis-cover-card.svg'
        : '/brand/artemis/artemis-cover-solid.svg';

    return (
      <div className={`artwork artwork-photo artwork-artemis-asset ${compact?'artwork-compact':''}`} aria-hidden="true" style={{background:'#0b0807'}}>
        <img
          className="artemis-art-image"
          src={src}
          alt=""
          draggable={false}
          style={{width:'100%',height:'100%',display:'block',objectFit:'cover',objectPosition:'center'}}
        />
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
