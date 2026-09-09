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
    const portrait = compact || layout==='portrait';
    return (
      <div
        className={`artwork artwork-photo artwork-artemis-asset ${compact?'artwork-compact':''}`}
        aria-hidden="true"
        style={{
          background:'radial-gradient(circle at 18% 22%,rgba(116,55,20,.28),transparent 38%),linear-gradient(145deg,#080706 0%,#0c0908 52%,#050505 100%)'
        }}
      >
        <div style={{position:'absolute',inset:0,opacity:.34,pointerEvents:'none'}}>
          <span style={{position:'absolute',left:0,top:'16%',width:'44%',height:'1px',background:'linear-gradient(90deg,transparent,#8c5b39)'}}/>
          <span style={{position:'absolute',right:'-5%',top:'4%',width:'28%',aspectRatio:'1',border:'1px solid rgba(138,89,54,.18)',borderRadius:'50%'}}/>
          <span style={{position:'absolute',right:0,bottom:'28%',width:'38%',height:'1px',background:'linear-gradient(90deg,transparent,#8c5b39)'}}/>
        </div>

        {portrait ? (
          <div style={{position:'absolute',left:'7%',right:'7%',top:'8%',height:'48%',display:'flex',alignItems:'center',gap:'5%'}}>
            <img
              src="/brand/artemis/artemis-mark.png"
              alt=""
              draggable={false}
              style={{width:'43%',height:'100%',objectFit:'contain',objectPosition:'center'}}
            />
            <div style={{minWidth:0,display:'flex',flexDirection:'column',justifyContent:'center'}}>
              <span style={{fontSize:'clamp(8px,2vw,13px)',fontWeight:700,letterSpacing:'.18em',color:'#c8a27e'}}>RESTAURANTE</span>
              <strong style={{fontFamily:"Georgia,'Times New Roman',serif",fontSize:'clamp(26px,7vw,56px)',lineHeight:.95,letterSpacing:'-.035em',color:'#f3f1ee'}}>Artemis</strong>
              <small style={{marginTop:'8px',fontSize:'clamp(9px,2.1vw,14px)',letterSpacing:'.03em',color:'#aaa39d'}}>Gestão para restaurantes</small>
            </div>
          </div>
        ) : (
          <div style={{position:'absolute',inset:'8% 8% 10%',display:'grid',gridTemplateColumns:'minmax(220px,.82fr) minmax(280px,1.18fr)',alignItems:'center',gap:'6%'}}>
            <img
              src="/brand/artemis/artemis-mark.png"
              alt=""
              draggable={false}
              style={{width:'100%',height:'100%',objectFit:'contain',objectPosition:'center'}}
            />
            <div style={{minWidth:0}}>
              <span style={{display:'block',fontSize:'clamp(10px,1.15vw,18px)',fontWeight:700,letterSpacing:'.22em',color:'#c8a27e'}}>RESTAURANTE</span>
              <strong style={{display:'block',fontFamily:"Georgia,'Times New Roman',serif",fontSize:'clamp(56px,7vw,118px)',lineHeight:.95,letterSpacing:'-.045em',color:'#f3f1ee'}}>Artemis</strong>
              <small style={{display:'block',marginTop:'12px',fontSize:'clamp(18px,2.2vw,38px)',letterSpacing:'.02em',color:'#aaa39d'}}>Gestão para restaurantes</small>
            </div>
          </div>
        )}
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
