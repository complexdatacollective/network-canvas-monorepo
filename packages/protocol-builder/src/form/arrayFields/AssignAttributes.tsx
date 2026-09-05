import { type ComponentType, useCallback, useMemo } from 'react';

import ArrayField, {
  type ArrayFieldProps,
} from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';

import type { CodebookSubject } from '../../protocol-context.ts';
import Attribute, {
  assignAttributeCrossClassIssue,
  AssignAttributesContext,
  type AssignAttributesCrossClassContext,
  type AttributeValue,
  type CreateAttributeVariable,
  type VariableOption,
} from './Attribute.tsx';
import { useArrayFieldCommands } from './useArrayFieldCommands.ts';

// Re-exported so a call site configuring this editor needs only this module:
// the committed-pick set feeds the row context AND the array-level rule below,
// and the two must be the same set (see `makeAssignAttributesValidation`).
export { committedAttributeVariableIds } from './Attribute.tsx';
export type {
  AttributeValue,
  CreateAttributeVariable,
  VariableOption,
} from './Attribute.tsx';

const ALLOWED_TYPES = ['boolean'];

/**
 * Narrows the shared pool to variables this control can stamp, and disables
 * the ones another row in the same list already claims.
 */
const getAssignableVariableOptions = (
  variableOptions: VariableOption[],
  usedVariables: Array<string | undefined>,
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
 * Array-level completeness rule. It reaches the caller's `ProtocolArrayField`
 * through `makeAssignAttributesValidation`, which hands it the whole array.
 *
 * The rows run `required` on both cells too, but a row is not a registered
 * field (see `RowField`) and can only DISPLAY its error — nothing carries it
 * into the form's validity. Without this counterpart the prompt dialog saves a
 * half-finished stamp such as `[{}]` or `[{ variable: 'x' }]`, which the
 * protocol schema rejects, so the stage fails validation long after the
 * researcher has moved on.
 *
 * Two things this rule must NOT do:
 * - reject an empty array. `additionalAttributes` is optional and the
 *   overwhelming majority of prompts assign nothing, so `[]` is the norm —
 *   `every` on an empty array is true, which is exactly right here.
 * - read `value` for truthiness. `false` is a legitimate stamp, so the test is
 *   on the TYPE.
 */
const completeAttributes = (value: unknown) =>
  Array.isArray(value) &&
  !value.every(
    (row) =>
      isRecord(row) &&
      typeof row.variable === 'string' &&
      row.variable !== '' &&
      typeof row.value === 'boolean',
  )
    ? 'Every additional attribute needs both an attribute and a value.'
    : undefined;

/**
 * Array-level cross-class rule: the BLOCKING counterpart to the row's
 * displayed error.
 *
 * `RowField` errors are display-only, so without this the researcher reads an
 * explicit "collected by a form elsewhere … cannot be written by this stage"
 * error, clicks Save, and the contradiction is written into the protocol
 * anyway — the interview then stamps unvalidated booleans onto a
 * form-validated variable. Nothing downstream catches it: role conflicts are
 * schema-legal and reported only as advice.
 *
 * It runs the row's own `assignAttributeCrossClassIssue`, so the blocking
 * message and the displayed message — and, critically, the committed-pick
 * escape — cannot drift apart.
 */
const makeCrossClassPicks =
  (context: AssignAttributesCrossClassContext) =>
  (value: unknown): string | undefined =>
    // The same two prohibitions as `completeAttributes`: never reject a
    // missing or empty array, and never read `value` — only `variable` is this
    // rule's business, so a `false` stamp passes untouched.
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
 * Every array-level rule this editor needs, as one object to SPREAD onto the
 * owning `ProtocolArrayField` — the `Options.tsx` `optionsValidation` idiom,
 * so a call site cannot keep some and drop others.
 *
 * A factory rather than a constant because the cross-class rule has to close
 * over the caller's committed picks, the stage's draft form roles and the
 * saved role map. Memoize the result on those inputs: the object is a field
 * prop, and a fresh identity per render is churn.
 */
export const makeAssignAttributesValidation = (
  context: AssignAttributesCrossClassContext,
) => ({
  custom: messageRuleValidation([
    completeAttributes,
    makeCrossClassPicks(context),
  ]),
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
  /** Whose codebook the pickable attributes come from. */
  subject: CodebookSubject;
  /**
   * The codebook pool for this subject, already filtered for uses this control
   * must not offer. Rows this list already uses are disabled here, from the
   * live value.
   */
  variableOptions: VariableOption[];
  /** The host's variable picker — see `AssignAttributesContextValue`. */
  variablePickerComponent: ComponentType<Record<string, unknown>>;
  /** Omit to offer selection only, with no way to create a new attribute. */
  onCreateVariable?: CreateAttributeVariable;
  draftValidatedVariables: ReadonlySet<string>;
  /**
   * Every variable id this array's committed value holds — the cross-class
   * gate's escape. Build it with `committedAttributeVariableIds` and hand the
   * SAME set to `makeAssignAttributesValidation`, so the row's displayed error
   * and the array field's blocking rule escape identically.
   */
  committedVariableIds?: ReadonlySet<string>;
};

/**
 * Rows of variable-picker plus boolean value, added straight into the list.
 *
 * Rendered as `<ProtocolArrayField component={AssignAttributes} … />`, so the
 * whole list is ONE field value and no row registers
 * `additionalAttributes[0].variable` in the form store — a deleted stamp must
 * not be able to reappear through a dormant value.
 */
export default function AssignAttributes({
  value = EMPTY_ATTRIBUTES,
  onChange,
  name = '',
  subject,
  variableOptions,
  variablePickerComponent,
  onCreateVariable,
  draftValidatedVariables,
  committedVariableIds = NO_COMMITTED_VARIABLES,
  'aria-invalid': ariaInvalid,
  ...arrayFieldProps
}: AssignAttributesProps) {
  /**
   * The rows, for everything here that has to READ them.
   *
   * A default only answers for `undefined`, and this list is a field component
   * like any other: it renders whatever the stage document holds at its key,
   * which an import, a collaborator's write or a mid-cascade reseed can leave
   * as something that is not a list of records at all. Reading a foreign shape
   * throws out of render, and a render that never commits is a render whose
   * corrective effect never runs — so the value stays foreign for good, which
   * is fresco-ui's render-tolerance contract (#1433) and the reason for this.
   *
   * Length and order are preserved rather than filtered, because the row
   * positions here are the same ones a committed operation is resolved
   * against; `ArrayField` applies its own tolerance to what it renders.
   */
  const rows = useMemo(
    () => (Array.isArray(value) ? value : EMPTY_ATTRIBUTES),
    [value],
  );

  const context = useMemo(
    () => ({
      arrayName: name,
      subject,
      variableOptions: getAssignableVariableOptions(
        variableOptions,
        rows.map((row) =>
          isRecord(row) && typeof row.variable === 'string'
            ? row.variable
            : undefined,
        ),
      ),
      variablePickerComponent,
      onCreateVariable,
      draftValidatedVariables,
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
      draftValidatedVariables,
      name,
      onCreateVariable,
      rows,
      subject,
      variableOptions,
      variablePickerComponent,
    ],
  );

  const itemTemplate = useCallback(
    () => ({}) satisfies Partial<AttributeValue>,
    [],
  );
  const { onOperation } = useArrayFieldCommands<AttributeValue>(rows, onChange);

  return (
    <AssignAttributesContext value={context}>
      <ArrayField<AttributeValue>
        {...arrayFieldProps}
        aria-invalid={ariaInvalid}
        name={name}
        value={value}
        onChange={onChange}
        onOperation={onOperation}
        itemComponent={Attribute}
        itemTemplate={itemTemplate}
        // The row renders its own Surface, so ArrayField's wrapper stays bare
        // rather than nesting two levels of padded, shadowed surface.
        itemClasses="p-0! shadow-none bg-transparent"
        addButtonLabel="Add new attribute to assign"
        emptyStateMessage="No additional attributes assigned."
        immediateAdd
        confirmDelete={false}
      />
    </AssignAttributesContext>
  );
}
