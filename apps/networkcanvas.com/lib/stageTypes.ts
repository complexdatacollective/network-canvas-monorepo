import type { StageType } from '@codaco/protocol-validation';
import type { ProtocolStage } from '~/lib/protocolStages';

export const STAGE_TYPE_COLORS: Record<StageType, string> = {
  NameGenerator: 'bg-sea-green',
  NameGeneratorQuickAdd: 'bg-kiwi',
  NameGeneratorRoster: 'bg-sea-green-dark',
  EgoForm: 'bg-cerulean-blue',
  AlterForm: 'bg-slate-blue',
  AlterEdgeForm: 'bg-cyber-grape',
  Sociogram: 'bg-neon-coral',
  DyadCensus: 'bg-tomato',
  TieStrengthCensus: 'bg-paradise-pink',
  OneToManyDyadCensus: 'bg-barbie-pink',
  NetworkComposer: 'bg-neon-coral-dark',
  OrdinalBin: 'bg-mustard',
  CategoricalBin: 'bg-neon-carrot',
  Narrative: 'bg-sea-serpent',
  FamilyPedigree: 'bg-purple-pizazz',
  NarrativePedigree: 'bg-purple-pizazz-dark',
  Geospatial: 'bg-navy-taupe',
  Information: 'bg-text/25',
  Anonymisation: 'bg-text/55',
};

export const UNKNOWN_STAGE_COLOR = 'bg-neutral';

export const EDGE_GENERATING_STAGE_TYPES = [
  'Sociogram',
  'DyadCensus',
  'TieStrengthCensus',
  'OneToManyDyadCensus',
  'NetworkComposer',
] as const satisfies readonly StageType[];

export type EdgeGeneratingStageType =
  (typeof EDGE_GENERATING_STAGE_TYPES)[number];

export type StageSummary = {
  total: number;
  edgeCounts: { type: EdgeGeneratingStageType; count: number }[];
};

export function isStageType(type: string): type is StageType {
  return Object.hasOwn(STAGE_TYPE_COLORS, type);
}

export function stageColorClass(type: string): string {
  return isStageType(type) ? STAGE_TYPE_COLORS[type] : UNKNOWN_STAGE_COLOR;
}

export function summarizeStages(stages: ProtocolStage[]): StageSummary {
  const edgeCounts = EDGE_GENERATING_STAGE_TYPES.map((type) => ({
    type,
    count: stages.filter((stage) => stage.type === type).length,
  })).filter(({ count }) => count > 0);

  return { total: stages.length, edgeCounts };
}
