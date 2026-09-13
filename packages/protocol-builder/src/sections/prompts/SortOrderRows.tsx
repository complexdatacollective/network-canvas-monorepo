import { useMemo } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import Section from '@codaco/fresco-ui/Section';

import {
  getSortOrderOptionGetter,
  type SortableProperty,
  unusableSortProperties,
} from '../../fields/sortOrderOptions.ts';
import {
  type DanglingCells,
  makeMultiSelectValidation,
  type PropertyField,
} from '../../form/arrayFields/MultiSelect.tsx';
import OptionalList from '../../form/arrayFields/OptionalList.tsx';

/**
 * What the two columns of a sort rule are called.
 *
 * Filed under `sortOrder` beside the words the options themselves take. The
 * column heading is REQUIRED by `PropertyField` rather than derived from the
 * field name, so that a researcher never reads a code identifier that has been
 * capitalised into looking like a word no translator was handed.
 */
const columnMessages = defineMessages({
  propertyLabel: {
    id: 'protocolBuilder.sortOrder.propertyLabel',
    defaultMessage: 'Property',
    description:
      'Visible text and accessible name of the column of a sort rule that chooses what the rule sorts by — an attribute of the node, or one of the orders the interview itself can supply.',
  },
  directionLabel: {
    id: 'protocolBuilder.sortOrder.directionLabel',
    defaultMessage: 'Direction',
    description:
      'Visible text and accessible name of the column of a sort rule that chooses whether it sorts ascending or descending.',
  },
});

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
  /** Absent where the list stands on its own words, as a sociogram's does. */
  hint?: string;
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
   * The rules this prompt was OPENED on, which decide whether the group starts
   * open and which values stay unchoosable once a rule has moved off them.
   * Read from the row rather than from form state: these rules are rendered
   * inside a per-row dialog with a form store of its own, which has no
   * whole-form initial values to consult for a field that has not mounted.
   *
   * What the researcher has NOW is read from that dialog's own store instead,
   * because a rule they change is one a collaborator's deletion can land on.
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
   * Values these rules name that they cannot be pointed at — an attribute the
   * codebook has lost, or one it still holds that nothing can be ordered by.
   *
   * Handled here rather than by each family, because a rule outliving what it
   * names is a property of sort rules and not of any one interface: the schema
   * keeps such a rule on purpose (deleting an attribute must not make a
   * collaborator's stage unopenable), so every family that holds a sort order
   * inherits the same dangling reference and the same two ways out.
   */
  const intl = useAppIntl();
  /** A sort rule is one property and one direction, in that order. */
  const sortRuleColumns = useMemo<PropertyField[]>(
    () => [
      {
        fieldName: 'property',
        label: intl.formatMessage(columnMessages.propertyLabel),
      },
      {
        fieldName: 'direction',
        label: intl.formatMessage(columnMessages.directionLabel),
      },
    ],
    [intl],
  );
  /**
   * The rules as the researcher has them NOW.
   *
   * The whole list arrives at `MultiSelect` as one `value`, so the field
   * registered under `name` holds every row and every cell of them; no row is a
   * field of its own. `undefined` while the group is closed, which is a group
   * holding no rules at all.
   */
  const liveRules = useFormStore((state) => state.fields.get(name)?.value);
  /**
   * Judged against both the rules the prompt was OPENED on and the rules on
   * screen, because each answers half of it.
   *
   * The live rules are what the researcher would save, and a rule they have
   * just pointed somewhere is exactly the one a collaborator's deletion can
   * land on: read from the opened-on prompt alone, that reference is reported
   * by nothing, renders blank, and saves itself back. The opened-on rules are
   * what keeps a value unchoosable once the rule has moved off it — the getter
   * only disables the option a rule currently names, so an attribute dropped
   * from the offer would otherwise become selectable again the moment the
   * researcher looked elsewhere.
   */
  const unusable = useMemo(
    () =>
      unusableSortProperties(
        [
          ...(Array.isArray(committedRules) ? committedRules : []),
          ...(Array.isArray(liveRules) ? liveRules : []),
        ],
        properties,
        intl,
      ),
    [committedRules, intl, liveRules, properties],
  );
  const options = useMemo(
    () =>
      getSortOrderOptionGetter(
        [...(properties ?? []), ...unusable.map(({ option }) => option)],
        intl,
      ),
    [intl, properties, unusable],
  );
  /**
   * The rule that can actually refuse the save. A row's own cells only display
   * their errors, and a rule missing its direction fails the
   * protocol's `SortRuleSchema` against a path rather than against the control
   * the researcher left half-filled.
   *
   * A row naming a value it cannot be pointed at is refused by the same rule,
   * because it is the same kind of failure: the id is there, so nothing about
   * the row LOOKS unfinished, and the cell that should display it is blank
   * because no offered option carries it. Left to the schema it would save,
   * since `SortRuleSchema.property` is `existence: 'unchecked'`.
   *
   * One entry per SENTENCE rather than one for all of them: a deleted
   * attribute and an attribute nothing can be ordered by are refused in
   * different words, and `completeRows` answers with the message of the first
   * entry a row matches.
   */
  const dangling = useMemo<DanglingCells[]>(() => {
    const byMessage = new Map<string, string[]>();
    for (const { option, message } of unusable) {
      const values = byMessage.get(message) ?? [];
      values.push(option.value);
      byMessage.set(message, values);
    }
    return [...byMessage].map(([message, values]) => ({
      fieldName: 'property',
      values,
      message,
    }));
  }, [unusable]);
  const validation = useMemo(
    () =>
      makeMultiSelectValidation(
        sortRuleColumns,
        dangling.length === 0 ? undefined : dangling,
      ),
    [dangling, sortRuleColumns],
  );
  /**
   * How many rules this prompt can hold.
   *
   * One per property a rule may be pointed AT, and a permanently disabled
   * option is not one of those. Point a dangling rule somewhere else and its
   * old property stays on offer disabled forever — that is the whole point of
   * it — so the option list is one longer than the capacity. Counted as
   * capacity, the add action survives every selectable property being used,
   * and the row it then adds has no enabled choice in its property column: a
   * required cell the researcher cannot fill, holding the dialog shut until
   * they delete the row they were just offered.
   *
   * The rows still NAMING an unusable property are added back on top, because
   * each of them is a row this limit counts and none of them is spending a
   * selectable option — a prompt opened on one dangling rule can hold it and
   * every property besides.
   *
   * Counted from the rules on screen, which is where a repoint shows up, and
   * from the rules the prompt was opened on for the render before the field
   * has registered — the same two sources `unusable` reads, each answering the
   * half it can.
   */
  const rows = Array.isArray(liveRules)
    ? liveRules
    : Array.isArray(committedRules)
      ? committedRules
      : [];
  const unusableValues = useMemo(
    () => new Set(unusable.map(({ option }) => option.value)),
    [unusable],
  );
  const namesUnusableProperty = (rule: unknown): boolean => {
    if (typeof rule !== 'object' || rule === null) return false;
    const property = Reflect.get(rule, 'property');
    return typeof property === 'string' && unusableValues.has(property);
  };
  const maxItems =
    options('property', undefined, []).filter(
      (option) => option.disabled !== true,
    ).length + rows.filter(namesUnusableProperty).length;
  const configured = Array.isArray(committedRules) && committedRules.length > 0;

  return (
    <Section
      title={title}
      description={description}
      toggleable
      disabled={disabled}
      defaultOpen={configured}
    >
      {/*
        `OptionalList` rather than `MultiSelect`: deleting the last rule is the
        same decision as closing the group — this prompt sorts by nothing in
        particular — and both refusals a dangling rule can carry offer it as one
        of their two ways out, so both routes have to leave the prompt in the
        state the schema recognises.
      */}
      <Field<typeof OptionalList>
        name={name}
        label={label}
        hint={hint}
        component={OptionalList}
        addButtonLabel={addButtonLabel}
        emptyStateMessage={emptyStateMessage}
        properties={sortRuleColumns}
        options={options}
        maxItems={maxItems}
        {...validation}
      />
    </Section>
  );
}
