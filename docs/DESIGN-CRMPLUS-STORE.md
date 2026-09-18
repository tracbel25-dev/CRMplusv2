# Design — CRM PLUS Store

## Conceito visual

A Store deve parecer uma **loja digital premium**, não um ERP, dashboard corporativo ou landing SaaS genérica.

A base visual pública é escura, com preto profundo e contraste forte. Luz, profundidade, escala e espaço vazio devem ser usados com intenção.

Evitar:
- neon;
- brilho tecnológico genérico;
- glow excessivo;
- cinza sem contraste;
- texto apagado;
- excesso de sombras;
- blocos repetitivos de landing;
- visual de painel administrativo na área pública.

A inspiração em streaming e lojas digitais serve para comportamento e descoberta, não para copiar identidade visual.

## Hierarquia e ritmo

A página pública não deve manter a mesma intensidade em todas as seções.

- A capa é o ponto de maior impacto.
- O catálogo traz descoberta e movimento.
- As áreas seguintes reduzem a intensidade e explicam a proposta.
- A chamada final recupera presença sem virar um retângulo promocional desconectado.

Evitar o padrão repetitivo: título centralizado + parágrafo + três cards + botão em toda seção.

## Header público

O header deve ser fino, leve e compartilhado nas páginas corporativas.

Desktop:
- marca à esquerda;
- navegação central;
- ações de acesso à direita;
- Login com peso secundário;
- ação principal sem competir com o hero.

Regras:
- manter visível durante a rolagem sem cobrir conteúdo;
- reservar espaço para evitar salto de layout;
- usar contraste estável;
- não esconder a navegação conforme a direção da rolagem;
- foco e página atual devem ser identificáveis;
- não transformar o header em barra de ferramentas;
- não duplicar header dentro de hero ou slides;
- no mobile, usar menu explícito em vez de comprimir todos os links.

## Capa principal

A primeira dobra deve funcionar como uma grande vitrine.

O slogan corporativo é:
**“O controle do seu negócio na palma da mão. E no seu bolso.”**

Hierarquia:
1. slogan;
2. aplicativo;
3. finalidade;
4. poucas funções confirmadas;
5. ação principal.

A troca de aplicativos deve parecer troca de capa dentro da mesma loja.

Regras:
- manter altura estável durante transições;
- permitir setas e indicadores;
- respeitar movimento reduzido;
- pausar troca automática durante interação;
- não bloquear rolagem vertical;
- não exibir preço, tabela de plano ou formulário no hero;
- usar apenas imagens fornecidas ou aprovadas;
- não substituir material aprovado por foto genérica;
- não apresentar ilustração como captura real do sistema.

## Atmosfera por produto

Cada aplicativo é independente e precisa possuir personalidade própria.

A unidade entre produtos vem da qualidade da composição e da experiência da Store, não de aplicar a mesma tela com outra cor.

### Zeus
A apresentação pública deve comunicar precisão, organização, operação e controle. Pode usar grafite, detalhes metálicos e referências sutis a OS, ficha de atendimento, veículo/equipamento e sequência de trabalho. Evitar foto genérica de mecânico e visual financeiro.

### Artemis
A apresentação pública deve comunicar ritmo e agilidade operacional. Pode usar grafite com temperatura, cobre e tons quentes. A composição pode sugerir pedido, mesa, cozinha, preparo e caixa sem depender de fotografia genérica de pratos.

Nomes e slugs atuais devem vir de `lib/catalog.ts`; exemplos antigos de documentos visuais não renomeiam produtos.

## Catálogo e prateleiras

A Store deve favorecer exploração visual.

Preferir capas e trilhas horizontais quando a composição da página pedir isso. Evitar uma grade SaaS genérica com ícone, título, três linhas e botão repetida sem personalidade.

Cada item precisa deixar claro:
- nome;
- finalidade;
- identidade visual;
- ação para conhecer o produto.

Cards:
- estado normal limpo;
- hover discreto, sem informação essencial depender dele;
- leve escala/profundidade permitida;
- animações exageradas proibidas;
- proporções de capa consistentes;
- ação e identificação sempre legíveis.

Preço não pertence às capas ou páginas individuais; consultar `docs/public-ui-rules.md`.

## Conteúdo e confiança

Não criar:
- número fictício de clientes;
- vendas fictícias;
- usuários fictícios;
- crescimento fictício;
- avaliações inventadas;
- popularidade sem evidência;
- depoimentos falsos.

Pesquisas e evidências externas só devem aparecer quando forem reais e verificadas.

Depoimentos ficam ocultos enquanto não houver material aprovado.

## Chamada final

Pouco texto e uma mensagem forte.

A Store volta a ser protagonista e o visitante pode explorar aplicativos ou acessar sua conta.

Não usar um bloco colorido gigantesco sem relação com o restante da composição.

## Rodapé

O rodapé continua no universo visual da página e encerra a experiência com precisão.

Regras:
- organização limpa;
- hierarquia clara;
- espaçamento moderado;
- contraste forte;
- fonte legível;
- links reais;
- ano automático;
- não repetir slogan;
- não repetir cards;
- não repetir tabela de preços;
- não inventar dados institucionais;
- não adicionar ícones de redes sociais sem destino confirmado;
- não transformar o rodapé em uma nova seção de vendas.

No mobile, usar blocos verticais compactos e permitir quebra natural de rótulos.

## Mobile

Mobile não é uma miniatura comprimida do desktop.

Redesenhar:
- hierarquia;
- espaçamento;
- ordem de leitura;
- tamanho de capas;
- ações principais;
- navegação.

Textos permanecem confortáveis e as áreas de toque precisam ser adequadas.

As prateleiras podem usar navegação horizontal, mas a página inteira não deve gerar rolagem horizontal.
