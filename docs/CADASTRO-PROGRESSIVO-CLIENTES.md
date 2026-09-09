# Regra corporativa — cadastro progressivo de clientes

## Princípio

Nenhum aplicativo da CRM PLUS deve obrigar o usuário a interromper uma operação para cadastrar o cliente em outra tela antes de continuar.

O cadastro continua existindo como estrutura de dados, mas deixa de ser uma etapa burocrática da experiência.

A regra é:

**digitar → sugerir → reaproveitar ou criar → continuar a operação**

## Comportamento esperado

Quando um campo operacional precisa de um cliente:

1. O usuário começa a digitar nome ou empresa.
2. O aplicativo sugere registros já existentes.
3. Se o usuário escolher ou digitar exatamente um cliente existente, o registro é reaproveitado.
4. Telefone e e-mail podem ajudar a identificar registros existentes e reduzir duplicidade.
5. Se não houver correspondência, o cliente é criado automaticamente no momento em que a operação é salva.
6. A criação do cliente nunca deve obrigar o usuário a abandonar a OS, oportunidade, pedido, proposta ou compromisso que estava preenchendo.
7. Dados complementares podem ser enriquecidos posteriormente.

## Aplicação por produto

### Kronos

O cliente/lead pode nascer dentro de uma oportunidade ou do cronograma comercial. O mesmo campo sugere a carteira existente e cria um novo registro quando necessário.

### Zeus

Na abertura de OS ou agendamento, placa/série/equipamento e cliente são resolvidos no próprio fluxo. Se a identificação do ativo já existir, o Zeus reaproveita o ativo e seu cliente. Se não existir, cliente e ativo são criados automaticamente durante o salvamento.

### Artemis

Pedidos de balcão ou mesa continuam aceitando atendimento avulso sem cliente. Quando um nome é digitado, o Artemis reaproveita ou cria automaticamente. Delivery e retirada exigem identificação porque esses canais dependem dela para a própria operação.

### Athena Orçamentos

O usuário digita o cliente diretamente na proposta. Se existir, a ficha é reaproveitada; se não existir, cliente e orçamento nascem juntos.

### Athena Pesquisa

Não aplicar esta regra automaticamente. O conceito principal é respondente/contato da pesquisa, não cliente operacional.

## Regra de produto

A interface não deve perguntar primeiro se o registro é “novo” ou “existente”. Essa é uma decisão que o sistema consegue tomar a partir dos dados digitados.

O usuário informa o que sabe. O aplicativo resolve a estrutura necessária por baixo.

## Kronos — localização

Localização é progressiva e opcional. Informar endereço nunca bloqueia oportunidade, lead ou compromisso comercial.

Quando um endereço é informado no cronograma, o Kronos tenta localizar o ponto e guarda a localização junto ao cliente para reutilização futura.

O mapa comercial pode destacar, quando houver localização disponível:

- visitas programadas;
- oportunidades esfriando;
- propostas em aberto;
- clientes sem oportunidade ativa.

Os filtros do mapa são independentes do funil. O objetivo é oferecer leitura territorial da carteira e apoiar a decisão de onde agir.
