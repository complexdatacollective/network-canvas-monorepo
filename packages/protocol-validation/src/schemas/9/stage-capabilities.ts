// A leaf module: `common/subjects.ts` imports it at runtime, and every stage
// module imports that, so nothing here may import a module that reaches the
// stage schemas. Only types come from the schema tree.
import {
  getEndpointRules,
  isDirectedEdgeType,
} from '../../utils/edgeTypeRules.ts';
import type { EntityTypeReferenceHit } from '../../utils/schemaReferenceWalk.ts';
import type { Codebook } from './codebook/codebook.ts';
import type { Stage, StageType } from './stages/index.ts';

type EdgeStageType = Extract<
  StageType,
  | 'Sociogram'
  | 'Narrative'
  | 'DyadCensus'
  | 'OneToManyDyadCensus'
  | 'TieStrengthCensus'
  | 'NetworkComposer'
  | 'AlterEdgeForm'
  | 'FamilyPedigree'
>;

// Temporary: each stage type's entry is raised as that stage learns to run
// directed edge types and endpoint rules, and the table goes once every stage
// can.
export const STAGE_EDGE_TYPE_SUPPORT: Record<
  EdgeStageType,
  { directed: boolean; endpointRules: boolean }
> = {
  Sociogram: { directed: false, endpointRules: false },
  Narrative: { directed: false, endpointRules: false },
  DyadCensus: { directed: false, endpointRules: false },
  OneToManyDyadCensus: { directed: false, endpointRules: false },
  TieStrengthCensus: { directed: false, endpointRules: false },
  NetworkComposer: { directed: false, endpointRules: false },
  AlterEdgeForm: { directed: false, endpointRules: false },
  FamilyPedigree: { directed: false, endpointRules: false },
};

const isEdgeStageType = (type: string): type is EdgeStageType =>
  Object.hasOwn(STAGE_EDGE_TYPE_SUPPORT, type);

/**
 * The rules of filters, skip logic, panel filters and conditions name an edge
 * type without drawing or creating its edges, so its direction and endpoint
 * rules do not matter to the stage. A condition names an edge type only in a
 * rule's options.
 */
const isOrientationBlindPath = (path: readonly (string | number)[]) =>
  path.some(
    (segment, index) =>
      segment === 'rules' &&
      typeof path[index + 1] === 'number' &&
      path[index + 2] === 'options',
  );

export const stageEdgeTypeSupportIssues = (
  protocol: { codebook: Codebook; stages: readonly Stage[] },
  typeHits: readonly EntityTypeReferenceHit[],
): Array<{ path: (string | number)[]; message: string }> => {
  const issues: Array<{ path: (string | number)[]; message: string }> = [];
  for (const hit of typeHits) {
    const [root, stageIndex] = hit.path;
    if (
      root !== 'stages' ||
      typeof stageIndex !== 'number' ||
      hit.entity !== 'edge' ||
      isOrientationBlindPath(hit.path)
    ) {
      continue;
    }
    const stage = protocol.stages[stageIndex];
    if (!stage || !isEdgeStageType(stage.type)) continue;
    const support = STAGE_EDGE_TYPE_SUPPORT[stage.type];
    const edgeTypeName = Object.hasOwn(protocol.codebook.edge ?? {}, hit.typeId)
      ? (protocol.codebook.edge?.[hit.typeId]?.name ?? hit.typeId)
      : hit.typeId;
    if (
      !support.directed &&
      isDirectedEdgeType(protocol.codebook, hit.typeId)
    ) {
      issues.push({
        path: hit.path,
        message: `Edge type "${edgeTypeName}" is directed, which this stage cannot use.`,
      });
    }
    if (
      !support.endpointRules &&
      getEndpointRules(protocol.codebook, hit.typeId) !== undefined
    ) {
      issues.push({
        path: hit.path,
        message: `Edge type "${edgeTypeName}" limits which node types it connects, which this stage cannot use.`,
      });
    }
  }
  return issues;
};
