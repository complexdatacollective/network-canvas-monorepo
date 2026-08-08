import {
  isStageSkipped,
  resolveSkipLogicDestinationIndex,
} from '@codaco/network-query';
import type { Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNetwork,
} from '@codaco/shared-consts';

const EMPTY_NETWORK: NcNetwork = {
  ego: {
    [entityPrimaryKeyProperty]: 'synthetic-reachability-ego',
    [entityAttributesProperty]: {},
  },
  nodes: [],
  edges: [],
};

function skipDecisionWithAbsentEgoAttributes(
  stage: Stage,
  possibleEgoAttributes: ReadonlySet<string>,
): boolean | undefined {
  const { skipLogic } = stage;
  if (skipLogic === undefined) return false;

  for (const rule of skipLogic.filter.rules) {
    if (rule.type !== 'ego') return undefined;
    const attribute =
      'attribute' in rule.options ? rule.options.attribute : undefined;
    if (attribute !== undefined && possibleEgoAttributes.has(attribute)) {
      return undefined;
    }
  }

  return isStageSkipped(skipLogic, EMPTY_NETWORK);
}

/**
 * The stages feasibility may need to analyse before generation starts.
 *
 * Only stages proven unreachable are removed. An ego-only skip condition whose
 * referenced attributes no earlier reachable EgoForm can write is decidable
 * against the empty ego; every other condition remains possible and therefore
 * stays in the conservative pre-pass.
 */
export function reachableStagesForFeasibility(
  stages: Stage[],
  respectSkipLogicAndFiltering: boolean,
): Stage[] {
  if (!respectSkipLogicAndFiltering) return stages;

  const reachable: Stage[] = [];
  const possibleEgoAttributes = new Set<string>();

  for (let index = 0; index < stages.length; index++) {
    const stage = stages[index]!;
    const skipped = skipDecisionWithAbsentEgoAttributes(
      stage,
      possibleEgoAttributes,
    );

    if (skipped === true) {
      const destination = stage.skipLogic?.destination;
      if (destination !== undefined) {
        const destinationIndex = resolveSkipLogicDestinationIndex(
          destination,
          stages,
          index,
        );
        if (destinationIndex !== undefined) {
          index = destinationIndex - 1;
        }
      }
      continue;
    }

    reachable.push(stage);
    if (stage.type === 'EgoForm') {
      // The fields this form actually collects, not every ego variable the
      // codebook declares. An EgoForm is the only thing that writes onto ego,
      // so a variable no reachable form asks for is one the session never
      // holds — and treating it as merely possible leaves a stage guarded on
      // it undecidable, which keeps a stage the run provably never reaches.
      // The planner then gives that stage part of a population nothing builds.
      for (const field of stage.form?.fields ?? []) {
        // Tolerated as a draft: Architect previews a form whose field has no
        // variable chosen yet.
        if (typeof field.variable === 'string') {
          possibleEgoAttributes.add(field.variable);
        }
      }
    }
  }

  return reachable;
}
