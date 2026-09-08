import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

export default function Cookies(){
  return <><Header/><main className="institutional-shell">
    <section className="institutional-hero">
      <span className="eyebrow">Legal</span>
      <h1>Cookies e tecnologias de apoio.</h1>
      <p>Cookies e mecanismos semelhantes podem ser utilizados quando necessários para manter a sessão, lembrar preferências, proteger o acesso e entender o funcionamento do site e dos aplicativos.</p>
    </section>

    <section className="institutional-grid">
      <article className="institutional-card">
        <h2>Essenciais</h2>
        <p>Podem ser utilizados para autenticação, segurança, navegação, balanceamento e funcionamento básico do serviço. Sem esses mecanismos, determinadas áreas podem não operar corretamente.</p>
      </article>
      <article className="institutional-card">
        <h2>Preferências</h2>
        <p>Podem guardar escolhas do usuário, como preferências de interface, quando essa persistência for necessária para melhorar a continuidade da experiência.</p>
      </article>
      <article className="institutional-card">
        <h2>Medição e melhoria</h2>
        <p>Quando ferramentas de análise forem utilizadas, elas devem servir para compreender desempenho, erros e uso do produto, respeitando as configurações de privacidade aplicáveis.</p>
      </article>
      <article className="institutional-card">
        <h2>Terceiros</h2>
        <p>Serviços técnicos integrados podem utilizar seus próprios mecanismos necessários para entregar autenticação, infraestrutura, pagamentos ou outras funções contratadas. Quando aplicável, isso será informado nas políticas correspondentes.</p>
      </article>
    </section>

    <p className="institutional-note">As categorias efetivamente utilizadas podem mudar conforme as integrações habilitadas no projeto. A versão publicada deve refletir apenas tecnologias realmente presentes no ambiente de produção.</p>
  </main><Footer/></>;
}
