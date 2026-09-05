import { useId, useMemo } from 'react';

import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import { cx } from '@codaco/fresco-ui/utils/cva';
import type { SkipLogicDestination } from '@codaco/protocol-validation';

import { useStageEditorForm } from '../form/stageEditorContext.ts';
import {
  destinationRoute,
  routeDestination,
  skipLogicDestinationOptions,
  skipLogicDestinationProblem,
  stagePlacement,
} from './skipLogicDestination.ts';

export type SkipLogicDestinationFieldProps = CreateFormFieldProps<
  SkipLogicDestination,
  'div',
  {
    /**
     * Where a stage being CREATED will be inserted, counting from zero.
     *
     * Only consulted for a stage the interview does not contain yet: an
     * existing stage's position is read from the stage order, which is the
     * same list this control offers destinations from. Left out, a new stage
     * is treated as arriving at the end.
     */
    position?: number;
  }
>;

/**
 * Where the interview continues when this stage is skipped.
 *
 * The stages on offer come from the editor's own protocol context, so nothing
 * mounting this passes a stage list, a stage path or a selector — and a stage
 * a collaborator adds, renames, deletes or moves while the editor is open
 * changes what is offered here without the section doing anything.
 *
 * A destination that has become impossible — its stage deleted, or moved to
 * before this one — is REPORTED here rather than corrected or thrown. Where
 * the interview should continue is the researcher's decision; silently
 * dropping the destination would make an interview route change without
 * anybody being told, and throwing would take down the editor they need in
 * order to fix it. It is the same treatment a rule naming a deleted attribute
 * gets, for the same reason.
 *
 * Labelling belongs to the surrounding field; pass `label`/`hint` to the
 * `Field` that renders this.
 */
export default function SkipLogicDestinationField({
  id,
  name,
  value,
  onChange,
  onBlur,
  onFocus,
  position,
  className,
  disabled = false,
  readOnly: readOnlyProp = false,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
  'aria-required': ariaRequired,
}: SkipLogicDestinationFieldProps) {
  const {
    protocolContext,
    identity,
    readOnly: sessionReadOnly,
  } = useStageEditorForm();
  const readOnly = readOnlyProp || sessionReadOnly;
  const problemId = useId();
  const stages = protocolContext.orderedStages;

  const placement = useMemo(
    () => stagePlacement(stages, identity.id, position),
    [identity.id, position, stages],
  );
  const options = useMemo(
    () => skipLogicDestinationOptions(stages, placement, value),
    [placement, stages, value],
  );
  const problem = skipLogicDestinationProblem(value, stages, placement);

  return (
    <div
      data-name={name}
      onBlur={onBlur}
      onFocus={onFocus}
      className={cx('flex w-full flex-col gap-2', className)}
    >
      <NativeSelectField
        id={id}
        name={name}
        options={options}
        value={destinationRoute(value)}
        onChange={(route) => onChange?.(routeDestination(route))}
        disabled={disabled}
        readOnly={readOnly}
        aria-labelledby={ariaLabelledBy}
        // The field's own description first, then the problem: the researcher
        // hears what the control is for before what is wrong with it.
        aria-describedby={
          [ariaDescribedBy, problem === undefined ? undefined : problemId]
            .filter((token) => token !== undefined)
            .join(' ') || undefined
        }
        aria-invalid={problem !== undefined || ariaInvalid === true}
        aria-required={ariaRequired}
      />
      {problem !== undefined && (
        <p
          id={problemId}
          className="text-destructive text-sm"
          data-destination-problem
        >
          {problem}
        </p>
      )}
    </div>
  );
}
