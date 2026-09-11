export type ZeusChecklistSegment = 'auto' | 'moto' | 'truck' | 'machine';

export type ZeusChecklistTemplate = {
  id: ZeusChecklistSegment;
  label: string;
  shortLabel: string;
  description: string;
  items: string[];
};

export const ZEUS_CHECKLIST_TEMPLATES: Record<ZeusChecklistSegment, ZeusChecklistTemplate> = {
  auto: {
    id: 'auto',
    label: 'Automóvel / Picape',
    shortLabel: 'Automóvel',
    description: 'Carros, utilitários e picapes.',
    items: [
      'Faróis / lâmpadas / piscas',
      'Estepe / chave de roda',
      'Macaco / triângulo',
      'Limpador e lavador de para-brisa',
      'Buzina',
      'Pneus dianteiros',
      'Pneus traseiros',
      'Rodas / calotas',
      'Freios (pé e mão)',
      'Cinto de segurança',
      'Indicadores do painel',
      'Óleo do motor (nível)',
      'Fluido de freio (nível)',
      'Líquido de arrefecimento (nível)',
      'Fechamento das janelas',
    ],
  },
  moto: {
    id: 'moto',
    label: 'Moto',
    shortLabel: 'Moto',
    description: 'Motocicletas e similares.',
    items: [
      'Farol / lanterna / piscas',
      'Buzina',
      'Pneus e rodas',
      'Freio dianteiro',
      'Freio traseiro',
      'Retrovisores',
      'Guidão / comandos',
      'Corrente / transmissão',
      'Nível de óleo do motor',
      'Painel / indicadores',
      'Pedaleiras / manetes',
      'Banco / carenagens',
      'Vazamentos aparentes',
    ],
  },
  truck: {
    id: 'truck',
    label: 'Caminhão / Ônibus',
    shortLabel: 'Caminhão',
    description: 'Caminhões, ônibus, vans pesadas e frotas.',
    items: [
      'Pneus dianteiros',
      'Pneus traseiros',
      'Estepe',
      'Rodas e porcas',
      'Faróis / lanternas',
      'Setas e luz de freio',
      'Retrovisores',
      'Para-choque dianteiro',
      'Para-choque traseiro',
      'Carroceria / baú / implemento',
      'Tacógrafo',
      'Extintor de incêndio',
      'Triângulo / itens de segurança',
      'Sistema de freio',
      'Sistema de suspensão',
      'Vazamentos aparentes',
      'Documentação do veículo',
    ],
  },
  machine: {
    id: 'machine',
    label: 'Máquina / Equipamento',
    shortLabel: 'Máquina',
    description: 'Linha amarela, tratores, empilhadeiras e equipamentos.',
    items: [
      'Horímetro (funcionamento)',
      'Nível de óleo do motor',
      'Nível de fluido hidráulico',
      'Sistema de arrefecimento (nível)',
      'Esteiras / pneus',
      'Cabine (estrutura, vidros e limpeza)',
      'Lança / braço / cilindros',
      'Concha / implemento (fixação e desgaste)',
      'Sistema hidráulico (mangueiras e conexões)',
      'Faróis e luzes de sinalização',
      'Buzina e alarmes sonoros',
      'Extintor de incêndio',
      'Vazamentos (óleo, hidráulico ou combustível)',
    ],
  },
};

export const ZEUS_CHECKLIST_SEGMENTS = Object.values(ZEUS_CHECKLIST_TEMPLATES);

export function inferZeusChecklistSegment(assetLabel = '', model = ''): ZeusChecklistSegment {
  const text = `${assetLabel} ${model}`.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/moto|motocic|scooter/.test(text)) return 'moto';
  if (/caminhao|onibus|truck|volvo fh|scania|actros|constellation|daily|sprinter/.test(text)) return 'truck';
  if (/maquina|equipamento|escav|carregadeira|retroescav|trator|empilhadeira|motoniveladora|rolo|guindaste|linha amarela/.test(text)) return 'machine';
  return 'auto';
}
