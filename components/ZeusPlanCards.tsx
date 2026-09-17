import { Check } from 'lucide-react';
import { ZEUS_PLANS, type ZeusPlanCode } from '@/lib/operations/zeusPlans';

const order: ZeusPlanCode[] = ['start','essencial','plus','premium'];
const comparisonFeatures = ZEUS_PLANS.premium.commercialFeatures;

export function ZeusPlanCards(){
  return <div className="zeus-commercial-plans">
    <div className="zeus-commercial-grid">{order.map(code=>{const plan=ZEUS_PLANS[code];return <article key={code} className={`public-price-card zeus-commercial-card${plan.recommended?' is-recommended':''}`}>
      <div className="price-card-heading"><h4>{plan.name}</h4>{plan.recommended&&<span>Recomendado</span>}</div>
      <strong className="zeus-seat-count">{plan.seats} {plan.seats===1?'acesso':'acessos'}</strong>
      <p>{plan.summary}</p>
      <div className="zeus-functions-label">Funções incluídas</div>
      <ul>{plan.commercialFeatures.map(item=><li key={item}><Check size={15}/>{item}</li>)}</ul>
    </article>;})}</div>

    <section className="zeus-plan-comparison" id="comparacao-zeus" aria-labelledby="zeus-comparison-title">
      <div className="zeus-comparison-heading">
        <div><span>Detalhes por plano</span><h3 id="zeus-comparison-title">Comparação completa</h3></div>
        <p>Todas as funções estão listadas individualmente, sem resumir como “tudo do plano anterior”.</p>
      </div>
      <div className="zeus-plan-table-wrap">
        <table>
          <thead><tr><th>Função</th>{order.map(code=><th key={code}>{ZEUS_PLANS[code].name.replace('Zeus ','')}<small>{ZEUS_PLANS[code].seats} acesso{ZEUS_PLANS[code].seats>1?'s':''}</small></th>)}</tr></thead>
          <tbody>{comparisonFeatures.map(feature=><tr key={feature}>
            <td className="feature-name">{feature}</td>
            {order.map(code=>{const available=ZEUS_PLANS[code].commercialFeatures.includes(feature);return <td key={`${feature}-${code}`} className={available?'is-available':'is-unavailable'}>{available?<><Check size={17}/><span className="sr-only">Incluído</span></>:<><span aria-hidden="true">—</span><span className="sr-only">Não incluído</span></>}</td>;})}
          </tr>)}</tbody>
        </table>
      </div>
    </section>

    <style jsx>{`
      .zeus-commercial-plans{display:grid;gap:40px}
      .zeus-commercial-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;align-items:start}
      .zeus-commercial-card{position:relative;min-height:100%}
      .zeus-commercial-card.is-recommended{outline:2px solid var(--brand-blue,#2563eb);outline-offset:-2px}
      .zeus-seat-count{display:block;font-size:1.35rem;margin:12px 0 6px}
      .zeus-functions-label{margin-top:22px;padding-top:18px;border-top:1px solid #333;color:#8f8f8a;font-size:9px;font-weight:700;letter-spacing:.13em;text-transform:uppercase}
      .zeus-commercial-card ul{border-top:0;padding-top:14px;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:18px;row-gap:11px}
      .zeus-commercial-card li{font-size:11px;line-height:1.4}
      .zeus-plan-comparison{display:grid;gap:16px;padding-top:2px}
      .zeus-comparison-heading{display:flex;align-items:end;justify-content:space-between;gap:24px}
      .zeus-comparison-heading span{display:block;margin-bottom:7px;color:#777772;font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
      .zeus-comparison-heading h3{margin:0;color:#f5f5f0;font-size:24px}
      .zeus-comparison-heading p{max-width:420px;margin:0;color:#8f8f8a;font-size:12px;line-height:1.55}
      .zeus-plan-table-wrap{overflow:auto;border:1px solid #2a2a2a;border-radius:18px;background:#111;box-shadow:0 18px 50px rgba(0,0,0,.18)}
      .zeus-plan-table-wrap table{width:100%;border-collapse:collapse;min-width:820px;color:#e9e9e3;background:#111}
      .zeus-plan-table-wrap th,.zeus-plan-table-wrap td{height:58px;padding:12px 16px;border-bottom:1px solid #262626;text-align:center;background:#111;color:#e9e9e3}
      .zeus-plan-table-wrap thead th{height:76px;background:#151515;color:#f5f5f0;font-size:13px;font-weight:700;position:sticky;top:0;z-index:1}
      .zeus-plan-table-wrap th:first-child,.zeus-plan-table-wrap td:first-child{text-align:left;width:42%}
      .zeus-plan-table-wrap th small{display:block;margin-top:4px;color:#777772;font-size:10px;font-weight:500}
      .zeus-plan-table-wrap tbody tr:last-child td{border-bottom:0}
      .zeus-plan-table-wrap tbody tr:hover td{background:#151515}
      .zeus-plan-table-wrap td.feature-name{color:#c8c8c2;font-size:12px;font-weight:600}
      .zeus-plan-table-wrap td.is-available{color:var(--plan-accent,#e3b964)}
      .zeus-plan-table-wrap td.is-available :global(svg){display:block;margin:auto;stroke-width:2.3}
      .zeus-plan-table-wrap td.is-unavailable{color:#4f4f4b;font-size:16px}
      .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
      @media(max-width:980px){.zeus-commercial-card ul{grid-template-columns:1fr}}
      @media(max-width:760px){.zeus-commercial-grid{grid-template-columns:1fr}}
      @media(max-width:620px){.zeus-comparison-heading{align-items:start;flex-direction:column;gap:8px}.zeus-plan-comparison{margin-left:-4px;margin-right:-4px}.zeus-plan-table-wrap{border-radius:14px}}
    `}</style>
  </div>;
}
