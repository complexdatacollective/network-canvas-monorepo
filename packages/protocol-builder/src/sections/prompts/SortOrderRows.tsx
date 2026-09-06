import Section from '@codaco/fresco-ui/Section';

import {
  getSortOrderOptionGetter,
  type SortableProperty,
} from '../../fields/sortOrderOptions.ts';
import MultiSelect, {
  makeMultiSelectValidation,
  type PropertyField,
} from '../../form/arrayFields/MultiSelect.tsx';
import { DialogFormField } from '../../form/DialogForm.tsx';

/** A sort rule is one property and one direction, in that order. */
const SORT_RULE_PROPERTIES: PropertyField[] = [
  { fieldName: 'property' },
  { fieldName: 'direction' },
];

/**
 * The rule that can actually refuse the save. A row's own cells only display
 * their errors (see `RowField`), and a rule missing its direction fails the
 * protocol's `SortRuleSchema` against a path rather than against the control
 * the researcher left half-filled.
 */
const SORT_RULE_VALIDATION = makeMultiSelectValidation(SORT_RULE_PROPERTIES);

export type SortOrderRowsProps = Readonly<{
  /**
   * The prompt key these rules are held at. A bin or census prompt holds two
   * orders and names each one; a sociogram prompt holds a single `sortOrder`,
   * the order the nodes still to be placed are handed over in.
   */
  name: 'binSortOrder' | 'bucketSortOrder' | 'sortOrder';
  title: string;
  description: string;
  label: string;
  hint: string;
  /** Visible text and accessible name of the add button. */
  addButtonLabel: string;
  emptyStateMessage: string;
  /** Everything the rules may sort by, unfiltered by writer class. */
  properties: readonly SortableProperty[];
  disabled?: boolean;
  /**
   * The rules this prompt already has, which decide whether the group starts
   * open. Read from the row rather than from form state: these rules are
   * rendered inside a per-row dialog with a form store of its own, which has
   * no whole-form initial values to consult for a field that has not mounted.
   */
  committedRules?: unknown;
}>;

/**
 * One ordered set of sort rules inside a prompt.
 *
 * An optional group rather than a plain list: a prompt with no sort rules
 * sorts by nothing in particular, which is a real answer, and closing the
 * group is how the researcher says so — Fresco's `Section` clears the fields
 * inside it, so the key leaves the saved prompt entirely rather than staying
 * behind as an empty list.
 *
 * Ported from Architect's `BinSortOrderSection` and `BucketSortOrderSection`,
 * which differed only in their key and their words.
 */
export default function SortOrderRows({
  name,
  title,
  description,
  label,
  hint,
  addButtonLabel,
  emptyStateMessage,
  properties,
  disabled = false,
  committedRules,
}: SortOrderRowsProps) {
  const options = getSortOrderOptionGetter(properties);
  // One rule per property at most: every rule after that could only repeat a
  // property the getter has already disabled.
  const maxItems = options('property', undefined, []).length;
  const configured = Array.isArray(committedRules) && committedRules.length > 0;

  return (
    <Section
      title={title}
      description={description}
      toggleable
      disabled={disabled}
      defaultOpen={configured}
    >
      <DialogFormField<typeof MultiSelect>
        name={name}
        label={label}
        hint={hint}
        component={MultiSelect}
        addButtonLabel={addButtonLabel}
        emptyStateMessage={emptyStateMessage}
        properties={SORT_RULE_PROPERTIES}
        options={options}
        maxItems={maxItems}
        {...SORT_RULE_VALIDATION}
      />
    </Section>
  );
}
