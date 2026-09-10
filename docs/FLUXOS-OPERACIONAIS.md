# Contrato de fluxos operacionais — CRM PLUS Store

Este documento define como os processos devem se encadear. Ele não transforma os aplicativos em um sistema único: cada aplicativo continua independente, com sua própria operação e dados. O objetivo corporativo é manter a mesma filosofia de uso: registrar o mínimo necessário no momento certo, reaproveitar o que já existe e nunca criar etapas burocráticas sem consequência operacional.

## Regra corporativa de cadastro progressivo

Fluxo padrão: **digitar → sugerir → reaproveitar ou criar → continuar a operação**.

- Um cliente não precisa ser cadastrado em uma tela separada antes de uma OS, pedido, visita, oportunidade ou proposta.
- Telefone e e-mail são identificadores mais fortes que nome e devem ter prioridade no reaproveitamento.
- Um nome exato só é reutilizado automaticamente quando corresponde a uma única ficha.
- Se houver homônimos, o sistema pede telefone ou e-mail para escolher a ficha correta; ele não deve juntar pessoas silenciosamente.
- Se não houver correspondência, a ficha nasce no próprio salvamento da operação.
- Dados complementares são enriquecidos depois e não devem bloquear a atividade principal sem necessidade real.
- A regra é corporativa como comportamento, não como banco único: cada aplicativo continua com sua própria carteira operacional.

## Kronos — venda e rotina comercial

Fluxo: **cliente/lead → oportunidade → próxima ação → contato/visita → novo próximo passo → proposta → negociação → ganha/perdida**.

Regras de amarração:

- Um lead já nasce ligado a uma oportunidade comercial; não existe lead órfão.
- Toda atividade vinculada a uma oportunidade precisa alimentar sua próxima ação.
- Uma visita, reunião, ligação ou demonstração programada no Cronograma é também uma próxima ação da oportunidade. Agenda e funil não são processos separados.
- Ao realizar ou cancelar o compromisso, a ação correspondente é concluída automaticamente e o Kronos recalcula o próximo passo.
- O resultado de um compromisso pode gerar um follow-up, que volta para o acompanhamento e para a prioridade da oportunidade.
- Cotação em elaboração/enviada/aprovada pode avançar automaticamente uma oportunidade que ainda esteja antes da etapa configurada de proposta; nunca deve movê-la para trás.
- O sinal de oportunidade considera ação ou compromisso futuro, atraso, tempo sem contato, etapa, cotação e percepção do vendedor.
- O mapa é uma leitura da mesma operação: visita programada, oportunidade esfriando, proposta em aberto e cliente sem oportunidade ativa. Ele não mantém um funil paralelo.
- Cliente sem endereço não é bloqueado. A localização é aprendida quando surgir naturalmente em uma visita.
- Ganho ou perda encerra a negociação; qualquer acompanhamento pós-fechamento deve ser uma escolha explícita do operador.

Ponto conceitual que deve permanecer claro em futuras telas: **Novo lead** é entrada ainda pouco qualificada; **Nova oportunidade** é um atalho para uma demanda comercial já identificada. A configuração de etapas continua sendo da empresa, portanto nenhuma tela deve assumir silenciosamente qual etapa significa “qualificado”.

## Zeus — oficina

Fluxo: **agendamento ou entrada direta → identificação → diagnóstico (se usado) → orçamento (se usado) → execução → conferência → entrega → histórico**.

Regras de amarração:

- Agendamento é uma porta de entrada, não um cadastro separado. Ao abrir a OS, os dados do agendamento são reaproveitados e o mesmo agendamento não pode gerar duas OS.
- Cliente e veículo/equipamento são resolvidos no próprio fluxo. Identificação já existente é reaproveitada; nova identificação cria cliente/ativo quando necessário.
- Diagnóstico ativo bloqueia avanço enquanto não houver diagnóstico registrado.
- Orçamento ativo bloqueia execução até aprovação válida da versão vigente.
- Aprovação libera a OS para execução; reprovação registra o encerramento/reprovação, e uma nova versão pode reabrir o orçamento quando aplicável.
- Ao entrar em execução, serviços aprovados do orçamento viram tarefas de execução.
- Mesmo quando orçamento estiver desativado, a execução precisa conter pelo menos uma tarefa real antes da conferência. Não existe “execução vazia”.
- Todas as tarefas de execução precisam estar concluídas antes da conferência.
- Conferência antecede entrega; entrega encerra a OS e envia o registro ao histórico.
- Relatório e linha do tempo são consequência da própria OS, não preenchimentos paralelos.

## Artemis — restaurante

Fluxo principal: **cardápio → pedido → aceite → preparo → pronto → entrega/retirada/mesa → conclusão operacional**.

Fluxo financeiro relacionado: **saldo do pedido/comanda → recebimentos → quitação → fechamento de caixa/comanda**.

Regras de amarração:

- O cardápio é a fonte operacional de produtos; pedido não duplica cadastro de produto.
- Ao aceitar pedido com estoque controlado, a quantidade é reservada.
- Ao iniciar preparo, o estoque é consumido uma única vez.
- Pedido não fica pronto enquanto houver item de cozinha pendente.
- Delivery não conclui antes da confirmação de entrega.
- Mesa não é liberada enquanto houver pedido ativo, saldo a receber ou devolução pendente.
- Um pedido avulso pode concluir operacionalmente antes da quitação, mas essa situação deve ser registrada explicitamente como **concluído operacionalmente com saldo pendente** e continuar visível no Caixa.
- Quando o saldo de um pedido já concluído chega a zero, a linha do tempo registra a quitação financeira.
- Cancelamento antes do preparo libera reserva. Depois do consumo, estoque não é devolvido automaticamente.
- Cancelamento de pedido já pago mantém devolução pendente até registro explícito.
- Cliente é opcional em balcão/mesa e obrigatório quando o canal precisa de identificação para operar, como delivery/retirada.

## Athena Orçamentos — proposta comercial

Fluxo: **cliente → rascunho → composição → envio → decisão ou vencimento → aprovação/reprovação ou nova versão**.

Regras de amarração:

- O cliente nasce/reaproveita no próprio orçamento.
- Rascunho permanece editável; versão enviada deixa de ser alterada diretamente.
- Decisão só pode ser registrada em uma versão enviada e válida.
- Vencimento bloqueia decisão e exige revisão/nova versão.
- Nova versão preserva integralmente a anterior e remove aprovação antiga da versão nova.
- Athena Orçamentos é um aplicativo de proposta/documento. Não deve inventar tarefas comerciais ou funil automaticamente; quando a empresa precisa dessa gestão, o papel é do Kronos.

## Athena Pesquisa — satisfação

Fluxo: **rascunho da pesquisa → ativação → coleta → respostas/resultados → providência quando contato foi autorizado → encerramento**.

Regras de amarração:

- Rascunho pode ser editado; pesquisa ativa preserva a estrutura usada nas respostas.
- Resultados derivam das respostas reais e dos filtros de período.
- Quando o respondente autoriza/deixa contato e a operação decide agir, a providência recebe responsável, situação e, quando necessário, prazo.
- Respondente não deve ser transformado automaticamente em cliente da carteira. Pesquisa e relacionamento comercial são conceitos diferentes.
- Encerrar coleta preserva respostas e resultados já registrados.

## Critério para novas funções

Antes de adicionar uma tela, campo ou status, responder quatro perguntas:

1. Qual evento cria este dado?
2. Qual etapa seguinte consome este dado?
3. O que acontece automaticamente quando o estado muda?
4. Onde o usuário encontra a pendência se ele sair desta tela agora?

Se uma função não tiver resposta para essas quatro perguntas, provavelmente está criando um processo solto e deve ser redesenhada antes de entrar no produto.
