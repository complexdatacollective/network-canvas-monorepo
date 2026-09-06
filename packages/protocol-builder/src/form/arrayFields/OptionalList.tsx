import MultiSelect, { type MultiSelectProps } from './MultiSelect.tsx';

/**
 * A `MultiSelect` whose EMPTY state is spelled the way the protocol spells
 * "there is nothing here": the key is not there.
 *
 * For every list a researcher is allowed to empty. Deleting the last row is a
 * decision — this roster keeps the data file's own order, these cards show
 * nothing but a name, this prompt sorts by nothing in particular — and the
 * schema has one way of saying it. An empty array is not that way: it
 * round-trips as a configured-but-empty list, so the section reopens standing
 * over a list with no rows in it, and an export reader is left to guess what a
 * list of nothing was supposed to mean. `MISSING_COLUMN_MESSAGE` and
 * `MISSING_SORT_PROPERTY_MESSAGE` both offer deleting the row as one of the two
 * ways out of a dangling reference, so that route has to end somewhere the
 * schema recognises.
 *
 * Held here rather than in `MultiSelect`, which is the general always-editing
 * list and has no opinion about what an empty one means — a list of a prompt's
 * options is emptied on the way to being refilled, not to say anything — and
 * rather than in `withoutAbsentValues`, which keeps empty arrays on purpose:
 * only the field that owns a list can tell "emptied on purpose" from "never
 * used". This is that field.
 *
 * `undefined` is what every reader downstream already treats as "the stage
 * holds nothing here": `withoutValueAt` prunes the container the key leaves
 * empty, `stageDraftFromSubmission` removes rather than writes it, and
 * `useStageHasAnyValue` reads it as an unconfigured capability. What it is NOT
 * is a switch-off — see `BuilderSection`, which keeps the researcher's switch
 * where they left it while they are still editing.
 */
export default function OptionalList({ onChange, ...props }: MultiSelectProps) {
  return (
    <MultiSelect
      {...props}
      onChange={(next) => {
        onChange?.(next === undefined || next.length === 0 ? undefined : next);
      }}
    />
  );
}
