import type { Data } from './model';
import { normalize } from './model';
import { ZEUS_CHECKLIST_TEMPLATES, type ZeusChecklistSegment } from './checklistTemplates';
import { isZeusChecklistAssetFolder, type ZeusChecklistAssetFolder } from './checklistAssets';
import {
  ZEUS_CHECKLIST_CONFIG_KEY,
  ZEUS_CHECKLIST_ENABLED_KEY,
  ZEUS_CHECKLIST_FOLDER_KEY,
  ZEUS_CHECKLIST_COMPLETED_KEY,
} from './zeusChecklistKeys';

export const ZEUS_CHECKLIST_FOLDER_LABELS: Record<ZeusChecklistAssetFolder, string> = {
  caminhao_cavalo_mecanico: 'Caminhão cavalo mecânico',
  caminhao_medio: 'Caminhão médio',
  caminhao_pequeno: 'Caminhão pequeno',
  carro: 'Carro',
  empilhadeira: 'Empilhadeira',
  maquina_carregadeira: 'Carregadeira',
  maquina_escavadeira: 'Escavadeira',
  maquina_motoniveladora: 'Motoniveladora',
  maquina_retroescavadeira: 'Retroescavadeira',
  maquina_rolo_compactador: 'Rolo compactador',
  micro_onibus: 'Micro-ônibus',
  moto: 'Moto',
  onibus: 'Ônibus',
  trator_agricola: 'Trator agrícola',
  van: 'Van',
};

export const ZEUS_CHECKLIST_SEGMENT_BY_FOLDER: Record<ZeusChecklistAssetFolder, ZeusChecklistSegment> = {
  caminhao_cavalo_mecanico: 'truck', caminhao_medio: 'truck', caminhao_pequeno: 'truck', carro: 'auto',
  empilhadeira: 'machine', maquina_carregadeira: 'machine', maquina_escavadeira: 'machine', maquina_motoniveladora: 'machine',
  maquina_retroescavadeira: 'machine', maquina_rolo_compactador: 'machine', micro_onibus: 'truck', moto: 'moto',
  onibus: 'truck', trator_agricola: 'machine', van: 'truck',
};

export type ZeusChecklistCategoryId = 'light' | 'heavy' | 'yellow' | 'industrial' | 'agricultural';
export type ZeusChecklistCategory = { id: ZeusChecklistCategoryId; label: string; description: string; folders: ZeusChecklistAssetFolder[] };

export const ZEUS_CHECKLIST_CATEGORIES: ZeusChecklistCategory[] = [
  { id: 'light', label: 'Veículos leves', description: 'Uso urbano e utilitário', folders: ['carro', 'van', 'micro_onibus', 'moto'] },
  { id: 'heavy', label: 'Caminhões / ônibus', description: 'Transporte rodoviário e coletivo', folders: ['caminhao_pequeno', 'caminhao_medio', 'caminhao_cavalo_mecanico', 'onibus'] },
  { id: 'yellow', label: 'Máquinas linha amarela', description: 'Construção e terraplenagem', folders: ['maquina_escavadeira', 'maquina_retroescavadeira', 'maquina_carregadeira', 'maquina_motoniveladora', 'maquina_rolo_compactador'] },
  { id: 'industrial', label: 'Equipamentos industriais', description: 'Movimentação e operação interna', folders: ['empilhadeira'] },
  { id: 'agricultural', label: 'Agrícola', description: 'Máquinas para operação no campo', folders: ['trator_agricola'] },
];

export type ZeusChecklistConfig = {
  enabled: boolean;
  requireSignature: boolean;
  defaultAssetFolder: ZeusChecklistAssetFolder;
  itemsBySegment: Record<ZeusChecklistSegment, string[]>;
};

export function defaultZeusChecklistConfig(): ZeusChecklistConfig {
  return {
    enabled: true,
    requireSignature: true,
    defaultAssetFolder: 'carro',
    itemsBySegment: {
      auto: [...ZEUS_CHECKLIST_TEMPLATES.auto.items],
      moto: [...ZEUS_CHECKLIST_TEMPLATES.moto.items],
      truck: [...ZEUS_CHECKLIST_TEMPLATES.truck.items],
      machine: [...ZEUS_CHECKLIST_TEMPLATES.machine.items],
    },
  };
}

export function readZeusChecklistConfig(data: Data): ZeusChecklistConfig {
  const fallback = defaultZeusChecklistConfig();
  try {
    const raw = data.customFieldValues?.[ZEUS_CHECKLIST_CONFIG_KEY]?.value;
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ZeusChecklistConfig>;
    return {
      enabled: parsed.enabled !== false,
      requireSignature: parsed.requireSignature !== false,
      defaultAssetFolder: isZeusChecklistAssetFolder(String(parsed.defaultAssetFolder || '')) ? parsed.defaultAssetFolder as ZeusChecklistAssetFolder : fallback.defaultAssetFolder,
      itemsBySegment: {
        auto: Array.isArray(parsed.itemsBySegment?.auto) && parsed.itemsBySegment!.auto!.length ? parsed.itemsBySegment!.auto! : fallback.itemsBySegment.auto,
        moto: Array.isArray(parsed.itemsBySegment?.moto) && parsed.itemsBySegment!.moto!.length ? parsed.itemsBySegment!.moto! : fallback.itemsBySegment.moto,
        truck: Array.isArray(parsed.itemsBySegment?.truck) && parsed.itemsBySegment!.truck!.length ? parsed.itemsBySegment!.truck! : fallback.itemsBySegment.truck,
        machine: Array.isArray(parsed.itemsBySegment?.machine) && parsed.itemsBySegment!.machine!.length ? parsed.itemsBySegment!.machine! : fallback.itemsBySegment.machine,
      },
    };
  } catch {
    return fallback;
  }
}

export function writeZeusChecklistConfig(data: Data, config: ZeusChecklistConfig) {
  data.customFieldValues ??= {};
  data.customFieldValues[ZEUS_CHECKLIST_CONFIG_KEY] = { value: JSON.stringify(config) };
}

export function zeusChecklistCategoryForFolder(folder: ZeusChecklistAssetFolder): ZeusChecklistCategoryId {
  return ZEUS_CHECKLIST_CATEGORIES.find(category => category.folders.includes(folder))?.id || 'light';
}

export function zeusChecklistState(data: Data, jobId: string) {
  const config = readZeusChecklistConfig(data);
  const values = data.customFieldValues?.[jobId] || {};
  const savedFolder = isZeusChecklistAssetFolder(String(values[ZEUS_CHECKLIST_FOLDER_KEY] || '')) ? values[ZEUS_CHECKLIST_FOLDER_KEY] as ZeusChecklistAssetFolder : '';
  const explicitDisabled = values[ZEUS_CHECKLIST_ENABLED_KEY] === 'false';
  const folder = explicitDisabled ? '' : savedFolder || (config.enabled ? config.defaultAssetFolder : '');
  return {
    config,
    folder: folder as ZeusChecklistAssetFolder | '',
    enabled: !!folder,
    completed: values[ZEUS_CHECKLIST_COMPLETED_KEY] === 'true',
    explicit: values[ZEUS_CHECKLIST_ENABLED_KEY] === 'true' || values[ZEUS_CHECKLIST_ENABLED_KEY] === 'false',
  };
}

export function setZeusChecklistChoice(data: Data, jobId: string, folder: ZeusChecklistAssetFolder | '') {
  data.customFieldValues ??= {};
  data.customFieldValues[jobId] = {
    ...(data.customFieldValues[jobId] || {}),
    [ZEUS_CHECKLIST_ENABLED_KEY]: folder ? 'true' : 'false',
    [ZEUS_CHECKLIST_FOLDER_KEY]: folder,
  };
}

export function addZeusChecklistItem(config: ZeusChecklistConfig, segment: ZeusChecklistSegment, value: string) {
  const clean = value.trim();
  if (!clean) return config;
  if (config.itemsBySegment[segment].some(item => normalize(item) === normalize(clean))) throw new Error('Esse item já existe neste modelo.');
  return { ...config, itemsBySegment: { ...config.itemsBySegment, [segment]: [...config.itemsBySegment[segment], clean] } };
}

export const isZeusChecklistFolder = isZeusChecklistAssetFolder;
