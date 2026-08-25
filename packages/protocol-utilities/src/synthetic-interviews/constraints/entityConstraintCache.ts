import type {
  InterfaceImpliedRules,
  StructuralCodebook,
} from '@codaco/protocol-validation';

import { buildEntityConstraints, rulesForSubject } from './buildConstraints';
import { type EntityScopeRef, scopeKey } from './generateEntityAttributes';
import type { EntityConstraints } from './types';

/**
 * One session's constraints per entity scope, built on first use and kept.
 *
 * The analysis depends only on the codebook, the session's date, and the rules
 * the protocol's interfaces imply — none of which change while a session runs
 * — so rebuilding it per stage would redo identical work, and the reservation
 * pass that runs BEFORE the walk would otherwise have to build a second set
 * that could drift from the one the simulators draw against.
 *
 * Binning stages are the deliberate exception: they draw against constraints
 * with the bin-only variables' validation stripped, which is a different
 * analysis of the same codebook rather than a cached one (see
 * `simulators/shared/binValues.ts`).
 */
export type EntityConstraintCache = {
  forScope: (scope: EntityScopeRef) => EntityConstraints;
};

export const createEntityConstraintCache = ({
  codebook,
  today,
  interfaceRules,
}: {
  codebook: StructuralCodebook;
  today: string;
  interfaceRules: InterfaceImpliedRules;
}): EntityConstraintCache => {
  const cached = new Map<string, EntityConstraints>();

  const variablesFor = (scope: EntityScopeRef) => {
    if (scope.entity === 'ego') return codebook.ego?.variables;
    return codebook[scope.entity]?.[scope.type]?.variables;
  };

  return {
    forScope: (scope) => {
      const key = scopeKey(scope);
      const hit = cached.get(key);
      if (hit) return hit;

      const built = buildEntityConstraints(
        variablesFor(scope),
        today,
        undefined,
        rulesForSubject(interfaceRules, scope),
      );
      cached.set(key, built);
      return built;
    },
  };
};
