# Design Zeus — CRM PLUS Store

## Conceito

O Zeus deve parecer uma ferramenta feita para acompanhar o fluxo real de uma oficina.

Não é:
- ERP tradicional;
- dashboard corporativo cheio de indicadores;
- sistema financeiro;
- interface gamer;
- imitação visual de uma oficina mecânica.

A sensação é de uma **bancada de controle limpa**: o dono entende rapidamente o que acontece hoje, o que está em andamento, o que parou e o que precisa de atenção.

Ideias centrais:
**Controle. Sequência. Confiança.**

## Tema

O Zeus começa no tema claro.

### Claro
- branco ou quase branco;
- cinza muito leve para planos secundários;
- texto preto/grafite profundo;
- divisões sutis;
- sombras mínimas;
- leitura boa em ambiente iluminado;
- destaque sem grandes blocos coloridos.

### Escuro
- preto e grafite;
- sem azul neon;
- sem verde fluorescente;
- sem degradê tecnológico;
- sem glow excessivo;
- texto principal muito legível;
- contraste suficiente em campos, divisores e botões.

## Estrutura desktop

Três zonas:
1. navegação lateral;
2. área principal;
3. camada contextual ao abrir atendimento, OS, cliente ou ação.

A navegação lateral é estreita, firme e pode recolher. Não deve parecer menu de ERP antigo.

O conteúdo principal usa blocos largos, listas, linhas operacionais e fichas. Evitar dezenas de cards independentes.

## Cabeçalho interno

Faixa baixa e limpa.

- contexto atual à esquerda;
- busca global por placa/identificação, cliente e OS;
- ações pessoais e do sistema à direita;
- header não pode roubar espaço do trabalho.

## Home

A tela inicial abre com agenda e fluxo, não com gráfico.

Prioridade:
- hoje;
- agendamentos;
- próximos atendimentos;
- aguardando aprovação;
- atendimentos em andamento.

Indicadores devem abrir registros úteis. Evitar KPI decorativo.

Cada linha deve privilegiar:
1. identificação principal;
2. o que vai acontecer;
3. responsável;
4. status/prazo/próxima ação.

## Configurabilidade

O Zeus não obriga todas as oficinas a enxergar o mesmo sistema.

Rótulos podem variar:
- placa/modelo/quilometragem;
- série/equipamento/horímetro;
- outros termos configurados.

O componente deve suportar mudança de rótulo sem quebrar alinhamento ou hierarquia.

Funções desligadas deixam de fazer parte da experiência em vez de aparecer como espaço vazio ou etapa cinza permanente.

Configuração deve parecer que o dono está "montando sua oficina dentro do sistema", não preenchendo uma tela infinita de checkboxes.

## Abertura de atendimento

Começar limpa, com a identificação principal.

Busca mostra resultados existentes com informação suficiente para não confundir registros.

Selecionar um resultado preenche dados sem recarregar o formulário inteiro.

Se não existir, "Cadastrar novo" entra no mesmo fluxo.

O formulário cresce conforme necessário.

## OS

A OS é a ficha viva do serviço.

Manter número da OS e identificação visíveis durante a navegação.

Organizar em grandes áreas funcionais:
- identificação;
- relato;
- diagnóstico;
- serviços;
- peças;
- orçamento;
- execução;
- anexos;
- observações;
- linha do tempo.

Pode usar abas, âncoras ou seções fixas, sem perder contexto.

## Tipo, etapa e status

São conceitos visuais distintos.

- Tipo: natureza do trabalho.
- Etapa: posição no fluxo.
- Status: condição atual.

Não misturar tudo numa badge colorida.

## Diagnóstico

Dar espaço para texto, sintomas, causa, observações e anexos.

Fotos são evidência do atendimento, não galeria decorativa.

Adicionar foto deve ser simples no celular.

## Orçamento

Faz parte da OS.

Separar serviços e peças.

Total permanece visível sem transformar a tela em caixa registradora.

Após envio para aprovação, mostrar versão, horário e decisão.

"Aguardando aprovação" deve ser textual e evidente.

## Execução

Priorizar:
- o que fazer;
- responsável;
- concluído;
- pendente.

Atualização, observação e foto devem exigir poucos toques.

## Conferência e entrega

A etapa final deve transmitir fechamento.

Mostrar síntese, pendências e condição do atendimento.

Encerrar exige intenção clara e não pode acontecer por clique acidental.

## Histórico

Arquivo técnico pesquisável.

Evitar grade pesada de banco de dados.

Usar lista densa, organizada e legível.

Encerrado, cancelado e reprovado precisam ser diferenciados por texto/ícone, não só cor.

## Clientes e ativos

A tela funciona como CRM operacional.

Responder rapidamente:
- quem é o cliente;
- o que ele possui;
- o que já foi feito;
- o que está aberto.

Quantidade de OS é informação contextual, não KPI gigante.

## Agendamento

Duas leituras principais:
- dia;
- semana.

Cliente, veículo/equipamento, tipo e técnico aparecem de forma legível.

Desktop pode usar arrastar apenas quando seguro e claro. Mobile prioriza toque e seleção explícita.

## Alertas

Não criar central cheia de eventos irrelevantes.

Um alerta nasce de situação que exige ação e deve:
- explicar o ocorrido;
- mostrar contexto;
- permitir abrir o item.

Urgência nunca depende só de vermelho.

## Densidade

Zeus é ferramenta de trabalho.

No desktop, permitir acompanhar vários atendimentos sem rolagem excessiva, sem virar planilha apertada.

A densidade desejada é de uma mesa organizada: muita informação útil, cada coisa no lugar.

## Mobile

Mudar prioridades.

Mostrar primeiro:
- próximos atendimentos;
- pendências;
- atendimentos em andamento.

A OS vira sequência vertical.

Ações frequentes devem ficar acessíveis:
- etapa;
- status;
- observação;
- foto;
- cliente;
- orçamento.

Tabelas viram listas e informação secundária pode recolher.
