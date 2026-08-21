import { Trash2 } from 'lucide-react';
import { useMemo } from 'react';

import Button, { IconButton } from '@codaco/fresco-ui/Button';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import {
  CategoricalSyntheticSchema,
  type SyntheticSelectionCount,
} from '@codaco/protocol-validation';
import {
  ARRAY_ELEMENT,
  describeFieldWindow,
} from '~/components/Synthetic/schemaIntrospection';
import {
  type NumericWindow,
  useNumericDraft,
} from '~/components/Synthetic/useNumericDraft';

/**
 * How many options a multi-select categorical is answered with, as a table of
 * counts and how often each occurs.
 *
 * Two things the schema refuses are made unrepresentable here rather than
 * validated afterwards. A count it would not accept is never OFFERED: the
 * choices come from `admissibleSelectionCounts`, which asks the schema itself
 * which sizes this variable can take — so a required variable is never offered
 * zero, and a bin-written one is never offered more than it assigns. And a
 * table whose probabilities do not sum to 1 is never STORED: every edit
 * renormalises the whole table, so the shares are always a distribution.
 */

const FALLBACK_WINDOW: NumericWindow = {
  exclusiveMin: false,
  exclusiveMax: false,
  integer: false,
};

const PROBABILITY_WINDOW: NumericWindow =
  describeFieldWindow(CategoricalSyntheticSchema, [
    'selectionCount',
    'probabilities',
    ARRAY_ELEMENT,
    'probability',
  ]) ?? FALLBACK_WINDOW;

type SelectionRow = { count: number; probability: number };

/**
 * The same rows with their shares expressed as a distribution.
 *
 * Rescaled rather than refused, because a researcher typing one share means to
 * change the balance rather than to invalidate the table. Rows that between
 * them say nothing — every share zero, or a fresh table — share out evenly.
 */
const normaliseSelectionRows = (
  rows: readonly SelectionRow[],
): SelectionRow[] => {
  if (rows.length === 0) return [];
  const total = rows.reduce((sum, row) => sum + row.probability, 0);
  if (total <= 0) {
    const share = 1 / rows.length;
    return rows.map((row) => ({ count: row.count, probability: share }));
  }
  return rows.map((row) => ({
    count: row.count,
    probability: row.probability / total,
  }));
};

const ProbabilityCell = ({
  name,
  label,
  value,
  disabled,
  onCommit,
}: {
  name: string;
  label: string;
  value: number;
  disabled: boolean;
  onCommit: (next: number) => void;
}) => {
  const { text, onChange, onBlur, inputAttributes } = useNumericDraft({
    value,
    window: PROBABILITY_WINDOW,
    onCommit: (next) => {
      if (next === undefined) return;
      onCommit(next);
    },
  });

  return (
    <InputField
      {...inputAttributes}
      aria-label={label}
      className="w-28"
      name={name}
      value={text}
      onChange={onChange}
      onBlur={onBlur}
      disabled={disabled}
    />
  );
};

export type SelectionCountTableProps = {
  namePrefix: string;
  label: string;
  /** The sizes the schema accepts for this variable, ascending. */
  allowedCounts: readonly number[];
  /** The authored table, or `undefined` while nothing is authored. */
  table: SyntheticSelectionCount | undefined;
  /** What generation resolves without a table — the rows shown until one is. */
  resolved: SyntheticSelectionCount;
  onChange: (next: SyntheticSelectionCount | undefined) => void;
  disabled?: boolean;
};

export function SelectionCountTable({
  namePrefix,
  label,
  allowedCounts,
  table,
  resolved,
  onChange,
  disabled = false,
}: SelectionCountTableProps) {
  const rows = useMemo<SelectionRow[]>(
    () => [...(table?.probabilities ?? resolved.probabilities)],
    [table, resolved],
  );

  const commit = (next: SelectionRow[]) => {
    if (next.length === 0) {
      onChange(undefined);
      return;
    }
    onChange({ probabilities: normaliseSelectionRows(next) });
  };

  const unusedCounts = allowedCounts.filter(
    (count) => !rows.some((row) => row.count === count),
  );

  return (
    <div className="mb-7">
      <p className="mb-1 font-semibold">{label}</p>
      <p className="text-text/70 text-sm">
        Shares are balanced against each other, so they always add up to the
        whole.
      </p>
      <ul className="mt-3 flex list-none flex-col gap-3 p-0">
        {rows.map((row, index) => (
          <li key={row.count} className="flex flex-wrap items-end gap-3">
            <NativeSelectField
              name={`${namePrefix}.${index}.count`}
              aria-label={`Number of selections, row ${index + 1}`}
              className="w-32"
              value={row.count}
              disabled={disabled}
              options={[
                { value: row.count, label: String(row.count) },
                ...unusedCounts.map((count) => ({
                  value: count,
                  label: String(count),
                })),
              ].toSorted((a, b) => a.value - b.value)}
              onChange={(next) => {
                const count = Number(next);
                if (!Number.isInteger(count)) return;
                commit(
                  rows.map((candidate, at) =>
                    at === index ? { ...candidate, count } : candidate,
                  ),
                );
              }}
            />
            <ProbabilityCell
              name={`${namePrefix}.${index}.probability`}
              label={`Share for ${row.count} selections`}
              value={row.probability}
              disabled={disabled}
              onCommit={(probability) =>
                commit(
                  rows.map((candidate, at) =>
                    at === index ? { ...candidate, probability } : candidate,
                  ),
                )
              }
            />
            <IconButton
              icon={<Trash2 />}
              color="destructive"
              variant="text"
              aria-label={`Remove the row for ${row.count} selections`}
              disabled={disabled || rows.length === 1}
              onClick={() => commit(rows.filter((_, at) => at !== index))}
            />
          </li>
        ))}
      </ul>
      {unusedCounts.length > 0 && (
        <Button
          size="sm"
          variant="text"
          disabled={disabled}
          onClick={() => {
            const [next] = unusedCounts;
            if (next === undefined) return;
            commit([
              ...rows,
              { count: next, probability: 1 / (rows.length + 1) },
            ]);
          }}
        >
          Add a number of selections
        </Button>
      )}
    </div>
  );
}
