import { useCallback, useMemo } from 'react';

import ArrayField, {
  type ArrayFieldProps,
} from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';

import Attribute, {
  AssignAttributesContext,
  type AttributeValue,
  type VariableOption,
} from './Attribute';

export type { AttributeValue, VariableOption } from './Attribute';

const ALLOWED_TYPES = ['boolean'];

/**
 * Narrows the shared pool to variables this control can stamp, and disables
 * the ones another row in the same list already claims.
 */
export const getAssignableVariableOptions = (
  variableOptions: VariableOption[],
  usedVariables: Array<string | null | undefined>,
) =>
  variableOptions
    .filter(
      ({ type: optionType }) =>
        optionType && ALLOWED_TYPES.includes(optionType),
    )
    .map(({ value, ...rest }) => ({
      ...rest,
      value,
      disabled: usedVariables.includes(value),
    }));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Array-level completeness rule. It belongs to the caller's
 * `ArchitectArrayField` (`validation={assignAttributesValidation}`), where the
 * shared adapter routes it through fresco-ui's `custom` entry with the whole
 * array as the value.
 *
 * The rows run `required` on both cells too, but a row is not a registered
 * field (see `RowField`) and can only DISPLAY its error — nothing carries it
 * into the form's validity. Without this counterpart the prompt dialog saved a
 * half-finished stamp such as `[{}]` or `[{ variable: 'x' }]`, which the
 * protocol schema rejects (`prompts.ts` requires both keys), so the stage
 * failed validation long after the researcher had moved on.
 *
 * Two things this rule must NOT do:
 * - reject an empty array. `additionalAttributes` is optional and the
 *   overwhelming majority of prompts assign nothing, so `[]` is the norm —
 *   `every` on an empty array is true, which is exactly right here.
 * - read `value` for truthiness. `false` is a legitimate stamp, so the test is
 *   on the TYPE.
 */
export const completeAttributes = (value: unknown) =>
  Array.isArray(value) &&
  !value.every(
    (row) =>
      isRecord(row) &&
      typeof row.variable === 'string' &&
      row.variable !== '' &&
      typeof row.value === 'boolean',
  )
    ? 'Every additional variable needs both a variable and a value.'
    : undefined;

/**
 * Every array-level rule this editor needs, as one object for the owning
 * `ArchitectArrayField`'s `validation` prop — the `Options.tsx`
 * `optionsValidation` idiom, so a call site cannot keep some and drop others.
 */
export const assignAttributesValidation = { completeAttributes };

const EMPTY_ATTRIBUTES: AttributeValue[] = [];

export type AssignAttributesProps = Omit<
  ArrayFieldProps<AttributeValue>,
  | 'addButtonLabel'
  | 'confirmDelete'
  | 'editorComponent'
  | 'emptyStateMessage'
  | 'immediateAdd'
  | 'itemClasses'
  | 'itemComponent'
  | 'itemTemplate'
  | 'onOperation'
> & {
  entity: 'node' | 'edge' | 'ego';
  type: string;
  /**
   * The codebook pool for this subject, already filtered for uses this control
   * must not offer (see the caller's `getAdditionalAttributesOptionsForSubject`
   * and the draft-writer exclusions). Rows this list already uses are disabled
   * here, from the live value.
   */
  variableOptions: VariableOption[];
  draftValidatedVariables: ReadonlySet<string>;
  currentStageIndex?: number;
  /** Committed value of this array, for the cross-class gate's escape. */
  committedValue?: AttributeValue[];
};

/**
 * The fresco-ui-native successor to
 * `~/components/AssignAttributes/AssignAttributes.tsx`: rows of
 * variable-picker plus boolean value, added straight into the list.
 *
 * Rendered as `<ArchitectArrayField component={AssignAttributes} … />`, so the
 * whole list is ONE field value and no row registers `additionalAttributes[0]
 * .variable` in the form store — a deleted stamp must not be able to reappear
 * through a dormant value.
 */
const AssignAttributes = ({
  value = EMPTY_ATTRIBUTES,
  onChange,
  name = '',
  entity,
  type,
  variableOptions,
  draftValidatedVariables,
  currentStageIndex,
  committedValue = EMPTY_ATTRIBUTES,
  'aria-invalid': ariaInvalid,
  ...arrayFieldProps
}: AssignAttributesProps) => {
  const context = useMemo(
    () => ({
      arrayName: name,
      entity,
      type,
      variableOptions: getAssignableVariableOptions(
        variableOptions,
        value.map(({ variable }) => variable),
      ),
      draftValidatedVariables,
      currentStageIndex,
      committedValue,
      // Rows are always open here — there is no "finish editing" step to
      // reveal their errors — so the refused save has to do it. `aria-invalid`
      // is true exactly while the array field is showing `completeAttributes`'
      // message, which would otherwise name a problem with no way to see which
      // row holds it. Before that it is false, so a freshly added row stays
      // clean rather than greeting the researcher with "Required".
      forceShowErrors: ariaInvalid === true,
    }),
    [
      ariaInvalid,
      committedValue,
      currentStageIndex,
      draftValidatedVariables,
      entity,
      name,
      type,
      value,
      variableOptions,
    ],
  );

  const itemTemplate = useCallback(
    () => ({}) satisfies Partial<AttributeValue>,
    [],
  );

  return (
    <AssignAttributesContext.Provider value={context}>
      <ArrayField<AttributeValue>
        {...arrayFieldProps}
        aria-invalid={ariaInvalid}
        name={name}
        value={value}
        onChange={onChange}
        itemComponent={Attribute}
        itemTemplate={itemTemplate}
        // The row renders its own Surface, so ArrayField's wrapper stays bare
        // rather than nesting two levels of padded, shadowed surface.
        itemClasses="p-0! shadow-none bg-transparent"
        addButtonLabel="Add new variable to assign"
        emptyStateMessage="No additional variables assigned."
        immediateAdd
        confirmDelete={false}
      />
    </AssignAttributesContext.Provider>
  );
};

export default AssignAttributes;
