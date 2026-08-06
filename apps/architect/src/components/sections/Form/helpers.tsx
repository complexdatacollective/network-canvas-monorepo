import { get, omit, reduce } from 'es-toolkit/compat';
import type { ComponentProps } from 'react';

import type NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import type { VariablePropertyKey } from '@codaco/protocol-validation';
import type { DialogArrayItemSelector } from '~/components/Form/arrayFields/DialogArrayField';
import type ValidationSection from '~/components/sections/ValidationSection';
import {
  isBooleanWithOptions,
  isOrdinalOrCategoricalType,
  isVariableTypeWithParameters,
} from '~/config/variables';
import type { RootState } from '~/ducks/modules/root';
import { getVariablesForSubject } from '~/selectors/codebook';

export const CODEBOOK_PROPERTIES = [
  'options',
  'parameters',
  'component',
  'validation',
] as const satisfies readonly VariablePropertyKey[];

export const getCodebookProperties = (
  properties: Record<string, unknown>,
): Record<string, unknown> =>
  reduce(
    CODEBOOK_PROPERTIES,
    (memo, key) => {
      const property = properties[key];
      if (!Object.keys(properties).includes(key)) {
        return memo;
      }
      return {
        ...memo,
        [key]: property,
      };
    },
    {},
  );

/**
 * Blanks the codebook properties the chosen input control cannot carry.
 *
 * The dialog merges its form values over the row it opened on, and that row
 * arrives already merged with the codebook variable (`itemSelector` below).
 * `getFormValues()` reports registered fields only, so an editor section that
 * is no longer rendered — the options list after a boolean switches from
 * BooleanChoice to Toggle, say — contributes nothing and the codebook's stale
 * value survives the merge. Deriving applicability from the control (rather
 * than from which fields happen to be mounted) clears it deterministically;
 * `prune` and `replaceProperties` then drop it from the codebook.
 */
export const clearInapplicableCodebookProperties = (
  values: Record<string, unknown>,
  variableType: string | null | undefined,
  component: string | null | undefined,
): Record<string, unknown> => ({
  ...values,
  ...(isOrdinalOrCategoricalType(variableType) ||
  isBooleanWithOptions(component)
    ? {}
    : { options: undefined }),
  ...(isVariableTypeWithParameters(variableType)
    ? {}
    : { parameters: undefined }),
});

type InputControlOption = {
  label: string;
  value: string | null;
  disabled?: boolean;
};

type SelectOption = ComponentProps<typeof NativeSelectField>['options'][number];

type ValidationMap = ComponentProps<typeof ValidationSection>['initialValue'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The edited row's own properties arrive untyped (they are whatever the
 * protocol holds), so each editor narrows them before handing them to a
 * field's `initialValue`.
 */
export const asValidationMap = (value: unknown): ValidationMap =>
  isRecord(value)
    ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      (value as NonNullable<ValidationMap>)
    : undefined;

/**
 * The input-control list for a native select. Its group headers carry no
 * value; they are disabled, so the empty string the select needs is never
 * selectable.
 */
export const toSelectOptions = (
  options: readonly InputControlOption[],
): SelectOption[] =>
  options.map(({ label, value, disabled }) => ({
    label,
    value: value ?? '',
    disabled,
  }));

export const normalizeField = (field: Record<string, unknown>) =>
  // Keep `id` so DialogArrayField can retain the item's stable identity across
  // edits, reorders, and deletes.
  omit(field, ['_createNewVariable', ...CODEBOOK_PROPERTIES]);

/**
 * Opens the row editor on the field merged with its codebook variable's
 * rendering and rules, which the plain Form keeps on the variable rather than
 * the field. The edited row arrives directly, because the array is one opaque
 * field value.
 */
export const itemSelector =
  (entity: string | null, type: string | null): DialogArrayItemSelector =>
  (state: RootState, { item }) => {
    if (!entity) {
      return null;
    }

    const variable = item.variable as string | undefined;

    const codebookVariables = getVariablesForSubject(state, {
      entity: entity as 'node' | 'edge' | 'ego',
      type: type ?? undefined,
    });
    const codebookVariable = get(
      codebookVariables,
      variable ?? '',
      {},
    ) as Record<string, unknown>;
    const codebookProperties = getCodebookProperties(codebookVariable);

    return {
      ...item,
      ...codebookProperties,
    };
  };
