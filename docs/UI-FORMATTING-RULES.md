# Regras de design e formatação de interface

Estas regras valem para Store, páginas comerciais e aplicativos, respeitando a personalidade de cada produto.

## Texto

- Português brasileiro.
- Textos diretos e operacionais.
- Títulos claros.
- Rótulos objetivos.
- Evitar caixa alta em excesso.
- Evitar parágrafos longos quando a tela precisa orientar ação.
- Não usar linguagem técnica de infraestrutura em comunicação para cliente.
- Não inventar estados, números, integrações ou benefícios.

## Tipografia

A tipografia deve ser contemporânea e extremamente legível.

- Corpo sem personalidade exagerada.
- Identificadores importantes podem receber mais peso.
- Hierarquia deve vir de tamanho, peso, posição e espaçamento, não de muitas cores.
- Não reduzir fonte para "fazer caber".
- Texto secundário continua com contraste suficiente.

## Contraste e cor

- Contraste forte é obrigatório.
- Status não pode depender apenas de cor.
- Urgência não pode ser comunicada apenas em vermelho.
- Usar texto, ícone e contexto quando necessário.
- Evitar neon, degradês tecnológicos genéricos e glow sem função.
- Cor de destaque serve para ação, seleção, progresso e prioridade.

## Espaçamento e densidade

Área pública:
- espaço vazio pode fazer parte da composição;
- evitar distância excessiva que desconecte seções.

Aplicativos:
- não usar espaçamento de landing page em ferramenta operacional;
- aproveitar a tela para mostrar informação útil;
- não comprimir tudo como planilha;
- preferir blocos largos, listas, linhas operacionais e seções funcionais a dezenas de cards pequenos.

## Componentes

- Não transformar tudo em card.
- Ações devem aparecer no momento em que fazem sentido.
- Não encher linhas com ícones decorativos.
- Botões precisam ter hierarquia clara.
- Links mudam de página; botões executam ações ou abrem/fecham controles.
- Não usar link vazio, `#` provisório ou botão sem ação.
- Estados de foco, hover, ativo, erro, carregamento e desabilitado devem ser reconhecíveis.

## Sistema de botões

Botões de ação devem parecer parte do mesmo produto em todas as telas.

### Padrão interno dos aplicativos

O formato é compartilhado entre Zeus, Artemis e demais aplicativos. A identidade do aplicativo aparece principalmente por cor e contexto, não por inventar outra geometria de botão.

Padrão:
- altura normal: 42px;
- altura compacta: 36px, somente quando a densidade realmente exigir;
- raio: 10px;
- fonte normal: 13px / peso 600;
- fonte compacta: 12px / peso 600;
- ícone em botão: 16px;
- botão somente com ícone: 38 × 38px;
- espaçamento interno horizontal normal: 14px;
- espaçamento entre ícone e texto: 8px.

Variantes oficiais:
- `primary`: ação principal;
- `secondary`: ação alternativa;
- `danger`: ação destrutiva;
- `text`: ação terciária sem caixa;
- `compact`: apenas variação de tamanho, combinável com as variantes quando necessário.

Regras:
- não criar altura, raio, padding ou tamanho de fonte específico por tela;
- não usar um botão arredondado em uma tela e quadrado em outra sem função distinta;
- não aumentar botão apenas para "dar destaque"; destaque vem da variante e da posição;
- evitar duas ações primárias concorrentes no mesmo grupo;
- ações equivalentes devem manter a mesma variante entre telas;
- botão seletor/card pode ter outra composição quando representa uma opção ou registro, mas não deve ser confundido com botão de ação;
- mobile pode tornar o botão largo ou ocupar 100% da coluna, sem mudar sua linguagem visual;
- Store pública pode manter sua família editorial própria de botões, mas deve ser consistente entre todas as páginas públicas.

Os tokens oficiais dos aplicativos ficam em `operations.css`. Overrides locais de `.op-button` não devem redefinir geometria.

## Formulários

- Formulários curtos quando possível.
- Crescer progressivamente em vez de mostrar dezenas de campos de uma vez.
- Erro deve aparecer próximo ao campo relacionado.
- Preservar dados não sensíveis digitados quando houver falha.
- Durante envio, indicar processamento e impedir submissão duplicada.
- Evitar recarregar a tela inteira a cada alteração.
- Autocomplete e seleção devem ser explícitos quando houver múltiplas correspondências.
- Ajuda contextual não pode esconder informação essencial.

## Estados da interface

Toda área relevante deve tratar:
- carregamento;
- vazio;
- erro;
- sucesso;
- indisponibilidade;
- permissão insuficiente, quando aplicável.

Não mostrar sucesso antes de a operação estar confirmada.

## Responsividade

Desktop e mobile possuem prioridades diferentes.

No mobile:
- tabelas viram listas quando necessário;
- conteúdo secundário pode recolher;
- ações frequentes devem ficar acessíveis;
- não comprimir desktop até "caber";
- evitar rolagem horizontal da página;
- manter áreas de toque confortáveis.

## Acessibilidade

- Navegação por teclado.
- Foco visível.
- Rótulos acessíveis.
- Imagens com texto alternativo apropriado.
- Nenhuma função essencial depende só de hover.
- Estado atual não depende só de cor.
- Menus modais devem controlar e devolver foco corretamente.
- Suportar ampliação de texto sem quebrar ações essenciais.
- Respeitar preferência por movimento reduzido.

## Imagens e mídia

- Preservar proporção.
- Evitar mudança de layout durante carregamento.
- Usar lazy loading quando adequado.
- Vídeo inicia por ação do visitante.
- Não iniciar vídeo com som automaticamente.
- Mídia ausente não pode quebrar nome, descrição ou ações do produto.
- Imagem aprovada não deve ser trocada por material genérico sem decisão explícita.

## Navegação interna dos aplicativos

A área interna de cada app não carrega toda a navegação comercial da Store.

Menus internos devem priorizar o trabalho da operação.

Quando uma seção for extensa, usar abas/guias ou agrupamentos coerentes em vez de empilhar tudo verticalmente.

Funções desativadas não devem deixar grandes espaços vazios ou etapas permanentes sem uso; a interface deve se recompor.
