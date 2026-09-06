import type { OptionGetter } from '../form/arrayFields/MultiSelect.tsx';

/**
 * One property or attribute a sort rule may order by — what a caller passes
 * to `getSortOrderOptionGetter`, whether it comes from this subject's codebook
 * attributes (via `variablesForSubject`, converted to options) or from
 * external-data column headers a roster stage reads instead.
 *
 * `type` is optional because external-data columns carry none; when it is
 * present and is `'layout'` (a codebook attribute holding a node's on-canvas
 * position, not a value a sort can compare) the option is excluded.
 *
 * `disabled` marks a property that has to be SHOWN without being selectable —
 * an attribute a rule still names after it has been deleted from the codebook
 * (see `orphanedSortProperties`). It is a property of the property, not of the
 * rules using it: the getter disables an option a rule already names, but that
 * disabling ends the moment the rule points somewhere else, and an orphan must
 * never become choosable again.
 */
export type SortableProperty = Readonly<{
  value: string;
  label: string;
  type?: string;
  disabled?: boolean;
}>;

const NON_SORTABLE_TYPES = ['layout'];

/**
 * The fixed "preserve the source order" choice every sort rule offers
 * alongside the subject's own properties — the order nodes were placed in a
 * bin/bucket, or the order they appear in the roster's data file.
 */
const ORIGINAL_ORDER_VALUE = '*';

const ORIGINAL_ORDER_OPTION: SortableProperty = {
  value: ORIGINAL_ORDER_VALUE,
  label: ORIGINAL_ORDER_VALUE,
};

const DIRECTION_OPTIONS: SortableProperty[] = [
  { value: 'desc', label: 'Descending' },
  { value: 'asc', label: 'Ascending' },
];

// `allValues` is the array field's own value, so it is undefined until the
// field holds rows, and a partially-filled row has no `property` yet.
const hasSortProperty = (row: unknown): row is { property: string } =>
  typeof row === 'object' &&
  row !== null &&
  'property' in row &&
  typeof row.property === 'string';

/**
 * What reaches the rendered option: `value`, `label`, and — only when the
 * property carries it — `disabled`.
 *
 * A caller's `type` never does; it is how this module decides what to offer,
 * not something the control shows. `disabled` is omitted rather than written
 * as `false` so an ordinary property renders the same object it always did.
 * There is no `hint` alongside it: these render as native `<option>`s, which
 * carry text and nothing else, so a property that cannot be chosen has to say
 * why in its own label (`missingSortPropertyLabel`).
 */
const toOption = ({
  value,
  label,
  disabled,
}: SortableProperty): SortableProperty =>
  disabled === true ? { value, label, disabled: true } : { value, label };

/**
 * How a sort rule names an attribute that is no longer in the codebook, worded
 * the way the attribute pickers word it.
 */
export const missingSortPropertyLabel = (property: string): string =>
  `${property} — this attribute is no longer in the codebook`;

/**
 * What a researcher is told about a rule left pointing at a deleted attribute.
 *
 * The rule is not half-filled — it holds an id, and the id is exactly the
 * problem — so the generic "every row needs a value in each column" would be
 * both wrong and unhelpful. This one names the situation and both ways out.
 */
export const MISSING_SORT_PROPERTY_MESSAGE =
  'This rule points at an attribute no longer in the codebook. Choose another or delete the rule.';

const ruleProperty = (rule: unknown): string | undefined => {
  if (typeof rule !== 'object' || rule === null) return undefined;
  const property = Reflect.get(rule, 'property');
  return typeof property === 'string' && property !== '' ? property : undefined;
};

/**
 * Sort keys these rules name that the property list no longer describes.
 *
 * `SortRuleSchema.property` is `existence: 'unchecked'`, so a rule whose
 * attribute a collaborator deleted still validates and still saves — which is
 * right, because deleting an attribute must not make somebody else's stage
 * unopenable. But a cell renders from the option list, so an id no option
 * carries leaves the control BLANK while the value behind it is untouched: the
 * researcher sees an empty required cell, cannot find out what it points at,
 * and saves the dangling reference straight back.
 *
 * So the id is offered back as its own option, labelled for what it is and
 * permanently `disabled` — readable as the current choice, never choosable
 * afresh, and never choosable again once the rule has been pointed elsewhere.
 *
 * An EMPTY `sortableProperties` is read as "the caller does not know yet"
 * rather than as a subject with nothing to sort by, and reports nothing. That
 * is the state every caller passes through: a prompt whose stage has not been
 * told what it collects has no codebook to be missing from, and judging its
 * rules there would report every one of them as dangling.
 */
export const orphanedSortProperties = (
  rules: unknown,
  sortableProperties: readonly SortableProperty[],
): SortableProperty[] => {
  if (!Array.isArray(rules) || sortableProperties.length === 0) return [];
  const known = new Set(sortableProperties.map(({ value }) => value));
  const orphans = new Map<string, SortableProperty>();
  for (const rule of rules) {
    const property = ruleProperty(rule);
    if (
      property === undefined ||
      property === ORIGINAL_ORDER_VALUE ||
      known.has(property)
    ) {
      continue;
    }
    orphans.set(property, {
      value: property,
      label: missingSortPropertyLabel(property),
      disabled: true,
    });
  }
  return [...orphans.values()];
};

/**
 * Builds the `OptionGetter` a sort-rule `MultiSelect` needs for its
 * `property` and `direction` columns — the bin/bucket sort order editors and
 * a roster stage's external-data sort options all build on this one helper.
 *
 * Ported from Architect's two near-duplicate implementations
 * (`getSortOrderOptionGetter` for bin/bucket prompts, and
 * `SortOptionsForExternalData/getSortOrderOptionGetter` for roster sort),
 * which had drifted apart; this keeps the more hardened of the two —
 * filtering by `type` rather than `value`, and tolerating an `allValues` that
 * is not yet an array of rows.
 */
export const getSortOrderOptionGetter =
  (sortableProperties: readonly SortableProperty[]): OptionGetter =>
  (fieldName, _rowValues, allValues) => {
    switch (fieldName) {
      case 'property': {
        const used = Array.isArray(allValues)
          ? allValues.filter(hasSortProperty).map((row) => row.property)
          : [];

        return [ORIGINAL_ORDER_OPTION, ...sortableProperties]
          .filter((option) => !NON_SORTABLE_TYPES.includes(option.type ?? ''))
          .map((option) =>
            used.includes(option.value)
              ? { ...toOption(option), disabled: true }
              : toOption(option),
          );
      }
      case 'direction':
        return DIRECTION_OPTIONS;
      default:
        return [];
    }
  };
