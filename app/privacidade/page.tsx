import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

export default function Privacidade(){
  return <><Header/><main className="institutional-shell">
    <section className="institutional-hero">
      <span className="eyebrow">Privacidade</span>
      <h1>Seus dados não são o nosso produto.</h1>
      <p>Esta página resume os princípios de privacidade adotados pelo CRM PLUS Store e pelos aplicativos disponibilizados na plataforma.</p>
    </section>

    <section className="institutional-grid">
      <article className="institutional-card">
        <h2>Confidencialidade</h2>
        <p>As informações de clientes e operações são tratadas como dados confidenciais. O acesso deve ocorrer apenas por pessoas, serviços e integrações necessários ao funcionamento do produto e conforme as permissões aplicáveis.</p>
      </article>
      <article className="institutional-card">
        <h2>Não comercializamos dados</h2>
        <p>O CRM PLUS não vende dados de clientes nem utiliza as informações das operações como produto para publicidade ou trade marketing de terceiros.</p>
      </article>
      <article className="institutional-card">
        <h2>Separação das operações</h2>
        <p>A arquitetura dos aplicativos é pensada para manter os dados de cada operação vinculados à conta correta e reduzir a exposição desnecessária entre produtos, empresas e usuários.</p>
      </article>
      <article className="institutional-card">
        <h2>Uso necessário das informações</h2>
        <p>Os dados podem ser utilizados para autenticação, execução das funções contratadas, segurança, suporte, cobrança, prevenção de abuso, manutenção do serviço e demais finalidades necessárias para entregar o produto solicitado pelo cliente.</p>
      </article>
      <article className="institutional-card">
        <h2>Inteligência Artificial</h2>
        <p>Os recursos de IA são intermediados por uma API própria e por uma camada de servidor da aplicação, com isolamento por conta e por aplicativo, minimização de contexto e controles específicos para memória e aprendizado.</p>
        <p><Link href="/privacidade/ia">Consultar o Termo de Privacidade, Proteção de Dados e Uso de Inteligência Artificial.</Link></p>
      </article>
      <article className="institutional-card">
        <h2>Comunicações</h2>
        <p>Não utilizamos dados de clientes para disparos promocionais de terceiros. Mensagens operacionais, como recuperação de senha, segurança, cobrança, suporte e avisos relacionados ao serviço, podem ser enviadas quando necessárias.</p>
      </article>
      <article className="institutional-card">
        <h2>Controle e solicitações</h2>
        <p>Solicitações relacionadas a acesso, correção, atualização ou demais direitos sobre dados pessoais devem ser encaminhadas pelos canais oficiais indicados nas páginas de Contato e Suporte.</p>
      </article>
    </section>

    <p className="institutional-note">A forma exata de armazenamento, retenção e processamento pode variar conforme o aplicativo e os serviços técnicos utilizados. Informações adicionais podem ser apresentadas nos termos específicos do produto contratado.</p>
  </main><Footer/></>;
}
