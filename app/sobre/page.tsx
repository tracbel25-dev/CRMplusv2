import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

export default function Sobre(){
  return <><Header/><main className="institutional-shell">
    <section className="institutional-hero">
      <span className="eyebrow">Sobre o CRM PLUS</span>
      <h1>Software para organizar a operação sem engessar o negócio.</h1>
      <p>O CRM PLUS nasce da proposta de reduzir burocracia, etapas e cliques. Em vez de tratar empresas diferentes como se trabalhassem da mesma forma, estudamos cada segmento e desenvolvemos aplicativos próprios para suas rotinas.</p>
    </section>

    <section className="institutional-grid">
      <article className="institutional-card">
        <h2>Menos burocracia</h2>
        <p>O ponto de partida é simples: a ferramenta deve ajudar a operação a avançar, não criar mais trabalho. Por isso, buscamos transformar tarefas recorrentes em ações mais diretas e informações mais fáceis de acompanhar.</p>
      </article>
      <article className="institutional-card">
        <h2>Estrutura pronta, operação personalizada</h2>
        <p>Cada aplicativo possui uma configuração padrão para o segmento que atende. A partir dessa base, campos, etapas e funções podem ser ajustados para acompanhar o modelo de operação de cada negócio.</p>
      </article>
      <article className="institutional-card">
        <h2>Para diferentes estágios de negócio</h2>
        <p>Quem está começando encontra uma estrutura para organizar a empresa desde cedo. Quem já conhece seus processos encontra histórico, controle e informação para acompanhar a operação e apoiar decisões.</p>
      </article>
      <article className="institutional-card">
        <h2>Inteligência artificial com função prática</h2>
        <p>A inteligência artificial entra como apoio à estrutura dos aplicativos, ajudando onde houver ganho real para a operação. A proposta não é adicionar IA por aparência, mas utilizá-la onde ela possa reduzir esforço, organizar informação ou facilitar uma decisão.</p>
      </article>
      <article className="institutional-card">
        <h2>Nosso foco é o produto</h2>
        <p>O CRM PLUS é uma empresa de software. Não estruturamos a assinatura em torno da venda de cursos. Recursos, atualizações e suporte previstos no plano fazem parte da experiência do produto.</p>
      </article>
      <article className="institutional-card">
        <h2>Quem está construindo</h2>
        <p><strong>Alisson Mafra</strong> — sócio e fundador do CRM PLUS.</p>
        <p><strong>Deivid Lohan</strong> — sócio e desenvolvedor do CRM PLUS.</p>
      </article>
    </section>

    <div className="institutional-actions"><Link className="primary" href="/aplicativos">Conhecer aplicativos</Link><Link className="ghost" href="/suporte">Falar com o suporte</Link></div>
  </main><Footer/></>;
}
