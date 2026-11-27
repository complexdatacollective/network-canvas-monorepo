import { isEqual } from 'es-toolkit';
import { useCallback } from 'react';

import type { VariableType } from '@codaco/protocol-validation';

import {
  useCreateCodebookVariable,
  useSetVariableComponent,
  useSetVariableOptions,
} from '../../codebook/useCodebookVariableEdits.ts';
import {
  optionsForShape,
  optionsShapeFor,
} from '../../codebook/variableOptions.ts';
import {
  parametersForShape,
  parameterShapeFor,
} from '../../codebook/variableParameters.ts';
import {
  type CodebookSubject,
  variablesForSubject,
} from '../../protocol-context.ts';
import { useProtocolContext } from '../../state/protocolContext.ts';
import { controlsForType } from '../collectableTypes.ts';

/** What became of a codebook write the field settings asked for. */
type FieldCodebookOutcome =
  | Readonly<{ status: 'written' | 'unchanged' }>
  | Readonly<{ status: 'refused'; message: string }>;

type CreatedAttributeOutcome =
  | Readonly<{ status: 'created'; variableId: string }>
  | Readonly<{ status: 'refused'; message: string }>;

/** What the options and settings dialog of a field hands back to be written. */
type FieldOptionsDraft = Readonly<{
  /** The input control that the attribute is collected with. */
  component: string;
  /** The options as the dialog holds them, or undefined where it shows none. */
  options: unknown;
  /** The options as the dialog opened on them. */
  optionsAsOpened: unknown;
  /** The control's settings as the dialog holds them. */
  parameters: unknown;
}>;

export type FieldCodebookWrites = Readonly<{
  /**
   * Collects `variableId` with `component`. Settings of the control that the
   * new control cannot use are dropped with it (see `useSetVariableComponent`).
   */
  setControl: (
    variableId: string,
    component: string,
  ) => Promise<FieldCodebookOutcome>;
  /** Writes the options and the control's settings of `variableId`. */
  setOptionsAndSettings: (
    variableId: string,
    draft: FieldOptionsDraft,
  ) => Promise<FieldCodebookOutcome>;
  /**
   * Adds an attribute that a name and a type finish (a text, a number, a
   * date, a Boolean), collected with the first control that its type offers.
   */
  createAttribute: (
    name: string,
    type: VariableType,
  ) => Promise<CreatedAttributeOutcome>;
}>;

/**
 * The codebook writes of the form editor: the input control, options,
 * settings and validation of a field belong to its attribute, not to the
 * field. Inside a stage editor each write is kept with the stage (see
 * `StagedCodebookStore`): Save stage writes it with the stage, and Cancel
 * throws it away.
 *
 * Extracted from the form field dialog that the form editor replaced, whose
 * row save made the same writes.
 */
export function useFieldCodebookWrites(
  subject: CodebookSubject | undefined,
): FieldCodebookWrites {
  const protocolContext = useProtocolContext();
  const createVariable = useCreateCodebookVariable(subject);
  const setComponent = useSetVariableComponent(subject);
  const setOptions = useSetVariableOptions();

  const heldVariable = useCallback(
    (variableId: string) =>
      subject === undefined
        ? undefined
        : variablesForSubject(protocolContext, subject)[variableId],
    [protocolContext, subject],
  );

  const setControl = useCallback(
    (variableId: string, component: string): Promise<FieldCodebookOutcome> =>
      setComponent(variableId, component),
    [setComponent],
  );

  const setOptionsAndSettings = useCallback(
    async (
      variableId: string,
      draft: FieldOptionsDraft,
    ): Promise<FieldCodebookOutcome> => {
      const held = heldVariable(variableId);
      const shape = parameterShapeFor(held?.type, draft.component);
      const parametersWriting =
        shape === null
          ? undefined
          : parametersForShape(shape, draft.parameters);
      const parametersHeld =
        shape === null || held === undefined
          ? undefined
          : parametersForShape(shape, Reflect.get(held, 'parameters'));
      const control = await setComponent(
        variableId,
        draft.component,
        shape !== null && !isEqual(parametersWriting, parametersHeld)
          ? { parameters: parametersWriting }
          : undefined,
      );
      if (control.status === 'refused') return control;
      if (draft.options === undefined) return control;
      const writing = optionsForShape(
        optionsShapeFor(held?.type, draft.component),
        draft.options,
        draft.optionsAsOpened,
      );
      // A list the researcher left as they found it is not written: a write
      // of the same list is a revision a collaborator has to merge.
      if (isEqual(writing, draft.optionsAsOpened)) return control;
      const written = await setOptions(subject, variableId, writing);
      if (written.status === 'refused') return written;
      return written.status === 'unchanged' ? control : written;
    },
    [heldVariable, setComponent, setOptions, subject],
  );

  const createAttribute = useCallback(
    (name: string, type: VariableType): Promise<CreatedAttributeOutcome> => {
      const component = controlsForType(type)[0]?.value;
      return createVariable({
        name,
        type,
        ...(component === undefined ? {} : { component }),
      });
    },
    [createVariable],
  );

  return { setControl, setOptionsAndSettings, createAttribute };
}
