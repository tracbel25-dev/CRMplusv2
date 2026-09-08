import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

export default function Termos(){
  return <><Header/><main className="institutional-shell">
    <section className="institutional-hero">
      <span className="eyebrow">Legal</span>
      <h1>Termos de Uso.</h1>
      <p>Estas regras organizam o uso do CRM PLUS Store e dos aplicativos contratados, incluindo acesso, assinatura, suporte e responsabilidades básicas de utilização.</p>
    </section>

    <section className="institutional-grid">
      <article className="institutional-card">
        <h2>Uso da conta</h2>
        <p>O acesso é destinado aos usuários autorizados pela conta contratante. Credenciais devem ser mantidas em segurança e não devem ser compartilhadas fora das regras de acesso previstas para cada aplicativo.</p>
      </article>
      <article className="institutional-card">
        <h2>Assinatura e recursos</h2>
        <p>A assinatura dá acesso aos recursos, atualizações e serviços previstos no plano contratado. Funcionalidades opcionais ou integrações externas podem depender de configuração, disponibilidade técnica ou condições específicas informadas antes da contratação.</p>
      </article>
      <article className="institutional-card">
        <h2>Configuração</h2>
        <p>Os aplicativos podem oferecer personalização de campos, etapas, funções e preferências dentro dos limites técnicos de cada produto. O suporte pode auxiliar o cliente na configuração quando esse atendimento estiver previsto no plano.</p>
      </article>
      <article className="institutional-card">
        <h2>Disponibilidade e manutenção</h2>
        <p>O CRM PLUS busca manter os serviços disponíveis e estáveis, mas manutenções, falhas de provedores, indisponibilidades de internet ou eventos fora do controle do serviço podem afetar temporariamente o acesso.</p>
      </article>
      <article className="institutional-card">
        <h2>Responsabilidade do cliente</h2>
        <p>O cliente é responsável pela veracidade das informações inseridas, pelo uso adequado da ferramenta e pela gestão dos usuários autorizados em sua conta.</p>
      </article>
      <article className="institutional-card">
        <h2>Privacidade e dados</h2>
        <p>O tratamento de informações pessoais e operacionais segue os princípios apresentados na Política de Privacidade e nas regras específicas de cada aplicativo.</p>
      </article>
    </section>

    <p className="institutional-note">Condições comerciais específicas, valores, ciclos de cobrança, cancelamento e eventuais limites de uso devem seguir o plano e a oferta apresentados no momento da contratação.</p>
  </main><Footer/></>;
}
