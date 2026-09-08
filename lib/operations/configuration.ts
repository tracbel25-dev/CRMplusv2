'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AppId } from './model';

export type ConfigField = {
  key: string;
  label: string;
  group: string;
  description: string;
  required?: boolean;
};

export type ConfigAction = {
  key: string;
  label: string;
  group: string;
  description: string;
  required?: boolean;
  modulePath?: string;
};

export type CustomField = {
  id: string;
  label: string;
  group: string;
  visible: boolean;
};

export type OperationPreferences = {
  version: 1;
  fieldLabels: Record<string, string>;
  fieldVisibility: Record<string, boolean>;
  actionVisibility: Record<string, boolean>;
  customFields: CustomField[];
};

type SegmentDefinition = {
  title: string;
  description: string;
  fields: ConfigField[];
  actions: ConfigAction[];
  customFieldGroups: string[];
};

export const segmentDefinitions: Record<AppId, SegmentDefinition> = {
  zeus: {
    title: 'Como sua oficina trabalha',
    description: 'Defina a linguagem da oficina, o que aparece na ficha e quais ações fazem parte do fluxo real.',
    customFieldGroups: ['Cliente', 'Veículo / equipamento', 'Atendimento', 'Diagnóstico', 'Entrega'],
    fields: [
      { key: 'customerName', label: 'Nome do cliente', group: 'Cliente', description: 'Pessoa ou empresa atendida.', required: true },
      { key: 'customerPhone', label: 'Telefone', group: 'Cliente', description: 'Contato principal do cliente.' },
      { key: 'identifier', label: 'Placa', group: 'Veículo / equipamento', description: 'Identificação principal usada na oficina.', required: true },
      { key: 'asset', label: 'Veículo', group: 'Veículo / equipamento', description: 'Nome usado para o item atendido.', required: true },
      { key: 'model', label: 'Modelo', group: 'Veículo / equipamento', description: 'Modelo ou descrição do ativo.', required: true },
      { key: 'year', label: 'Ano', group: 'Veículo / equipamento', description: 'Ano do veículo ou equipamento.' },
      { key: 'meter', label: 'Quilometragem', group: 'Veículo / equipamento', description: 'Quilometragem, horímetro ou outra medição.' },
      { key: 'serviceType', label: 'Tipo de atendimento', group: 'Atendimento', description: 'Diagnóstico, revisão, reparo, retorno ou tipo equivalente.', required: true },
      { key: 'technician', label: 'Responsável', group: 'Atendimento', description: 'Técnico ou responsável pelo serviço.' },
      { key: 'due', label: 'Prazo previsto', group: 'Atendimento', description: 'Data ou horário prometido.' },
      { key: 'complaint', label: 'Relato do cliente', group: 'Atendimento', description: 'Sintoma ou solicitação informada pelo cliente.', required: true },
      { key: 'diagnosis', label: 'Diagnóstico', group: 'Diagnóstico', description: 'Análise técnica, causa e recomendação.' },
      { key: 'internalNotes', label: 'Observações internas', group: 'Atendimento', description: 'Informação que não faz parte do relatório ao cliente.' },
      { key: 'partBrand', label: 'Marca da peça', group: 'Diagnóstico', description: 'Marca ou fabricante de peças do orçamento.' },
      { key: 'finalNotes', label: 'Observação final', group: 'Entrega', description: 'Registro final de conferência e entrega.' }
    ],
    actions: [
      { key: 'module:agendamentos', label: 'Agendamentos', group: 'Módulos', description: 'Agenda diária e semanal.', modulePath: 'agendamentos' },
      { key: 'module:clientes', label: 'Clientes e veículos', group: 'Módulos', description: 'Cadastro e histórico de clientes e ativos.', required: true, modulePath: 'clientes' },
      { key: 'diagnosis', label: 'Diagnóstico', group: 'Fluxo da OS', description: 'Inclui a etapa técnica de diagnóstico.' },
      { key: 'budget', label: 'Orçamento e aprovação', group: 'Fluxo da OS', description: 'Inclui orçamento antes da execução.' },
      { key: 'quickAdvance', label: 'Avançar fluxo pelo cabeçalho', group: 'Ações da OS', description: 'Mostra a próxima ação junto da etapa atual.', required: true },
      { key: 'manualStatus', label: 'Pausar / aguardando peça', group: 'Ações da OS', description: 'Permite mudar a situação sem alterar a etapa.' },
      { key: 'attachments', label: 'Anexar fotos', group: 'Ações da OS', description: 'Evidências fotográficas do atendimento.' },
      { key: 'report', label: 'Gerar relatório', group: 'Ações da OS', description: 'Relatório final do atendimento.' },
      { key: 'cancel', label: 'Cancelar OS', group: 'Ações da OS', description: 'Encerra a OS como cancelada.' }
    ]
  },
  artemis: {
    title: 'Como seu restaurante opera',
    description: 'Escolha os canais, os módulos e os dados que sua equipe realmente usa no salão, cozinha, delivery e caixa.',
    customFieldGroups: ['Cliente', 'Pedido', 'Produto', 'Mesa / comanda', 'Delivery', 'Caixa'],
    fields: [
      { key: 'customerName', label: 'Nome do cliente', group: 'Cliente', description: 'Identificação do consumidor em pedidos que exigem contato.' },
      { key: 'customerPhone', label: 'Telefone', group: 'Cliente', description: 'Contato para delivery e retirada.' },
      { key: 'deliveryAddress', label: 'Endereço', group: 'Delivery', description: 'Endereço de entrega.' },
      { key: 'orderChannel', label: 'Canal', group: 'Pedido', description: 'Mesa, balcão, delivery ou retirada.', required: true },
      { key: 'orderNotes', label: 'Observações do pedido', group: 'Pedido', description: 'Restrições e pedidos especiais.' },
      { key: 'productName', label: 'Nome do produto', group: 'Produto', description: 'Nome exibido no cardápio.', required: true },
      { key: 'productDescription', label: 'Descrição', group: 'Produto', description: 'Descrição comercial do item.' },
      { key: 'category', label: 'Categoria', group: 'Produto', description: 'Categoria do cardápio.', required: true },
      { key: 'price', label: 'Preço', group: 'Produto', description: 'Preço de venda.', required: true },
      { key: 'prepTime', label: 'Tempo de preparo', group: 'Produto', description: 'Estimativa operacional da cozinha.' },
      { key: 'ingredients', label: 'Ingredientes e alergênicos', group: 'Produto', description: 'Informações preenchidas pelo restaurante.' },
      { key: 'tableName', label: 'Mesa', group: 'Mesa / comanda', description: 'Nome ou número da mesa.' },
      { key: 'tableSeats', label: 'Lugares', group: 'Mesa / comanda', description: 'Capacidade da mesa.' },
      { key: 'cashOperator', label: 'Operador do caixa', group: 'Caixa', description: 'Pessoa responsável pelo turno.' }
    ],
    actions: [
      { key: 'module:pedidos', label: 'Pedidos', group: 'Módulos', description: 'Central operacional de pedidos.', required: true, modulePath: 'pedidos' },
      { key: 'module:mesas', label: 'Mesas e comandas', group: 'Módulos', description: 'Atendimento presencial por mesas.', modulePath: 'mesas' },
      { key: 'module:cozinha', label: 'Cozinha', group: 'Módulos', description: 'Fila de preparo e conclusão por item.', modulePath: 'cozinha' },
      { key: 'module:cardapio', label: 'Cardápio', group: 'Módulos', description: 'Catálogo único de produtos.', required: true, modulePath: 'cardapio' },
      { key: 'module:caixa', label: 'Caixa', group: 'Módulos', description: 'Abertura, recebimentos e fechamento.', modulePath: 'caixa' },
      { key: 'module:estoque', label: 'Estoque', group: 'Módulos', description: 'Saldo, reservas, consumo e ajustes.', modulePath: 'estoque' },
      { key: 'module:clientes', label: 'Clientes', group: 'Módulos', description: 'Histórico de consumidores.', modulePath: 'clientes' },
      { key: 'module:relatorios', label: 'Relatórios', group: 'Módulos', description: 'Vendas, recebimentos e operação.', modulePath: 'relatorios' },
      { key: 'delivery', label: 'Delivery', group: 'Canais de venda', description: 'Permite pedidos para entrega.' },
      { key: 'pickup', label: 'Retirada', group: 'Canais de venda', description: 'Permite pedidos para retirada.' },
      { key: 'dineIn', label: 'Mesa / salão', group: 'Canais de venda', description: 'Permite pedidos vinculados a comandas.' },
      { key: 'counter', label: 'Balcão', group: 'Canais de venda', description: 'Permite atendimento avulso no balcão.' },
      { key: 'quickAdvance', label: 'Avançar pedido pelo cabeçalho', group: 'Ações do pedido', description: 'Aceitar, iniciar preparo, marcar pronto e concluir junto do status.', required: true },
      { key: 'cancel', label: 'Cancelar pedido', group: 'Ações do pedido', description: 'Cancela e registra motivo.' },
      { key: 'transferTable', label: 'Transferir mesa', group: 'Ações do pedido', description: 'Move consumo entre comandas abertas.' },
      { key: 'payments', label: 'Registrar recebimento', group: 'Ações do pedido', description: 'Confirma recebimentos manualmente.' },
      { key: 'refunds', label: 'Registrar devolução', group: 'Ações do pedido', description: 'Registra devolução rastreável.' }
    ]
  },
  kronos: {
    title: 'Como sua equipe vende',
    description: 'Configure o pipeline, os dados visíveis e as ações comerciais que fazem sentido para sua rotina.',
    customFieldGroups: ['Cliente', 'Oportunidade', 'Qualificação', 'Próxima ação', 'Fechamento'],
    fields: [
      { key: 'dealTitle', label: 'O que será negociado?', group: 'Oportunidade', description: 'Nome da oportunidade.', required: true },
      { key: 'customer', label: 'Cliente', group: 'Cliente', description: 'Cliente vinculado à oportunidade.', required: true },
      { key: 'value', label: 'Valor previsto', group: 'Oportunidade', description: 'Valor estimado da negociação.' },
      { key: 'source', label: 'Origem do contato', group: 'Qualificação', description: 'Canal ou origem do lead.' },
      { key: 'due', label: 'Próximo contato', group: 'Próxima ação', description: 'Data prevista para o próximo retorno.' },
      { key: 'nextAction', label: 'Objetivo do próximo contato', group: 'Próxima ação', description: 'Próxima ação clara da negociação.' },
      { key: 'notes', label: 'Contexto da negociação', group: 'Qualificação', description: 'Informações de contexto.' },
      { key: 'lostReason', label: 'Motivo da perda', group: 'Fechamento', description: 'Motivo registrado quando a negociação é perdida.' }
    ],
    actions: [
      { key: 'module:oportunidades', label: 'Oportunidades', group: 'Módulos', description: 'Pipeline de vendas.', required: true, modulePath: 'oportunidades' },
      { key: 'module:atividades', label: 'Atividades', group: 'Módulos', description: 'Retornos e tarefas comerciais.', modulePath: 'atividades' },
      { key: 'module:clientes', label: 'Clientes', group: 'Módulos', description: 'Base de relacionamento.', modulePath: 'clientes' },
      { key: 'module:historico', label: 'Histórico', group: 'Módulos', description: 'Negociações ganhas e perdidas.', modulePath: 'historico' },
      { key: 'quickAdvance', label: 'Avançar etapa pelo cabeçalho', group: 'Ações da oportunidade', description: 'Move a oportunidade para a próxima etapa junto do status.', required: true },
      { key: 'activities', label: 'Agendar retorno', group: 'Ações da oportunidade', description: 'Cria a próxima atividade.' },
      { key: 'edit', label: 'Editar oportunidade', group: 'Ações da oportunidade', description: 'Permite alterar dados da oportunidade.' },
      { key: 'win', label: 'Registrar venda', group: 'Ações da oportunidade', description: 'Encerra como ganha.' },
      { key: 'lose', label: 'Registrar perda', group: 'Ações da oportunidade', description: 'Encerra como perdida e exige motivo.' },
      { key: 'export', label: 'Exportar dados', group: 'Ações da oportunidade', description: 'Permite exportação CSV.' }
    ]
  },
  'athena-pesquisa': {
    title: 'Como você coleta feedback',
    description: 'Defina quais informações entram na pesquisa e quais ações ficam disponíveis para quem opera a coleta.',
    customFieldGroups: ['Pesquisa', 'Respondente', 'Perguntas', 'Coleta', 'Resultado'],
    fields: [
      { key: 'surveyTitle', label: 'Nome da pesquisa', group: 'Pesquisa', description: 'Nome interno e de apresentação.', required: true },
      { key: 'surveyDescription', label: 'Mensagem para quem vai responder', group: 'Pesquisa', description: 'Contexto apresentado antes das perguntas.' },
      { key: 'contact', label: 'Contato autorizado', group: 'Respondente', description: 'Contato fornecido quando o respondente autoriza.' },
      { key: 'questionTitle', label: 'Pergunta', group: 'Perguntas', description: 'Texto da pergunta.', required: true },
      { key: 'questionType', label: 'Tipo de resposta', group: 'Perguntas', description: 'NPS, escala, texto ou escolha.', required: true },
      { key: 'requiredQuestion', label: 'Resposta obrigatória', group: 'Perguntas', description: 'Define se a pergunta pode ficar sem resposta.' }
    ],
    actions: [
      { key: 'module:pesquisas', label: 'Pesquisas', group: 'Módulos', description: 'Biblioteca de pesquisas.', required: true, modulePath: 'pesquisas' },
      { key: 'module:respostas', label: 'Respostas', group: 'Módulos', description: 'Respostas individuais.', modulePath: 'respostas' },
      { key: 'module:resultados', label: 'Resultados', group: 'Módulos', description: 'Leitura consolidada das respostas.', modulePath: 'resultados' },
      { key: 'quickAdvance', label: 'Controlar coleta pelo cabeçalho', group: 'Ações da pesquisa', description: 'Ativar ou encerrar a coleta junto do status.', required: true },
      { key: 'apply', label: 'Aplicar pesquisa', group: 'Ações da pesquisa', description: 'Abre a pesquisa para resposta neste dispositivo.' },
      { key: 'edit', label: 'Editar perguntas', group: 'Ações da pesquisa', description: 'Edita pesquisas ainda em rascunho.' },
      { key: 'export', label: 'Exportar respostas', group: 'Ações da pesquisa', description: 'Permite exportação CSV.' }
    ]
  },
  'athena-orcamentos': {
    title: 'Como você monta propostas',
    description: 'Defina os campos do orçamento, o que a equipe pode fazer e quais partes da proposta são necessárias.',
    customFieldGroups: ['Cliente', 'Proposta', 'Itens', 'Condições', 'Aprovação'],
    fields: [
      { key: 'customer', label: 'Cliente', group: 'Cliente', description: 'Cliente que receberá a proposta.', required: true },
      { key: 'quoteTitle', label: 'Título da proposta', group: 'Proposta', description: 'Identificação comercial do orçamento.', required: true },
      { key: 'validUntil', label: 'Validade', group: 'Condições', description: 'Prazo para aceitação da proposta.', required: true },
      { key: 'itemDescription', label: 'Descrição do item', group: 'Itens', description: 'Produto ou serviço orçado.', required: true },
      { key: 'quantity', label: 'Quantidade', group: 'Itens', description: 'Quantidade do item.', required: true },
      { key: 'unitPrice', label: 'Valor unitário', group: 'Itens', description: 'Preço por unidade.', required: true },
      { key: 'discount', label: 'Desconto', group: 'Condições', description: 'Desconto aplicado à proposta.' },
      { key: 'customerNotes', label: 'Observações para o cliente', group: 'Condições', description: 'Mensagem exibida no documento.' },
      { key: 'decisionNote', label: 'Registro da decisão', group: 'Aprovação', description: 'Como a aprovação ou reprovação foi recebida.' }
    ],
    actions: [
      { key: 'module:orcamentos', label: 'Orçamentos', group: 'Módulos', description: 'Biblioteca de propostas.', required: true, modulePath: 'orcamentos' },
      { key: 'module:clientes', label: 'Clientes', group: 'Módulos', description: 'Base de clientes vinculada às propostas.', modulePath: 'clientes' },
      { key: 'quickAdvance', label: 'Controlar proposta pelo cabeçalho', group: 'Ações da proposta', description: 'Enviar, acompanhar decisão e revisar junto do status.', required: true },
      { key: 'edit', label: 'Editar orçamento', group: 'Ações da proposta', description: 'Edita propostas em rascunho.' },
      { key: 'decision', label: 'Registrar decisão', group: 'Ações da proposta', description: 'Registra aprovação ou reprovação.' },
      { key: 'revision', label: 'Criar nova versão', group: 'Ações da proposta', description: 'Preserva a versão anterior e abre revisão.' },
      { key: 'document', label: 'Ver / imprimir documento', group: 'Ações da proposta', description: 'Abre a versão de apresentação ao cliente.' }
    ]
  }
};

export const configStorageKey = (app: AppId) => `crmplus:${app}:configuration:v1`;

export function defaultOperationPreferences(app: AppId): OperationPreferences {
  const definition = segmentDefinitions[app];
  return {
    version: 1,
    fieldLabels: Object.fromEntries(definition.fields.map(field => [field.key, field.label])),
    fieldVisibility: Object.fromEntries(definition.fields.map(field => [field.key, true])),
    actionVisibility: Object.fromEntries(definition.actions.map(action => [action.key, true])),
    customFields: []
  };
}

export function readOperationPreferences(app: AppId): OperationPreferences {
  const fallback = defaultOperationPreferences(app);
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(configStorageKey(app));
    if (!raw) return fallback;
    const value = JSON.parse(raw) as Partial<OperationPreferences>;
    return {
      ...fallback,
      ...value,
      version: 1,
      fieldLabels: { ...fallback.fieldLabels, ...(value.fieldLabels || {}) },
      fieldVisibility: { ...fallback.fieldVisibility, ...(value.fieldVisibility || {}) },
      actionVisibility: { ...fallback.actionVisibility, ...(value.actionVisibility || {}) },
      customFields: Array.isArray(value.customFields) ? value.customFields : []
    };
  } catch {
    return fallback;
  }
}

export function saveOperationPreferences(app: AppId, preferences: OperationPreferences) {
  localStorage.setItem(configStorageKey(app), JSON.stringify(preferences));
  window.dispatchEvent(new CustomEvent('crmplus:configuration', { detail: { app } }));
}

export function useOperationPreferences(app: AppId) {
  const [preferences, setPreferences] = useState<OperationPreferences>(() => defaultOperationPreferences(app));
  useEffect(() => {
    const sync = () => setPreferences(readOperationPreferences(app));
    sync();
    const storage = (event: StorageEvent) => {
      if (event.key === configStorageKey(app)) sync();
    };
    const custom = (event: Event) => {
      const detail = (event as CustomEvent<{ app?: AppId }>).detail;
      if (!detail?.app || detail.app === app) sync();
    };
    window.addEventListener('storage', storage);
    window.addEventListener('crmplus:configuration', custom);
    return () => {
      window.removeEventListener('storage', storage);
      window.removeEventListener('crmplus:configuration', custom);
    };
  }, [app]);

  return useMemo(() => ({
    preferences,
    label: (key: string, fallback: string) => preferences.fieldLabels[key]?.trim() || fallback,
    fieldVisible: (key: string) => preferences.fieldVisibility[key] !== false,
    actionVisible: (key: string) => preferences.actionVisibility[key] !== false
  }), [preferences]);
}
