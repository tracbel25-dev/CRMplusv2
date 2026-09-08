import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

export default function Contato(){
  return <><Header/><main className="institutional-shell">
    <section className="institutional-hero">
      <span className="eyebrow">Contato</span>
      <h1>Fale com a CRM PLUS.</h1>
      <p>Use os canais oficiais para dúvidas comerciais, suporte, privacidade e assuntos relacionados aos aplicativos.</p>
    </section>

    <section className="institutional-grid">
      <article className="institutional-card">
        <h2>Suporte</h2>
        <p>Para dúvidas de uso, configuração e atendimento relacionado a uma assinatura, utilize a área de suporte.</p>
        <div className="institutional-actions"><Link className="primary" href="/suporte">Acessar suporte</Link></div>
      </article>
      <article className="institutional-card">
        <h2>Comercial</h2>
        <p>Os canais comerciais oficiais serão exibidos aqui quando os contatos definitivos estiverem configurados no projeto.</p>
      </article>
      <article className="institutional-card">
        <h2>Privacidade</h2>
        <p>Solicitações relacionadas a dados pessoais e privacidade podem ser encaminhadas pelos canais oficiais de contato e suporte.</p>
        <div className="institutional-actions"><Link className="ghost" href="/privacidade">Ler Política de Privacidade</Link></div>
      </article>
      <article className="institutional-card">
        <h2>Sem contatos fictícios</h2>
        <p>Telefone, WhatsApp e e-mail só serão publicados quando os canais oficiais estiverem definidos. O projeto não exibe informações de contato inventadas apenas para preencher a página.</p>
      </article>
    </section>
  </main><Footer/></>;
}
