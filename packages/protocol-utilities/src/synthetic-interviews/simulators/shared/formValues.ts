import type { Variables } from '@codaco/protocol-validation';
import type { VariableValue } from '@codaco/shared-consts';

import type { GenerationContext } from '../../constraints/context';
import {
  type EntityScopeRef,
  generateEntityAttributes,
} from '../../constraints/generateEntityAttributes';
import type { EntityConstraints } from '../../constraints/types';

/**
 * The values one entity gives for the variables a form collects.
 *
 * Every attribute goes through the constraint engine, which reads both things
 * that have a claim on a value: `validation` says which values are legal and
 * how a variable relates to its siblings, and the `synthetic` descriptor says
 * which of the legal values the author expects to see. A variable declaring no
 * descriptor is unaffected — the engine draws it exactly as it always did.
 *
 * Scope is the form's own fields and nothing else (plan decision 17): where a
 * field carries a rule naming a variable this form does not collect, the
 * comparator folds against whatever the entity already holds, and folds away
 * where the counterpart is unanswered — which is exactly what the runtime
 * validator does with it, so closing the draw over the counterpart would
 * generate an answer no participant was asked for.
 */
export const resolveFormValues = ({
  variables,
  fields,
  constraints,
  generation,
  scope,
  index,
  existing,
  preferRealisticNameVariables,
}: {
  variables: Variables | undefined;
  /** The variable ids this form collects. */
  fields: ReadonlySet<string>;
  constraints: EntityConstraints;
  generation: GenerationContext;
  scope: EntityScopeRef;
  index: number;
  /**
   * Values this entity already holds. The rules that relate one variable to
   * another read them — a comparator resolves against the answer the
   * participant actually gave — and they are not emitted again, so what comes
   * back is only what this form collected.
   */
  existing?: Record<string, VariableValue>;
  preferRealisticNameVariables?: ReadonlySet<string>;
}): Record<string, VariableValue> => {
  const collected = new Set([...fields].filter((id) => variables?.[id]));
  if (collected.size === 0) return {};

  return generateEntityAttributes(constraints, generation, scope, index, {
    only: collected,
    ...(existing ? { existing } : {}),
    preferRealisticNameVariables,
  });
};
