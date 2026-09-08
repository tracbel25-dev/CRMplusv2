export type AppTone = 'zeus' | 'artemis' | 'athena' | 'kronos' | 'athena-budget';
export type StoreApp = { slug:string; name:string; category:string; segment:string; short:string; description:string; tone:AppTone; features:string[] };

export const apps: StoreApp[] = [
  { slug:'zeus', name:'Zeus', category:'Oficina', segment:'Serviços', short:'Sistema de oficina', description:'Organize atendimento, ordens de serviço, orçamento e histórico em um fluxo feito para a rotina da oficina.', tone:'zeus', features:['Abertura e gestão de OS','Orçamento digital com link de aprovação','Relatório de atendimento digital','Fluxo operacional configurável'] },
  { slug:'artemis', name:'Artemis', category:'Restaurante', segment:'Alimentação', short:'Sistema de restaurante', description:'Cardápio, pedidos, mesas, cozinha e caixa trabalhando na mesma sequência operacional.', tone:'artemis', features:['Cardápio digital','Pedidos para delivery e retirada','Controle de mesas e comandas','Cozinha e caixa integrados'] },
  { slug:'athena-pesquisa', name:'Athena', category:'Pesquisa de satisfação', segment:'Experiência do cliente', short:'Pesquisa de satisfação', description:'Colete respostas e organize a percepção dos seus clientes em uma experiência simples.', tone:'athena', features:['Pesquisas digitais','Coleta por link','Organização das respostas','Leitura objetiva do retorno'] },
  { slug:'kronos', name:'Kronos', category:'Vendas', segment:'Comercial', short:'Operação de vendas', description:'Uma experiência própria para organizar rotina comercial e acompanhamento de oportunidades.', tone:'kronos', features:['Organização comercial','Acompanhamento de oportunidades','Rotina de atendimento','Histórico de negociações'] },
  { slug:'athena-orcamentos', name:'Athena', category:'Orçamentos', segment:'Serviços', short:'Orçamentos digitais', description:'Monte, compartilhe e acompanhe orçamentos sem transformar a experiência em um ERP pesado.', tone:'athena-budget', features:['Criação de orçamento','Compartilhamento por link','Organização de itens','Acompanhamento da decisão'] }
];

export const featured = [apps[0], apps[1]];
