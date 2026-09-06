import { useMemo } from 'react';

import Section from '@codaco/fresco-ui/Section';

import {
  getSortOrderOptionGetter,
  MISSING_SORT_PROPERTY_MESSAGE,
  orphanedSortProperties,
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
  /**
   * Everything the rules may sort by, unfiltered by writer class.
   *
   * Also what "no longer exists" is judged against, so give it a stable
   * identity — it is a dependency of the option getter and of the rule that
   * can refuse the save.
   *
   * `undefined` says the family does not know yet — a stage that has not been
   * told what it collects, a roster whose data file has not been read — and
   * nothing is judged against it. An EMPTY list is a different answer: a
   * subject with nothing to sort by, where every rule the prompt holds is
   * certainly dangling and has to be shown and refused as such. Written out as
   * `| undefined` rather than optional so a family has to decide which of the
   * two it means.
   */
  properties: readonly SortableProperty[] | undefined;
  disabled?: boolean;
  /**
   * The rules this prompt already has, which decide whether the group starts
   * open and which of them point at an attribute that has been deleted. Read
   * from the row rather than from form state: these rules are rendered inside
   * a per-row dialog with a form store of its own, which has no whole-form
   * initial values to consult for a field that has not mounted.
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
  /**
   * Attributes these rules name that the codebook has lost.
   *
   * Handled here rather than by each family, because a rule outliving its
   * attribute is a property of sort rules and not of any one interface: the
   * schema keeps such a rule on purpose (deleting an attribute must not make
   * a collaborator's stage unopenable), so every family that holds a sort
   * order inherits the same dangling reference and the same two ways out.
   */
  const orphans = useMemo(
    () => orphanedSortProperties(committedRules, properties),
    [committedRules, properties],
  );
  const options = useMemo(
    () => getSortOrderOptionGetter([...(properties ?? []), ...orphans]),
    [orphans, properties],
  );
  /**
   * The rule that can actually refuse the save. A row's own cells only display
   * their errors (see `RowField`), and a rule missing its direction fails the
   * protocol's `SortRuleSchema` against a path rather than against the control
   * the researcher left half-filled.
   *
   * A row naming an orphan is refused by the same rule, because it is the same
   * kind of failure: the id is there, so nothing about the row LOOKS
   * unfinished, and the cell that should display it is blank because no live
   * option carries it. Left to the schema it would save, since
   * `SortRuleSchema.property` is `existence: 'unchecked'`.
   */
  const validation = useMemo(
    () =>
      makeMultiSelectValidation(
        SORT_RULE_PROPERTIES,
        orphans.length === 0
          ? undefined
          : [
              {
                fieldName: 'property',
                values: orphans.map(({ value }) => value),
                message: MISSING_SORT_PROPERTY_MESSAGE,
              },
            ],
      ),
    [orphans],
  );
  // One rule per property at most: every rule after that could only repeat a
  // property the getter has already disabled. An orphan counts, because the
  // rule naming it is one of the rows this limit is counting.
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
        {...validation}
      />
    </Section>
  );
}
