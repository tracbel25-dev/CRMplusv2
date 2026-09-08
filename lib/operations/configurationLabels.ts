import type { AppId } from './model';

const common = (fallback: string, extra: string[] = []) => Array.from(new Set([fallback, ...extra]));

const labels: Record<AppId, Record<string, string[]>> = {
  zeus: {
    customerName: ['Cliente', 'Nome do cliente', 'Proprietário', 'Empresa'],
    customerPhone: ['Telefone', 'Celular', 'Contato', 'WhatsApp'],
    identifier: ['Placa', 'Número de série', 'Série', 'Frota', 'Chassi', 'Patrimônio', 'Código do equipamento'],
    asset: ['Veículo', 'Equipamento', 'Máquina', 'Moto', 'Ativo', 'Implemento'],
    model: ['Modelo', 'Descrição', 'Modelo do equipamento', 'Modelo do veículo'],
    year: ['Ano', 'Ano/modelo', 'Ano de fabricação'],
    meter: ['Quilometragem', 'KM', 'Horímetro', 'Horas', 'Odômetro', 'Ciclos'],
    serviceType: ['Tipo de atendimento', 'Tipo de serviço', 'Natureza do serviço', 'Serviço'],
    technician: ['Responsável', 'Técnico', 'Mecânico', 'Executante'],
    due: ['Prazo previsto', 'Previsão de entrega', 'Prazo', 'Data prevista'],
    complaint: ['Relato do cliente', 'Queixa do cliente', 'Solicitação', 'Sintoma informado'],
    diagnosis: ['Diagnóstico', 'Análise técnica', 'Causa identificada', 'Parecer técnico'],
    internalNotes: ['Observações internas', 'Notas internas', 'Anotações da equipe'],
    partBrand: ['Marca da peça', 'Fabricante', 'Marca / fabricante'],
    finalNotes: ['Observação final', 'Conferência final', 'Notas de entrega']
  },
  artemis: {
    customerName: ['Cliente', 'Nome do cliente', 'Consumidor'],
    customerPhone: ['Telefone', 'Celular', 'WhatsApp', 'Contato'],
    deliveryAddress: ['Endereço', 'Endereço de entrega', 'Local de entrega'],
    orderChannel: ['Canal', 'Canal do pedido', 'Origem do pedido'],
    orderNotes: ['Observações do pedido', 'Observações', 'Pedido especial'],
    productName: ['Produto', 'Nome do produto', 'Item do cardápio'],
    productDescription: ['Descrição', 'Descrição do produto'],
    category: ['Categoria', 'Seção do cardápio', 'Grupo'],
    price: ['Preço', 'Valor', 'Preço de venda'],
    prepTime: ['Tempo de preparo', 'Previsão de preparo', 'Tempo estimado'],
    ingredients: ['Ingredientes e alergênicos', 'Ingredientes', 'Composição'],
    tableName: ['Mesa', 'Número da mesa', 'Identificação da mesa'],
    tableSeats: ['Lugares', 'Capacidade', 'Pessoas'],
    cashOperator: ['Operador do caixa', 'Operador', 'Responsável pelo caixa']
  },
  kronos: {
    dealTitle: ['Oportunidade', 'Negociação', 'Venda', 'O que será negociado?'],
    customer: ['Cliente', 'Empresa', 'Contato'],
    value: ['Valor previsto', 'Valor da oportunidade', 'Valor estimado'],
    source: ['Origem do contato', 'Origem', 'Canal de entrada'],
    due: ['Próximo contato', 'Próximo retorno', 'Data da próxima ação'],
    nextAction: ['Objetivo do próximo contato', 'Próxima ação', 'Próximo passo'],
    notes: ['Contexto da negociação', 'Observações', 'Contexto comercial'],
    lostReason: ['Motivo da perda', 'Razão da perda', 'Motivo de não fechamento']
  },
  'athena-pesquisa': {
    surveyTitle: ['Nome da pesquisa', 'Título da pesquisa', 'Pesquisa'],
    surveyDescription: ['Mensagem para quem vai responder', 'Apresentação', 'Descrição'],
    contact: ['Contato autorizado', 'Contato', 'Dados de contato'],
    questionTitle: ['Pergunta', 'Enunciado', 'Questão'],
    questionType: ['Tipo de resposta', 'Formato da resposta', 'Tipo de pergunta'],
    requiredQuestion: ['Resposta obrigatória', 'Obrigatória', 'Exigir resposta']
  },
  'athena-orcamentos': {
    customer: ['Cliente', 'Contratante', 'Solicitante'],
    title: ['Título', 'Nome do orçamento', 'Proposta'],
    validity: ['Validade', 'Válido até', 'Prazo da proposta'],
    item: ['Item', 'Descrição', 'Serviço / produto'],
    quantity: ['Quantidade', 'Qtd.', 'Volume'],
    unitPrice: ['Valor unitário', 'Preço unitário', 'Valor'],
    discount: ['Desconto', 'Abatimento'],
    customerNotes: ['Observações para o cliente', 'Condições', 'Mensagem ao cliente'],
    decisionNote: ['Registro da decisão', 'Decisão do cliente', 'Observação da decisão']
  }
};

export function fieldLabelOptions(app: AppId, key: string, fallback: string) {
  return common(fallback, labels[app]?.[key] || []);
}
