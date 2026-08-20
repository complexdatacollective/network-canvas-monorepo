import type {
  InterfaceImpliedRules,
  Stage,
  Variables,
} from '@codaco/protocol-validation';
import type { VariableValue } from '@codaco/shared-consts';

import { collectBinOnlyVariables } from '../../constraints/binOnlyVariables';
import {
  buildEntityConstraints,
  rulesForSubject,
} from '../../constraints/buildConstraints';
import type { GenerationContext } from '../../constraints/context';
import {
  type EntityScopeRef,
  generateEntityAttributes,
} from '../../constraints/generateEntityAttributes';
import type { EntityConstraints } from '../../constraints/types';

/**
 * The constraints a binning stage draws its prompt values against.
 *
 * Variables a protocol assigns ONLY through a bin prompt have their validation
 * stripped, because the interview never enforces it: neither binning interface
 * builds a form field, so both write the bin's value straight through
 * `updateNode`. Keeping the rules would refuse arrangements the interface can
 * produce — `differentFrom` would forbid two alters sharing a bin.
 *
 * A variable some other stage also writes keeps its rules, because that other
 * site may be a form field where a participant is shown the error.
 *
 * Built here rather than taken from the session's constraint cache for that
 * reason: this is a different analysis of the same codebook, not a second copy
 * of the same one.
 */
export const binConstraints = ({
  variables,
  stages,
  subjectType,
  today,
  interfaceRules,
}: {
  variables: Variables | undefined;
  stages: Stage[];
  subjectType: string;
  today: string;
  interfaceRules: InterfaceImpliedRules;
}): EntityConstraints =>
  buildEntityConstraints(
    variables,
    today,
    collectBinOnlyVariables(stages).get(subjectType) ?? new Set(),
    // Stripping a bin-only variable's DECLARED rules does not strip what the
    // bin itself imposes: an alter dropped into a bin is in exactly one of
    // them, whatever the codebook does or does not say.
    rulesForSubject(interfaceRules, { entity: 'node', type: subjectType }),
  );

/**
 * The value one alter takes for one bin prompt, drawn through the constraint
 * engine like every other attribute.
 *
 * `undefined` is the alter left in the bucket: the engine emits nothing for a
 * variable its descriptor left unanswered, and an unplaced alter is exactly an
 * alter with no value for that variable.
 */
export const binValueFor = ({
  constraints,
  generation,
  scope,
  variableId,
  index,
}: {
  constraints: EntityConstraints;
  generation: GenerationContext;
  scope: EntityScopeRef;
  variableId: string;
  index: number;
}): VariableValue | undefined =>
  generateEntityAttributes(constraints, generation, scope, index, {
    only: new Set([variableId]),
  })[variableId];
