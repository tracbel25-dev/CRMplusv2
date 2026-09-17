import { Check } from 'lucide-react';
import { ZEUS_MODULES_BY_PLAN, ZEUS_PLANS, type ZeusPlanCode } from '@/lib/operations/zeusPlans';

const order: ZeusPlanCode[] = ['start','essencial','plus','premium'];
const rows = [
  ['Ordens de serviço','✓','✓','✓','✓'],
  ['IA / Groq','✓','✓','✓','✓'],
  ['Agendamentos','—','✓','✓','✓'],
  ['Checklist','—','✓','✓','✓'],
  ['Diagnóstico','—','✓','✓','✓'],
  ['Orçamentos','—','✓','✓','✓'],
  ['Faturamento','—','—','✓','✓'],
  ['Dashboard gerencial','—','—','✓','✓'],
  ['Filtros avançados e exportação','—','—','✓','✓'],
  ['Equipe e permissões individuais','—','—','✓','✓'],
  ['Configurações operacionais completas','—','—','—','✓'],
];

export function ZeusPlanCards(){
  return <div className="zeus-commercial-plans">
    <div className="zeus-commercial-grid">{order.map(code=>{const plan=ZEUS_PLANS[code];return <article key={code} className={`public-price-card zeus-commercial-card${plan.recommended?' is-recommended':''}`}>
      <div className="price-card-heading"><h4>{plan.name}</h4>{plan.recommended&&<span>Recomendado</span>}</div>
      <strong className="zeus-seat-count">{plan.seats} {plan.seats===1?'acesso':'acessos'}</strong>
      <p>{plan.summary}</p>
      <ul>{plan.highlights.map(item=><li key={item}><Check size={16}/>{item}</li>)}</ul>
    </article>;})}</div>
    <div className="zeus-plan-comparison" id="comparacao-zeus"><h3>Comparação completa</h3><div className="zeus-plan-table-wrap"><table><thead><tr><th>Recurso</th>{order.map(code=><th key={code}>{ZEUS_PLANS[code].name.replace('Zeus ','')}<small>{ZEUS_PLANS[code].seats} acesso{ZEUS_PLANS[code].seats>1?'s':''}</small></th>)}</tr></thead><tbody>{rows.map(row=><tr key={row[0]}>{row.map((cell,index)=><td key={`${row[0]}-${index}`}>{cell}</td>)}</tr>)}</tbody></table></div></div>
    <style jsx>{`
      .zeus-commercial-plans{display:grid;gap:28px}.zeus-commercial-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
      .zeus-commercial-card{position:relative}.zeus-commercial-card.is-recommended{outline:2px solid var(--brand-blue,#2563eb);outline-offset:-2px}.zeus-seat-count{display:block;font-size:1.35rem;margin:12px 0 6px}
      .zeus-plan-comparison{display:grid;gap:12px}.zeus-plan-comparison h3{margin:0}.zeus-plan-table-wrap{overflow:auto;border:1px solid #dfe4ec;border-radius:16px;background:#fff}.zeus-plan-table-wrap table{width:100%;border-collapse:collapse;min-width:760px}.zeus-plan-table-wrap th,.zeus-plan-table-wrap td{padding:13px 14px;border-bottom:1px solid #edf0f5;text-align:center}.zeus-plan-table-wrap th:first-child,.zeus-plan-table-wrap td:first-child{text-align:left}.zeus-plan-table-wrap th small{display:block;font-weight:500;opacity:.65;margin-top:3px}
      @media(max-width:980px){.zeus-commercial-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.zeus-commercial-grid{grid-template-columns:1fr}}
    `}</style>
  </div>;
}
