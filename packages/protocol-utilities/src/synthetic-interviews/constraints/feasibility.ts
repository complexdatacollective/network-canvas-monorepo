import {
  type CurrentProtocol,
  type InterfaceImpliedRules,
  MAX_SYNTHETIC_PAIRS,
  type Stage,
  type StructuralCodebook,
  type Variables,
} from '@codaco/protocol-validation';

import type { AssetData } from '../simulators/types';
import { collectBinOnlyVariables } from './binOnlyVariables';
import { buildEntityConstraints, rulesForSubject } from './buildConstraints';
import { resolveGenerationOrder } from './dependencyOrder';
import {
  holdersOf,
  type ScopeCounts,
  worstCaseEntityCounts,
} from './entityCounts';
import type { ConstraintConflict } from './error';
import type { EntityScopeRef } from './generateEntityAttributes';
import { intersectGroupConstraints } from './groupConstraints';
import { valueSpaceSize } from './valueSpace';

/**
 * The pre-seed gate (spec rule 5): a protocol either always generates or never
 * generates, and the never is decided here, once per batch, before a seed is
 * consulted.
 *
 * Every input is structural — the parsed protocol, the run's options, and the
 * asset pools the caller resolved — so two runs of the same batch reach the
 * same verdict whatever seed they carry. Nothing below reads a random source,
 * and nothing below is allowed to: a refusal that depended on a draw would be
 * exactly the seed-dependent failure rule 5 exists to forbid, and the C12
 * invariance test holds this file to it over 500 consecutive seeds.
 *
 * Three refusals, and only three. Each names a demand the protocol makes that
 * no seed can meet:
 *
 *  - a roster stage whose resolved pool cannot reach its own min-nodes gate
 *    (decision 18), which would strand a real participant on that screen;
 *  - a `unique` slot with fewer distinct values than the entities the walk can
 *    build, which exhausts the registry on the seeds that reach that many;
 *  - a stage whose guaranteed pair set is larger than one stage may enumerate
 *    (`MAX_SYNTHETIC_PAIRS`), which is work no preview can do synchronously.
 *
 * What is NOT here is as deliberate. Contradictory validation rules are refused
 * by the schema itself (`rejectValidationContradictions`), and this function
 * receives parse output, so a second opinion about them would be dead code
 * wearing the clothes of a check. Rules that only SOME assignments break are
 * left to the solver, which decides them per entity with the values in hand.
 */

/** The scopes whose `unique` slots this pass measures, in walk order. */
type UniqueScope = {
  scope: EntityScopeRef;
  variables: Variables | undefined;
  typeName: string | undefined;
  counts: ScopeCounts;
};

const displayName = (
  codebook: StructuralCodebook,
  scope: EntityScopeRef,
): string | undefined => {
  if (scope.entity === 'ego') return undefined;
  return codebook[scope.entity]?.[scope.type]?.name;
};

const variablesFor = (
  codebook: StructuralCodebook,
  scope: EntityScopeRef,
): Variables | undefined => {
  if (scope.entity === 'ego') return codebook.ego?.variables;
  return codebook[scope.entity]?.[scope.type]?.variables;
};

/**
 * A roster stage the run cannot get past.
 *
 * `behaviours.minNodes` is the live interface's own gate: below it the stage
 * refuses to advance, and a roster interface fabricates nobody to make up the
 * difference. So a pool short of it is a protocol that would strand a real
 * participant, which is the same session the generator would have to invent —
 * and the refusal is runtime-faithful rather than a generator limitation.
 */
const rosterConflicts = (
  codebook: StructuralCodebook,
  demands: ReturnType<typeof worstCaseEntityCounts>['rosterDemands'],
): ConstraintConflict[] =>
  demands.map((demand) => {
    const scope: EntityScopeRef = { entity: 'node', type: demand.nodeType };
    const name = displayName(codebook, scope);
    return {
      entity: 'node' as const,
      entityType: demand.nodeType,
      ...(name === undefined ? {} : { entityTypeName: name }),
      stageId: demand.stageId,
      variableIds: [],
      variableNames: [],
      rules: ['behaviours.minNodes'],
      reason:
        `stage "${demand.stageLabel}" must nominate at least ${demand.minNodes} from its roster, ` +
        `and ${demand.poolSize === 0 ? 'no rows were resolved for it' : `only ${demand.poolSize} rows were resolved for it`}`,
    };
  });

/**
 * A stage asked to enumerate more pairs than one stage may.
 *
 * Measured against the population the creators before it are GUARANTEED to
 * have built, because that is the demand the protocol always makes: a count
 * that merely could reach a large population on an unlikely draw is not a
 * protocol asking for that work, and refusing it would refuse almost every
 * seed's behaviour on account of one. Where the guarantee alone exceeds the
 * cap, no seed escapes it — which is the always-or-never shape rule 5 asks for.
 *
 * The refusal names the node type rather than the edge type it would create.
 * The number an author can change is how many people reach this stage; the
 * edge type is downstream of that and pointing at it points at nothing.
 */
const pairConflicts = (
  codebook: StructuralCodebook,
  demands: ReturnType<typeof worstCaseEntityCounts>['pairDemands'],
): ConstraintConflict[] =>
  demands
    .filter((demand) => demand.guaranteedPairs > MAX_SYNTHETIC_PAIRS)
    .map((demand) => {
      const scope: EntityScopeRef = {
        entity: 'node',
        type: demand.subjectType,
      };
      const name = displayName(codebook, scope);
      return {
        entity: 'node' as const,
        entityType: demand.subjectType,
        ...(name === undefined ? {} : { entityTypeName: name }),
        stageId: demand.stageId,
        variableIds: [],
        variableNames: [],
        rules: ['synthetic.count'],
        reason:
          `stage "${demand.stageLabel}" asks about every pair of the ${demand.guaranteedNodes} people ` +
          `reaching it, which is ${demand.guaranteedPairs.toLocaleString('en')} pairs; a stage may enumerate ` +
          MAX_SYNTHETIC_PAIRS.toLocaleString('en'),
      };
    });

/**
 * A `unique` slot with less room than the run needs.
 *
 * Measured over the equality GROUP rather than variable by variable, because
 * that is what the generator draws against: members held equal share one slot
 * and one intersected value space, so a variable held equal to a narrower one
 * reaches only the narrower space however wide its own is.
 *
 * Counted over the entities whose value the walk DRAWS, not over every entity
 * of the type — see `holdersOf`. A variable no stage collects is never drawn,
 * however many people the protocol elicits, and refusing on its account would
 * refuse a protocol over a question nobody is asked.
 *
 * Held against the CEILING of the walk's window rather than its floor. The
 * schema's own `syntheticCountSupport` says why — "feasibility must count
 * against the support" — and rule 5 says the rest: a slot that runs dry on the
 * seeds that reach the ceiling is a protocol that does not always generate, so
 * refusing it pre-seed is what keeps refusal seed-independent rather than
 * letting the draw discover it.
 *
 * Carries no `stageId`, deliberately. The demand is the sum of every stage
 * that draws the slot, so no single stage is the one to change — which is why
 * it belongs to the protocol-level verdict rather than to any stage editor.
 */
const uniqueConflicts = (
  scopes: readonly UniqueScope[],
  today: string,
  interfaceRules: InterfaceImpliedRules,
  binOnly: ReadonlyMap<string, ReadonlySet<string>>,
): ConstraintConflict[] => {
  const conflicts: ConstraintConflict[] = [];

  for (const { scope, variables, typeName, counts } of scopes) {
    const unvalidated =
      scope.entity === 'node' ? binOnly.get(scope.type) : undefined;
    const entity = buildEntityConstraints(
      variables,
      today,
      unvalidated,
      rulesForSubject(interfaceRules, scope),
    );
    const { membersOf } = resolveGenerationOrder(entity);
    const groups = intersectGroupConstraints(entity, membersOf);

    for (const [group, memberIds] of membersOf) {
      const variable = groups.get(group);
      if (variable?.constraints.unique !== true) continue;

      const holders = holdersOf(counts, memberIds);
      if (holders === 0) continue;

      const size = valueSpaceSize(variable, holders);
      if (size === 'unbounded' || size >= holders) continue;

      conflicts.push({
        entity: scope.entity,
        ...(scope.entity === 'ego' ? {} : { entityType: scope.type }),
        ...(typeName === undefined ? {} : { entityTypeName: typeName }),
        variableIds: [...memberIds],
        variableNames: memberIds.map((id) => entity.get(id)?.entry.name ?? id),
        rules: ['unique'],
        reason:
          `only ${size} distinct values are possible` +
          `${memberIds.length > 1 ? ' once these attributes are held equal' : ''}, ` +
          `but up to ${holders} ${scope.entity}s of this type can be generated`,
      });
    }
  }

  return conflicts;
};

/**
 * Every reason this protocol can never generate, or an empty list.
 *
 * `today` anchors the date windows the analysis measures, and comes from the
 * batch's own start-window anchor rather than a clock read of its own, so the
 * verdict is a function of the arguments and nothing else.
 */
export const analyseFeasibility = ({
  protocol,
  assetData,
  today,
  interfaceRules,
}: {
  protocol: CurrentProtocol;
  assetData: AssetData;
  today: string;
  interfaceRules: InterfaceImpliedRules;
}): ConstraintConflict[] => {
  const { codebook } = protocol;
  const stages: Stage[] = [...protocol.stages];
  const counts = worstCaseEntityCounts(stages, assetData);
  const binOnly = collectBinOnlyVariables(stages);

  const uniqueScopes: UniqueScope[] = [];
  for (const [key, scopeCounts] of counts.scopes) {
    if (counts.unmodelled.has(key)) continue;

    // `scopeKey` is `ego`, `node:<type>`, or `edge:<type>`. Ego is skipped: one
    // holder can never exhaust a slot, and the schema forbids `unique` there.
    const separator = key.indexOf(':');
    if (separator < 0) continue;
    const entity = key.slice(0, separator);
    const type = key.slice(separator + 1);
    if (entity !== 'node' && entity !== 'edge') continue;

    const scope: EntityScopeRef = { entity, type };
    uniqueScopes.push({
      scope,
      variables: variablesFor(codebook, scope),
      typeName: displayName(codebook, scope),
      counts: scopeCounts,
    });
  }

  return [
    ...rosterConflicts(codebook, counts.rosterDemands),
    ...pairConflicts(codebook, counts.pairDemands),
    ...uniqueConflicts(uniqueScopes, today, interfaceRules, binOnly),
  ];
};

/** The lead sentence a refusal from this gate carries. */
export const FEASIBILITY_SUMMARY =
  'this protocol asks for more than any generated interview could contain';
