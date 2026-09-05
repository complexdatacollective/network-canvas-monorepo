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
 */
export type SortableProperty = Readonly<{
  value: string;
  label: string;
  type?: string;
}>;

const NON_SORTABLE_TYPES = ['layout'];

/**
 * The fixed "preserve the source order" choice every sort rule offers
 * alongside the subject's own properties — the order nodes were placed in a
 * bin/bucket, or the order they appear in the roster's data file.
 */
const ORIGINAL_ORDER_OPTION: SortableProperty = { value: '*', label: '*' };

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

/** Only `value`/`label` reach the rendered option — never a caller's `type`. */
const toOption = ({ value, label }: SortableProperty): SortableProperty => ({
  value,
  label,
});

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
