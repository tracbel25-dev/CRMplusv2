import type { AppTone } from '@/lib/catalog';
import { AppAsset } from '@/components/AppAsset';

type ArtworkLayout = 'default' | 'portrait' | 'landscape';

export function AppArtwork({tone,compact=false,layout='default'}:{tone:AppTone;compact?:boolean;layout?:ArtworkLayout}){
  if(tone==='zeus' || tone==='artemis'){
    const kind = compact || layout==='portrait' ? 'card' : 'cover';
    return (
      <div
        className={`artwork artwork-photo artwork-${tone}-asset ${compact?'artwork-compact':''}`}
        aria-hidden="true"
        style={{background:'#070707'}}
      >
        <AppAsset
          app={tone}
          kind={kind}
          alt=""
          style={{
            width:'100%',
            height:'100%',
            display:'block',
            objectFit:kind==='card'?'cover':'contain',
            objectPosition:'center',
          }}
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
