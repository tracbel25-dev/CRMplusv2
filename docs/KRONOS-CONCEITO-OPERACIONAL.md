# Kronos — conceito operacional

## Norte do produto

Kronos é um CRM operacional de vendas. O funil existe para organizar os dados e permitir análise, mas não deve ser o trabalho principal do vendedor nem ocupar a interface como obrigação burocrática.

A regra de produto é:

> O Kronos deve trabalhar para o vendedor. O vendedor não deve trabalhar para alimentar o Kronos.

E a regra de informação é:

> Registrar pouco. Entender muito. Mostrar somente o que importa agora.

O objetivo é transformar massa de dados comerciais em tomada de decisão:

**dados → contexto → prioridade → ação → resultado → novos dados**

## Onde o Kronos agrega valor

Para quem vende, o sistema deve ajudar a responder rapidamente:

- Quem precisa ser procurado hoje?
- Qual retorno foi prometido?
- Qual oportunidade está esfriando?
- Qual negociação está avançando de verdade?
- Qual cliente da carteira está sendo esquecido?
- O que precisa acontecer agora para a venda continuar?

Para quem acompanha a operação, o sistema deve permitir entender:

- Onde a equipe precisa de intervenção?
- Quais valores estão parados ou sem próxima ação?
- Quais oportunidades possuem sinais reais de avanço?
- Onde existem padrões de ganho, perda, demora ou abandono?

Indicadores que não levam a uma decisão prática não devem ocupar a interface apenas para preencher um dashboard.

## Estrutura comercial adaptável

Kronos não parte de cargos rígidos. Existem perspectivas de trabalho que podem ser acumuladas pela mesma pessoa, dependendo da empresa:

- **Operacional / administrativo / auxiliar:** mantém cadastros, carteira e base comercial organizada.
- **Vendedor / consultor / executivo:** gera contexto comercial em visitas, ligações, reuniões, propostas e negociações.
- **Gestor / dono:** acompanha resultado, risco, comportamento da carteira e pontos onde precisa intervir.

Em uma empresa pequena, uma única pessoa pode exercer todas essas funções. Em uma estrutura maior, elas podem ser distribuídas entre pessoas ou equipes.

Essas perspectivas não são, por si só, níveis de acesso do sistema.

## Processo configurável

Cada empresa pode possuir uma sequência comercial diferente. O motor do Kronos é comum, mas a linguagem e as etapas abertas devem ser configuráveis.

Exemplos:

- ERP B2B: Identificado → Diagnóstico → Demonstração → Proposta → Negociação → Contrato.
- Academia: Interessado → Contato → Visita → Aula experimental → Matrícula.
- Consórcio: Lead → Contato → Simulação → Documentação → Fechamento.

Etapas desnecessárias podem ser removidas ou reorganizadas quando não houver registros ativos dependentes delas. O sistema deve se recompor, em vez de exibir etapas permanentemente desativadas.

## Lead, oportunidade e carteira

**Lead** é uma porta de entrada, não o centro do sistema. Pode nascer por prospecção, indicação, site, WhatsApp, evento, campanha ou cadastro manual.

**Oportunidade** representa uma possibilidade real de venda que passa a ser acompanhada comercialmente.

**Carteira** representa a memória do relacionamento com pessoas e empresas, incluindo oportunidades, contatos e compromissos registrados.

Não criar cadastros independentes e desconectados para cada palavra comercial quando o mesmo relacionamento pode amadurecer no fluxo.

## Venda ativa e venda reativa

A origem comercial deve diferenciar dois movimentos fundamentais:

- **Ativa:** a empresa ou vendedor foi atrás do potencial cliente.
- **Reativa:** o potencial cliente procurou a empresa e passou a ser acompanhado.

Além do movimento, registrar quando útil o canal/origem: indicação, prospecção, site, WhatsApp, evento, campanha e equivalentes.

Essa informação deve servir posteriormente para comparar comportamento e resultado das origens.

## Cronograma comercial

O cronograma não é apenas agenda.

Cada compromisso comercial pode reunir:

- cliente ou lead;
- oportunidade relacionada, quando existir;
- tipo: visita, ligação, reunião ou demonstração;
- data e horário;
- o que será oferecido;
- objetivo da conversa;
- situação e valor de cotação, quando houver;
- contexto e observações.

Depois do compromisso, registrar o resultado de maneira curta e, quando necessário, uma próxima ação com data.

Uma visita ou ligação não deve desaparecer depois que acontece. Ela deve alimentar o acompanhamento, a memória da oportunidade e a inteligência comercial.

## Acompanhamento

O Kronos deve impedir que negociações morram por esquecimento.

Toda oportunidade relevante deve chegar a um destes estados:

- possui uma próxima ação definida;
- foi concluída como venda;
- foi encerrada como perda, com motivo;
- possui um contexto explícito que explique por que está parada.

A ausência de próxima ação é um sinal de atenção, não apenas um campo vazio.

## Termômetro

O termômetro possui duas leituras diferentes.

### Percepção do vendedor

O vendedor pode classificar a oportunidade como fria, morna ou quente com base no conhecimento da conversa e do cliente.

### Sinais do Kronos

O sistema calcula uma leitura independente usando os dados disponíveis, inicialmente considerando:

- momento da negociação;
- cotação e sua situação;
- existência de próxima ação;
- retorno atrasado;
- tempo desde a última interação;
- percepção registrada pelo vendedor.

A interface deve permitir situações como:

**Percepção do vendedor: Quente**  
**Sinais do Kronos: Atenção**

O objetivo não é fingir uma previsão estatística sem base. A pontuação inicial é uma heurística operacional transparente, que poderá evoluir conforme o produto acumular dados e regras mais maduras.

## Home

A página inicial não deve começar pelo desenho do funil.

Ela deve priorizar:

- próximas ações;
- negociações que precisam de atenção;
- oportunidades com sinais de avanço;
- próximos compromissos comerciais;
- valor potencial contextualizado.

O usuário pode acessar as oportunidades e suas etapas, mas o funil funciona como estrutura de dados por baixo da experiência principal.

## Memória comercial

Cada contato, visita, mudança de etapa, próxima ação, venda ou perda deve deixar um rastro útil.

Com o tempo, essa massa de dados deve permitir que o Kronos deixe de responder apenas “o que aconteceu?” e passe a ajudar a responder “onde agir agora?” e, futuramente, “quais padrões desta operação costumam gerar resultado?”.

## Escopo técnico desta versão

Nesta fase o Kronos trabalha **somente com persistência local no navegador**, isolada por conta no runtime atual.

A versão reconstruída usa um namespace local `v2` próprio e não migra automaticamente os dados do rascunho anterior do Kronos. O armazenamento antigo permanece intacto como cópia separada.

Supabase e Cloudflare R2 estão deliberadamente fora deste escopo. Nenhuma integração com esses serviços deve ser declarada como ativa nesta versão.
