import type { AppTone } from '@/lib/catalog';

export function AppArtwork({tone,compact=false}:{tone:AppTone;compact?:boolean}){
  return (
    <div className={`artwork artwork-${tone} ${compact?'artwork-compact':''}`} aria-hidden="true">
      <div className="art-backdrop"/>
      <div className="art-title">{tone==='zeus'?'OFICINA':tone==='artemis'?'RESTAURANTE':tone==='athena'?'EXPERIÊNCIA':tone==='kronos'?'VENDAS':'ORÇAMENTOS'}</div>

      {tone==='zeus' && <>
        <div className="zeus-sheet">
          <span>ORDEM DE SERVIÇO</span>
          <strong>Fluxo operacional</strong>
          <div className="zeus-stages"><i>Entrada</i><i>Diagnóstico</i><i>Execução</i><i>Relatório</i></div>
          <div className="zeus-progress"><b/></div>
        </div>
        <div className="zeus-rail"><span>FLUXO</span><i/><i/><i/><i/></div>
      </>}

      {tone==='artemis' && <div className="artemis-flow">
        {['Mesa','Pedido','Cozinha','Caixa','Delivery'].map(item=><div key={item}><b/><span>{item}</span></div>)}
      </div>}

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

      <div className="art-caption">{tone==='zeus'?'OS · FLUXO · HISTÓRICO':tone==='artemis'?'PEDIDOS · COZINHA · CAIXA':tone==='athena'?'PESQUISAS · RESPOSTAS':tone==='kronos'?'ROTINA · OPORTUNIDADES':'ITENS · LINK · DECISÃO'}</div>
    </div>
  );
}
