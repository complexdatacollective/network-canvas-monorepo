import type { ComponentProps } from 'react';

import { createAppIntl, type IntlShape } from '@codaco/app-i18n/messages';
import type NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import type ValidationSection from '~/components/sections/ValidationSection';
import { type InputControlGroup } from '~/config/variables';

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

const defaultIntl = createAppIntl({ locale: 'en' });

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
  intl: IntlShape = defaultIntl,
): SelectOptionOrGroup[] => {
  const byLabel = (a: { label: string }, b: { label: string }) =>
    a.label.localeCompare(b.label, intl.locale);
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
