import { get, omit, reduce } from 'es-toolkit/compat';
import type { ComponentProps } from 'react';

import type NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import type { VariablePropertyKey } from '@codaco/protocol-validation';
import type { DialogArrayItemSelector } from '~/components/Form/arrayFields/DialogArrayField';
import type ValidationSection from '~/components/sections/ValidationSection';
import type { InputControlGroup } from '~/config/variables';
import {
  isBooleanWithOptions,
  isOrdinalOrCategoricalType,
  isVariableTypeWithParameters,
} from '~/config/variables';
import type { RootState } from '~/ducks/modules/root';
import { getVariablesForSubject } from '~/selectors/codebook';

// Deliberately NOT including `synthetic`: this list doubles as the
// `replaceProperties` set handed to `getStateWithUpdatedVariable`, which
// preserves every property NOT named here — and that merge is the only thing
// carrying a variable's authored generation parameters through a field edit.
// Naming it here would delete them on the first edit to any other property.
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
  value: string;
  disabled?: boolean;
};

type SelectOptionOrGroup = ComponentProps<
  typeof NativeSelectField
>['options'][number];
type SelectGroup = Extract<SelectOptionOrGroup, { options: unknown }>;
type SelectOption = Exclude<SelectOptionOrGroup, SelectGroup>;

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

const byLabel = (a: { label: string }, b: { label: string }) =>
  a.label.localeCompare(b.label);

const toSelectOption = ({
  label,
  value,
  disabled,
}: InputControlOption): SelectOption => ({ label, value, disabled });

/** Either shape the input-control list arrives in — see `toSelectOptions`. */
export type InputControlList = readonly (
  | InputControlOption
  | InputControlGroup
)[];

const isControlGroup = (
  entry: InputControlOption | InputControlGroup,
): entry is InputControlGroup => 'options' in entry;

/**
 * The input-control list for a native select.
 *
 * Takes the grouped list (offered while the variable's type is still open, so
 * the researcher can see which type each control implies) or a flat one
 * already narrowed to a single type, and answers in the shape the select
 * renders: `<optgroup>`s, plain options, or a mix. Decided per ENTRY rather
 * than from the first one, so a list that ever became mixed degrades into the
 * right markup instead of reading `undefined.map`.
 *
 * `sorted` alphabetises WITHIN each group rather than across the whole list —
 * flattening the groups to sort them would put the controls of different types
 * back in one undifferentiated run, which is the problem the groups solve.
 */
export const toSelectOptions = (
  options: InputControlList,
  { sorted = false }: { sorted?: boolean } = {},
): SelectOptionOrGroup[] => {
  const mapped = options.map((entry) => {
    if (!isControlGroup(entry)) return toSelectOption(entry);
    const grouped = entry.options.map(toSelectOption);
    return {
      label: entry.label,
      options: sorted ? grouped.toSorted(byLabel) : grouped,
    };
  });

  // Only a flat list is sorted as a whole; group ORDER is authored (simplest
  // type first), and sorting groups by their heading would scramble it.
  return sorted && mapped.every((entry) => !('options' in entry))
    ? mapped.toSorted(byLabel)
    : mapped;
};

export const normalizeField = (field: Record<string, unknown>) => {
  // Keep `id` so DialogArrayField can retain the item's stable identity across
  // edits, reorders, and deletes.
  const normalized = omit(field, [
    '_createNewVariable',
    ...CODEBOOK_PROPERTIES,
  ]);

  // The toggle always registers, so an untouched field would persist an
  // explicit `false` the protocol never carried. Off is the absent state.
  if (normalized.showValidationHints !== true) {
    delete normalized.showValidationHints;
  }

  return normalized;
};

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
