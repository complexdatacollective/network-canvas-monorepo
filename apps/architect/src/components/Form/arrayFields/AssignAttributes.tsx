import { useCallback, useMemo } from 'react';

import ArrayField, {
  type ArrayFieldProps,
} from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';

import Attribute, {
  assignAttributeCrossClassIssue,
  AssignAttributesContext,
  type AssignAttributesCrossClassContext,
  type AttributeValue,
  type VariableOption,
} from './Attribute';

// Re-exported so a call site configuring this editor needs only this module:
// the committed-pick set feeds the row context AND the array-level rule below,
// and the two must be the same set (see `makeAssignAttributesValidation`).
export { committedAttributeVariableIds } from './Attribute';
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
 * Array-level completeness rule. It reaches the caller's
 * `ArchitectArrayField` through `makeAssignAttributesValidation`, where the
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
 * Array-level cross-class rule: the BLOCKING counterpart to the row's
 * displayed `crossClassPick` error.
 *
 * `RowField` errors are display-only, so without this the researcher read an
 * explicit "collected by a form elsewhere … cannot be written by this stage"
 * error, clicked Save, and the contradiction was written into the protocol
 * anyway — the interview then stamps unvalidated booleans onto a
 * form-validated variable, with only a dismissable timeline warning left to
 * say so. Nothing downstream catches it: role conflicts are schema-legal and
 * `findVariableRoleConflicts` is advisory.
 *
 * It runs the row's own `assignAttributeCrossClassIssue`, so the blocking
 * message and the displayed message — and, critically, the committed-pick
 * escape — cannot drift apart.
 */
const makeCrossClassPicks =
  (context: AssignAttributesCrossClassContext) =>
  (value: unknown): string | undefined =>
    // The same two prohibitions as `completeAttributes`: never reject a
    // missing or empty array (`additionalAttributes` is optional and most
    // prompts assign nothing), and never read `value` — only `variable` is
    // this rule's business, so a `false` stamp passes untouched.
    Array.isArray(value)
      ? value
          .map((row) =>
            isRecord(row) && typeof row.variable === 'string'
              ? assignAttributeCrossClassIssue(row.variable, context)
              : undefined,
          )
          .find((issue): issue is string => issue !== undefined)
      : undefined;

/**
 * Every array-level rule this editor needs, as one object for the owning
 * `ArchitectArrayField`'s `validation` prop — the `Options.tsx`
 * `optionsValidation` idiom, so a call site cannot keep some and drop others.
 *
 * A factory rather than a constant because the cross-class rule has to close
 * over the caller's committed picks, the stage's draft form roles and the
 * saved role map. Memoize the result on those inputs (see `PromptFields`):
 * the object is a field prop, and a fresh identity per render is the churn
 * `EMPTY_ATTRIBUTES` exists to avoid.
 */
export const makeAssignAttributesValidation = (
  context: AssignAttributesCrossClassContext,
) => ({
  completeAttributes,
  crossClassPicks: makeCrossClassPicks(context),
});

const EMPTY_ATTRIBUTES: AttributeValue[] = [];
const NO_COMMITTED_VARIABLES: ReadonlySet<string> = new Set();

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
  /**
   * Every variable id this array's committed value holds — the cross-class
   * gate's escape. Build it with `committedAttributeVariableIds` and hand the
   * SAME set to `makeAssignAttributesValidation`, so the row's displayed error
   * and the array field's blocking rule escape identically.
   */
  committedVariableIds?: ReadonlySet<string>;
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
  committedVariableIds = NO_COMMITTED_VARIABLES,
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
      committedVariableIds,
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
      committedVariableIds,
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
