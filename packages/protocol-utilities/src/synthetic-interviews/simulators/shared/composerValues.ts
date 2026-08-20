import type {
  InterfaceImpliedRules,
  Stage,
  StructuralCodebook,
} from '@codaco/protocol-validation';

import {
  buildEntityConstraints,
  rulesForSubject,
} from '../../constraints/buildConstraints';
import {
  applyComposerRenderings,
  COMPOSER_RENDERING_CONFLICT,
} from '../../constraints/composerRenderings';
import { SyntheticDataConstraintError } from '../../constraints/error';
import type { EntityScopeRef } from '../../constraints/generateEntityAttributes';
import type { EntityConstraints } from '../../constraints/types';

/**
 * The codebook a Network Composer stage's forms actually collect against.
 *
 * A composer field carries its OWN `component` and `parameters`, which the
 * runtime's form builder uses in place of the codebook variable's
 * (`interview/src/selectors/forms.ts`), and which
 * `buildDatePickerBoundProps` then turns into the field's hard min/max
 * validators. Read from the codebook alone, a stage rendering a datetime as a
 * RelativeDatePicker pinned to one anchor day looks like whatever broad window
 * the codebook declared, and every node the stage creates is given a date its
 * own inspector rejects.
 *
 * Built here rather than taken from the session's constraint cache, for the
 * same reason `binConstraints` is: this is a different analysis of the same
 * codebook, not a second copy of the same one.
 *
 * A protocol whose reachable forms render one stored value through date
 * controls with no common window is REFUSED. The refusal depends only on the
 * protocol, so it is the same on every seed (rule 5); Phase 4's feasibility
 * pass is where it moves to be raised before the walk starts rather than when
 * the stage is reached.
 */
export const composerRenderedCodebook = (
  codebook: StructuralCodebook,
  stages: Stage[],
  today: string,
): StructuralCodebook => {
  const { codebook: rendered, conflicts } = applyComposerRenderings(
    codebook,
    stages,
    today,
  );

  if (conflicts.length > 0) {
    throw new SyntheticDataConstraintError(
      conflicts,
      COMPOSER_RENDERING_CONFLICT.summary,
    );
  }

  return rendered;
};

/** One entity scope's constraints, read off an already-rendered codebook. */
export const renderedConstraintsFor = ({
  codebook,
  scope,
  today,
  interfaceRules,
}: {
  codebook: StructuralCodebook;
  scope: EntityScopeRef;
  today: string;
  interfaceRules: InterfaceImpliedRules;
}): EntityConstraints =>
  buildEntityConstraints(
    scope.entity === 'ego'
      ? codebook.ego?.variables
      : codebook[scope.entity]?.[scope.type]?.variables,
    today,
    undefined,
    rulesForSubject(interfaceRules, scope),
  );
