import ArrayField, {
  type ArrayFieldProps,
} from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';

/**
 * An `ArrayField` whose EMPTY state is spelled the way the protocol spells
 * "there is nothing here": the key is not there.
 *
 * For a list of rows a stage may go without, which its schema writes as an
 * optional array that must hold at least one entry when present. Deleting the
 * last row is then a decision the schema has one way of saying, and an empty
 * array is not that way: it would be refused on save, in the schema's words,
 * rather than simply leaving the stage as it was before the first row existed.
 *
 * This is `OptionalList`'s answer for the lists edited in a row dialog; see it
 * for why the decision lives on the field that owns the list rather than in
 * `withoutAbsentValues`, which keeps empty arrays on purpose.
 */
export default function OptionalRowList<T extends Record<string, unknown>>({
  onChange,
  ...props
}: ArrayFieldProps<T>) {
  return (
    <ArrayField<T>
      {...props}
      onChange={(next) => {
        onChange?.(next === undefined || next.length === 0 ? undefined : next);
      }}
    />
  );
}
