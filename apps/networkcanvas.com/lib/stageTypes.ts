import type { StageType } from '@codaco/protocol-validation';
import type { ProtocolStage } from '~/lib/protocolStages';

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

export function summarizeStages(stages: ProtocolStage[]): StageSummary {
  const edgeCounts = EDGE_GENERATING_STAGE_TYPES.map((type) => ({
    type,
    count: stages.filter((stage) => stage.type === type).length,
  })).filter(({ count }) => count > 0);

  return { total: stages.length, edgeCounts };
}
