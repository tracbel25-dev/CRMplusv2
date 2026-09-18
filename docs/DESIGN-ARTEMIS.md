# Design Artemis — CRM PLUS Store

Este documento registra apenas regras visuais e de experiência já confirmadas para o Artemis. Regras operacionais completas permanecem nos documentos funcionais.

## Personalidade

O Artemis deve transmitir organização e agilidade no atendimento, com identidade visual própria.

Ele não deve ser apenas o Zeus com outra cor.

Na apresentação pública, a atmosfera pode ser mais quente e dinâmica, sugerindo ritmo de pedidos, mesa, cozinha, preparo e caixa.

## Qualidade visual

- textos diretos;
- tipografia legível;
- contraste forte;
- componentes consistentes;
- cuidado equivalente nos temas claro e escuro;
- estado operacional legível sem depender apenas de cor.

## Velocidade de operação

Priorizar velocidade nas ações repetidas:
- adicionar itens;
- localizar pedidos;
- atualizar preparo;
- receber pagamentos.

A interface deve reduzir etapas desnecessárias e manter ações frequentes próximas do contexto em que são usadas.

## Cozinha

A tela de cozinha é operacional.

Cartões devem permitir leitura rápida de:
- canal;
- mesa ou pedido;
- horário;
- tempo decorrido;
- itens;
- quantidades;
- adicionais;
- observações.

Restrições e observações importantes precisam de destaque textual, não apenas cor.

Avisos de novos pedidos podem ser visuais e sonoros quando configurados.

## Mesas, comandas e pedidos

A situação precisa ser legível e direta.

Evitar uma composição visual que obrigue o usuário a interpretar muitos elementos decorativos para entender:
- novo;
- aceito;
- em preparo;
- pronto;
- concluído;
- cancelado.

Situação operacional e pagamento são informações distintas.

## Cardápio e delivery

No celular, priorizar:
- cardápio;
- delivery;
- atendimento de mesas;
- consulta de pedidos.

Fotos, variações, adicionais e disponibilidade precisam ser compreensíveis sem excesso de elementos.

## Tablet e desktop

Aproveitar área disponível para:
- cozinha;
- mesas;
- caixa;
- acompanhamento simultâneo de pedidos.

Não transformar tudo em colunas estreitas ou cards pequenos sem necessidade.

## Estados

Implementar carregamento, vazio, erro e sucesso.

Preservar formulários quando houver falha.

Evitar recarregar a tela inteira a cada alteração.

Se houver perda de conexão, sinalizar claramente e não apresentar alteração não salva como confirmada.

## Responsividade

Mobile e desktop têm prioridades diferentes.

A versão mobile não deve ser simplesmente a tela desktop comprimida.

Controles frequentes precisam ter áreas de toque adequadas e leitura confortável.
