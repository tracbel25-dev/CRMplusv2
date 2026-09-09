import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

export const metadata = {
  title: 'Privacidade, Proteção de Dados e Inteligência Artificial | CRM PLUS Store',
  description: 'Termo de privacidade, proteção de dados e uso de inteligência artificial do CRM PLUS Store.',
};

export default function PrivacidadeIA(){
  return <><Header/><main className="institutional-shell">
    <section className="institutional-hero">
      <span className="eyebrow">Privacidade e Inteligência Artificial</span>
      <h1>Termo de Privacidade, Proteção de Dados e Uso de Inteligência Artificial</h1>
      <p>Este Termo estabelece as regras aplicáveis ao tratamento de informações nos recursos de inteligência artificial disponibilizados pelo CRM PLUS Store e por seus aplicativos.</p>
      <p><strong>Última atualização:</strong> 09 de setembro de 2026.</p>
    </section>

    <section className="institutional-grid">
      <article className="institutional-card">
        <h2>1. Objeto e abrangência</h2>
        <p>Este Termo integra a Política de Privacidade e os Termos de Uso do CRM PLUS Store. Aplica-se aos recursos de inteligência artificial utilizados para auxiliar preenchimentos, organizar informações, sugerir textos, apoiar análises operacionais, recuperar padrões relevantes e aperfeiçoar respostas dentro dos aplicativos.</p>
        <p>O tratamento de dados pessoais observará a legislação aplicável, especialmente a Lei nº 13.709/2018 — Lei Geral de Proteção de Dados Pessoais (LGPD) — e os princípios de finalidade, adequação, necessidade, transparência, segurança, prevenção, não discriminação e responsabilização.</p>
      </article>

      <article className="institutional-card">
        <h2>2. Arquitetura própria de inteligência artificial</h2>
        <p>Os recursos de inteligência artificial são disponibilizados por meio de uma <strong>API própria do CRM PLUS</strong>, executada em uma <strong>camada de servidor própria da aplicação</strong>. Essa camada intermedeia as solicitações, valida a identidade e as permissões do usuário, seleciona o contexto necessário, aplica regras de isolamento, reduz dados desnecessários, executa filtros de proteção e controla o registro de memória autorizada.</p>
        <p>Credenciais técnicas, chaves privadas e segredos de infraestrutura não são expostos ao navegador do usuário. O aplicativo cliente se comunica com a API da própria plataforma, e não recebe acesso direto às credenciais internas utilizadas no processamento da inteligência artificial.</p>
      </article>

      <article className="institutional-card">
        <h2>3. Finalidade do uso de inteligência artificial</h2>
        <p>A inteligência artificial é utilizada como ferramenta de apoio. Entre as finalidades possíveis estão: sugerir preenchimentos, organizar relatos e observações, melhorar clareza textual, identificar padrões recorrentes, recuperar aprendizados anteriores da própria conta, apoiar diagnósticos e operações, reduzir retrabalho e tornar o uso dos aplicativos mais assertivo.</p>
        <p>As sugestões não substituem a responsabilidade profissional do usuário. Sempre que o conteúdo possa afetar diagnóstico técnico, atendimento, estoque, operação financeira, relação com cliente ou outra decisão relevante, o usuário deverá revisar e confirmar as informações antes de salvá-las ou utilizá-las.</p>
      </article>

      <article className="institutional-card">
        <h2>4. Dados utilizados no contexto da IA</h2>
        <p>A API recebe somente o contexto considerado necessário para executar a função solicitada. Dependendo do aplicativo, esse contexto pode incluir textos operacionais, categorias, descrições, histórico de tarefas, registros de atendimento, padrões de uso, correções realizadas pelo usuário e outros elementos diretamente relacionados à funcionalidade acionada.</p>
        <p>O CRM PLUS adota mecanismos de minimização e sanitização para reduzir a exposição de dados pessoais e comerciais. Informações que não sejam necessárias para a função de IA devem ser omitidas do contexto enviado ao mecanismo de processamento.</p>
      </article>

      <article className="institutional-card">
        <h2>5. Aprendizado com a massa operacional</h2>
        <p>Os aplicativos podem utilizar a massa de dados da <strong>própria conta</strong> para tornar sugestões mais relevantes. Esse processo não consiste em liberar o banco integral para a inteligência artificial. O sistema transforma registros operacionais em amostras ou padrões reduzidos, selecionados e sanitizados antes de utilizá-los como contexto.</p>
        <p>À medida que a operação acumula histórico, a IA pode reconhecer recorrências, terminologias, formas de preenchimento e relações operacionais que ajudam a produzir respostas mais adequadas. Frequência histórica é tratada como referência e não como prova de que um novo caso seja idêntico aos anteriores.</p>
      </article>

      <article className="institutional-card">
        <h2>6. Aprendizado por correção humana</h2>
        <p>Quando uma sugestão de IA é corrigida pelo usuário e o conteúdo final é salvo, a correção poderá ser analisada para gerar um aprendizado reutilizável dentro da própria empresa. O objetivo é permitir que o sistema deixe de repetir erros e se adapte progressivamente à forma real de trabalho da operação.</p>
        <p>Uma correção isolada não deve ser automaticamente convertida em verdade universal. O mecanismo de memória é projetado para registrar orientações condicionais, reforçar aprendizados semelhantes quando houver novas confirmações e manter indicação de confiança e origem do aprendizado.</p>
      </article>

      <article className="institutional-card">
        <h2>7. Isolamento por empresa e por aplicativo</h2>
        <p>O aprendizado operacional é isolado por conta e por aplicativo. Informações aprendidas no contexto de uma empresa não devem ser disponibilizadas como memória privada de outra empresa. Da mesma forma, o contexto de um aplicativo não deve ser utilizado como memória operacional de outro aplicativo sem regra específica, finalidade compatível e autorização adequada.</p>
        <p>Correções individuais de clientes não são promovidas automaticamente para conhecimento compartilhado entre empresas.</p>
      </article>

      <article className="institutional-card">
        <h2>8. Dados pessoais e dados pessoais sensíveis</h2>
        <p>O CRM PLUS não exige, como regra geral, a inserção de dados pessoais sensíveis em campos destinados à inteligência artificial. Usuários não devem inserir dados relativos a saúde, origem racial ou étnica, convicção religiosa, opinião política, filiação sindical, dados genéticos, biométricos ou outros dados sensíveis quando tais informações não forem estritamente necessárias e legitimamente tratadas na operação.</p>
        <p>Quando dados pessoais ou sensíveis forem tecnicamente identificáveis, o sistema é projetado para impedir que sejam convertidos em memória reutilizável de IA sem finalidade legítima e proteção compatível. O tratamento deverá permanecer limitado ao necessário para a funcionalidade, à segurança, ao cumprimento de obrigações legais ou às demais hipóteses permitidas pela legislação.</p>
      </article>

      <article className="institutional-card">
        <h2>9. Dados comerciais de terceiros e concorrentes</h2>
        <p>Preços, propostas, margens, descontos, cotações, condições comerciais e demais informações de concorrentes ou terceiros não são destinados ao aprendizado reutilizável da inteligência artificial do CRM PLUS.</p>
        <p>Quando esse tipo de informação for detectado em um contexto operacional, o sistema é projetado para excluí-lo da memória reutilizável ou restringi-lo ao contexto estritamente necessário da solicitação atual, sem promoção para aprendizado compartilhado ou referência futura entre clientes.</p>
      </article>

      <article className="institutional-card">
        <h2>10. Segurança, controle de acesso e confidencialidade</h2>
        <p>O acesso aos recursos de IA pode depender de autenticação, autorização por aplicativo e vínculo válido com a conta. A camada de servidor verifica permissões antes de processar funções protegidas e aplica separação lógica entre contas, aplicativos e memórias operacionais.</p>
        <p>São adotadas medidas técnicas e administrativas compatíveis com a natureza do serviço para reduzir riscos de acesso não autorizado, uso indevido, alteração, perda, divulgação ou processamento incompatível com a finalidade informada.</p>
      </article>

      <article className="institutional-card">
        <h2>11. Decisões automatizadas e revisão humana</h2>
        <p>Os recursos atuais de IA possuem caráter assistivo. A plataforma não pretende substituir a avaliação humana em decisões que produzam efeitos jurídicos ou afetem significativamente interesses de pessoas exclusivamente com base em processamento automatizado.</p>
        <p>Quando aplicável, o titular poderá solicitar informações sobre critérios e procedimentos utilizados em decisões automatizadas e exercer os direitos previstos na legislação, observados os limites de proteção de segredo comercial e industrial.</p>
      </article>

      <article className="institutional-card">
        <h2>12. Retenção e eliminação</h2>
        <p>Registros de interação, feedback e memória de IA poderão ser mantidos pelo período necessário às finalidades operacionais, de segurança, auditoria, prevenção de abuso, melhoria da experiência e cumprimento de obrigações legais ou contratuais. Informações que deixem de ser necessárias deverão ser eliminadas, anonimizadas ou bloqueadas quando cabível.</p>
        <p>O prazo exato pode variar conforme a natureza do dado, o aplicativo utilizado, a finalidade do tratamento e as obrigações legais incidentes.</p>
      </article>

      <article className="institutional-card">
        <h2>13. Direitos dos titulares</h2>
        <p>Nos termos da LGPD, o titular poderá, quando aplicável, solicitar confirmação da existência de tratamento, acesso, correção, anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade, portabilidade, informação sobre compartilhamentos, revogação de consentimento, oposição ao tratamento e revisão de decisões automatizadas.</p>
        <p>As solicitações deverão ser encaminhadas pelos canais oficiais de <Link href="/contato">Contato</Link> ou <Link href="/suporte">Suporte</Link>. Poderão ser solicitadas informações adicionais para confirmar a identidade do requerente e evitar acesso indevido a dados de terceiros.</p>
      </article>

      <article className="institutional-card">
        <h2>14. Responsabilidade do usuário</h2>
        <p>O usuário é responsável pela legitimidade das informações que insere nos aplicativos e deve evitar incluir dados pessoais, sensíveis, confidenciais ou de terceiros além do necessário para a finalidade da operação. Também é responsável por revisar sugestões de IA antes de utilizá-las como informação técnica, comercial ou operacional.</p>
      </article>

      <article className="institutional-card">
        <h2>15. Alterações deste Termo</h2>
        <p>Este Termo poderá ser atualizado para refletir mudanças nos recursos de inteligência artificial, na arquitetura de segurança, na legislação ou nas práticas de tratamento de dados. Alterações relevantes poderão ser comunicadas pelos canais disponíveis no produto.</p>
      </article>
    </section>

    <p className="institutional-note">Este documento descreve os controles e princípios adotados pelo produto e deve ser interpretado em conjunto com a Política de Privacidade, os Termos de Uso e os contratos aplicáveis. Para validação jurídica específica da operação de cada cliente, recomenda-se avaliação profissional adequada ao seu contexto.</p>
  </main><Footer/></>;
}
