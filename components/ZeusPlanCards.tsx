import Link from 'next/link';
import { ArrowRight, Check, X } from 'lucide-react';
import type { PublicPlan } from '@/lib/publicPlans';
import { ZEUS_PLANS, type ZeusPlanCode } from '@/lib/operations/zeusPlans';

const order: ZeusPlanCode[] = ['start','essencial','plus','premium'];
const comparisonFeatures = ZEUS_PLANS.premium.commercialFeatures.filter(feature => feature !== 'Até 10 acessos');
const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });

export function ZeusPlanCards({ plans }: { plans: PublicPlan[] }){
  const byCode = new Map(plans.filter(plan => plan.plan_code).map(plan => [plan.plan_code as ZeusPlanCode, plan]));

  return <div className="zeus-commercial-plans">
    <div className="zeus-commercial-grid">{order.map(code=>{
      const plan=ZEUS_PLANS[code];
      const dbPlan=byCode.get(code);
      return <article key={code} className={`public-price-card zeus-commercial-card${plan.recommended?' is-recommended':''}`}>
        <div className="price-card-heading"><h4>{plan.name}</h4>{plan.recommended&&<span>Recomendado</span>}</div>
        <div className="zeus-price"><strong>{dbPlan ? money(dbPlan.amount_cents) : 'Consulte'}</strong>{dbPlan&&<small>/mês</small>}</div>
        <span className="zeus-seat-count">{dbPlan?.seats ?? plan.seats} {(dbPlan?.seats ?? plan.seats)===1?'acesso':'acessos'}</span>
        <p>{plan.summary}</p>
        <ul>{plan.highlights.map(item=><li key={item}><Check size={16}/>{item}</li>)}</ul>
        {dbPlan&&<Link className="primary zeus-plan-cta" href={`/checkout?app=zeus&plano=${dbPlan.id}`}>Escolher {plan.name.replace('Zeus ','')} <ArrowRight size={16}/></Link>}
      </article>;
    })}</div>

    <section className="zeus-plan-comparison" id="comparacao-zeus" aria-labelledby="zeus-comparison-title">
      <div className="zeus-comparison-heading">
        <div><span>Compare lado a lado</span><h3 id="zeus-comparison-title">O que cada plano libera</h3></div>
        <p>✓ função incluída · X função não incluída. Os planos superiores mantêm os recursos dos níveis anteriores.</p>
      </div>
      <div className="zeus-plan-table-wrap">
        <table>
          <thead><tr><th>Função</th>{order.map(code=>{const plan=ZEUS_PLANS[code];const dbPlan=byCode.get(code);return <th key={code} className={plan.recommended?'recommended-column':''}><strong>{plan.name.replace('Zeus ','')}</strong><b>{dbPlan?money(dbPlan.amount_cents):'—'}{dbPlan&&<em>/mês</em>}</b><small>{dbPlan?.seats ?? plan.seats} acesso{(dbPlan?.seats ?? plan.seats)>1?'s':''}</small></th>;})}</tr></thead>
          <tbody>{comparisonFeatures.map(feature=><tr key={feature}>
            <td className="feature-name">{feature}</td>
            {order.map(code=>{
              const available=ZEUS_PLANS[code].commercialFeatures.includes(feature);
              return <td key={`${feature}-${code}`} className={available?'is-available':'is-unavailable'}>{available?<><Check size={18}/><span className="sr-only">Incluído</span></>:<><X size={18}/><span className="sr-only">Não incluído</span></>}</td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>
    </section>

    <style jsx>{`
      .zeus-commercial-plans{display:grid;gap:42px}
      .zeus-commercial-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;align-items:stretch}
      .zeus-commercial-card{position:relative;min-height:100%}
      .zeus-commercial-card.is-recommended{outline:2px solid var(--brand-blue,#2563eb);outline-offset:-2px}
      .zeus-price{display:flex;align-items:baseline;gap:5px;margin:4px 0 4px}.zeus-price strong{font-family:var(--display);font-size:clamp(28px,2.2vw,38px);letter-spacing:-.045em}.zeus-price small{color:#8f8f8a;font-size:11px}
      .zeus-seat-count{display:block;color:var(--plan-accent,#e3b964);font-size:12px;font-weight:700;margin-bottom:16px}
      .zeus-commercial-card>p{min-height:60px;margin-bottom:0}
      .zeus-commercial-card ul{margin-top:20px}
      .zeus-plan-cta{margin-top:auto!important}
      .zeus-plan-comparison{display:grid;gap:16px;padding-top:2px}
      .zeus-comparison-heading{display:flex;align-items:end;justify-content:space-between;gap:24px}
      .zeus-comparison-heading span{display:block;margin-bottom:7px;color:#777772;font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
      .zeus-comparison-heading h3{margin:0;color:#f5f5f0;font-size:24px}
      .zeus-comparison-heading p{max-width:440px;margin:0;color:#8f8f8a;font-size:12px;line-height:1.55}
      .zeus-plan-table-wrap{overflow:auto;border:1px solid #2a2a2a;border-radius:18px;background:#111;box-shadow:0 18px 50px rgba(0,0,0,.18)}
      .zeus-plan-table-wrap table{width:100%;border-collapse:collapse;min-width:900px;color:#e9e9e3;background:#111}
      .zeus-plan-table-wrap th,.zeus-plan-table-wrap td{height:54px;padding:11px 14px;border-bottom:1px solid #262626;text-align:center;background:#111;color:#e9e9e3}
      .zeus-plan-table-wrap thead th{height:100px;background:#151515;color:#f5f5f0;font-size:13px;font-weight:700;position:sticky;top:0;z-index:1}
      .zeus-plan-table-wrap thead th.recommended-column{background:#171b25;box-shadow:inset 0 2px 0 #2563eb}
      .zeus-plan-table-wrap th:first-child,.zeus-plan-table-wrap td:first-child{text-align:left;width:40%;min-width:300px}
      .zeus-plan-table-wrap th strong{display:block;font-size:14px}.zeus-plan-table-wrap th b{display:block;margin-top:7px;font-size:14px}.zeus-plan-table-wrap th b em{font-size:9px;font-style:normal;font-weight:500;color:#888}.zeus-plan-table-wrap th small{display:block;margin-top:3px;color:#777772;font-size:10px;font-weight:500}
      .zeus-plan-table-wrap tbody tr:last-child td{border-bottom:0}
      .zeus-plan-table-wrap tbody tr:hover td{background:#151515}
      .zeus-plan-table-wrap td.feature-name{color:#c8c8c2;font-size:12px;font-weight:600}
      .zeus-plan-table-wrap td.is-available{color:#e3b964}.zeus-plan-table-wrap td.is-unavailable{color:#8b4d4d}
      .zeus-plan-table-wrap td.is-available :global(svg),.zeus-plan-table-wrap td.is-unavailable :global(svg){display:block;margin:auto;stroke-width:2.4}
      .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
      @media(max-width:1100px){.zeus-commercial-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.zeus-commercial-card>p{min-height:0}}
      @media(max-width:620px){.zeus-commercial-grid{grid-template-columns:1fr}.zeus-comparison-heading{align-items:start;flex-direction:column;gap:8px}.zeus-plan-comparison{margin-left:-4px;margin-right:-4px}.zeus-plan-table-wrap{border-radius:14px}}
    `}</style>
  </div>;
}
