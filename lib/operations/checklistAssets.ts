export type ZeusChecklistAssetFolder =
  | 'caminhao_cavalo_mecanico'
  | 'caminhao_medio'
  | 'caminhao_pequeno'
  | 'carro'
  | 'empilhadeira'
  | 'maquina_carregadeira'
  | 'maquina_escavadeira'
  | 'maquina_motoniveladora'
  | 'maquina_retroescavadeira'
  | 'maquina_rolo_compactador'
  | 'micro_onibus'
  | 'moto'
  | 'onibus'
  | 'trator_agricola'
  | 'van';

export type ZeusChecklistView = 'teto' | 'frente' | 'traseira' | 'lateral_esquerda' | 'lateral_direita';

export const ZEUS_CHECKLIST_VIEWS: ZeusChecklistView[] = [
  'teto',
  'frente',
  'traseira',
  'lateral_esquerda',
  'lateral_direita',
];

export const ZEUS_CHECKLIST_VIEW_LABELS: Record<ZeusChecklistView, string> = {
  teto: 'Superior',
  frente: 'Frontal',
  traseira: 'Traseira',
  lateral_esquerda: 'Lateral esquerda',
  lateral_direita: 'Lateral direita',
};

export const ZEUS_CHECKLIST_ASSET_FOLDERS: ZeusChecklistAssetFolder[] = [
  'caminhao_cavalo_mecanico',
  'caminhao_medio',
  'caminhao_pequeno',
  'carro',
  'empilhadeira',
  'maquina_carregadeira',
  'maquina_escavadeira',
  'maquina_motoniveladora',
  'maquina_retroescavadeira',
  'maquina_rolo_compactador',
  'micro_onibus',
  'moto',
  'onibus',
  'trator_agricola',
  'van',
];

export function isZeusChecklistAssetFolder(value: string): value is ZeusChecklistAssetFolder {
  return ZEUS_CHECKLIST_ASSET_FOLDERS.includes(value as ZeusChecklistAssetFolder);
}

export function isZeusChecklistView(value: string): value is ZeusChecklistView {
  return ZEUS_CHECKLIST_VIEWS.includes(value as ZeusChecklistView);
}

function normalized(value: unknown) {
  return String(value || '')
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function inferZeusChecklistAssetFolder(
  assetLabel = '',
  assetInfo: Record<string, unknown> = {},
): ZeusChecklistAssetFolder {
  const explicit = normalized(assetInfo.checklistAssetFolder || assetInfo.checklist_asset_folder);
  const explicitFolder = explicit.replace(/ /g, '_');
  if (isZeusChecklistAssetFolder(explicitFolder)) return explicitFolder;

  const text = normalized([
    assetLabel,
    assetInfo.type,
    assetInfo.kind,
    assetInfo.category,
    assetInfo.segment,
    assetInfo.classification,
    assetInfo.brand,
    assetInfo.model,
    assetInfo.name,
    assetInfo.description,
  ].filter(Boolean).join(' '));

  if (/moto|motocic|scooter/.test(text)) return 'moto';
  if (/micro ?onibus|minibus/.test(text)) return 'micro_onibus';
  if (/\bonibus\b|\bbus\b/.test(text)) return 'onibus';
  if (/\bvan\b|sprinter|master|ducato|jumper|transit/.test(text)) return 'van';

  if (/cavalo mecanico|tractor head|truck tractor|\bfh\b|\bfm\b|scania [rg]|actros|axor/.test(text)) {
    return 'caminhao_cavalo_mecanico';
  }
  if (/caminhao pequeno|caminhao leve|\bvuc\b|hyundai hr|kia bongo|iveco daily/.test(text)) {
    return 'caminhao_pequeno';
  }
  if (/caminhao|truck|bau|baú/.test(text)) return 'caminhao_medio';

  if (/empilhadeira|forklift/.test(text)) return 'empilhadeira';
  if (/retroescav/.test(text)) return 'maquina_retroescavadeira';
  if (/motoniveladora|motor grader|grader/.test(text)) return 'maquina_motoniveladora';
  if (/rolo compactador|compactador|roller/.test(text)) return 'maquina_rolo_compactador';
  if (/pa carregadeira|pá carregadeira|carregadeira|wheel loader/.test(text)) return 'maquina_carregadeira';
  if (/escavadeira|excavator/.test(text)) return 'maquina_escavadeira';
  if (/trator agricola|trator agrícola|tractor agric/.test(text)) return 'trator_agricola';

  return 'carro';
}

export function normalizeZeusChecklistView(value: string): ZeusChecklistView {
  const text = normalized(value);
  if (/teto|superior/.test(text)) return 'teto';
  if (/frente|frontal/.test(text)) return 'frente';
  if (/traseira/.test(text)) return 'traseira';
  if (/lateral esquerda/.test(text)) return 'lateral_esquerda';
  if (/lateral direita/.test(text)) return 'lateral_direita';
  return 'frente';
}
