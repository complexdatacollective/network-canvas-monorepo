import { optionValueKey, VariableSchema } from '@codaco/protocol-validation';

/**
 * Keeps a variable's synthetic block honest about the option list beside it.
 *
 * Weights and selection counts are stated in terms of the option VALUES a
 * variable offers, and the option list is edited somewhere else entirely —
 * every prompt editor that binds a categorical or ordinal attribute writes it
 * back through the codebook. Renaming a weighted option therefore left a weight
 * naming a value the variable no longer offers, and deleting options left
 * selection counts nothing could fill; `VariableSchema` refuses both, so an
 * edit made in one editor invalidated the whole protocol from another, with no
 * control on screen to put it right.
 *
 * Reconciled rather than refused. A researcher renaming an option is doing
 * something legitimate, and blocking it because of generation metadata would
 * put the metadata above the protocol it describes. What is dropped is only
 * ever the part that has become unsayable — a weight for a value that is gone,
 * a size no option list can fill — and only while the SCHEMA still objects:
 * every step below is offered to `VariableSchema` and kept only if it made the
 * complaint go away.
 *
 * Deliberately narrow. Only the two option-dependent tables are touched;
 * missingness, distributions and generators are left exactly as authored, and
 * a block the schema still refuses for some other reason is left alone for the
 * commit-time validation listener to report, as it already does.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether the schema complains about anything INSIDE the synthetic block. */
const refusesSynthetic = (variable: unknown): boolean => {
  const result = VariableSchema.safeParse(variable);
  if (result.success) return false;
  return result.error.issues.some((issue) => issue.path[0] === 'synthetic');
};

/**
 * How an option value is compared — the schema's own keying, imported rather
 * than restated, since a weight naming `'1'` where the variable offers the
 * integer `1` is exactly what it refuses.
 */
const valueKey = (value: unknown): string =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean'
    ? optionValueKey(value)
    : `${typeof value}:${String(value)}`;

const optionValueKeys = (variable: Record<string, unknown>): Set<string> => {
  const options = Array.isArray(variable.options) ? variable.options : [];
  return new Set(
    options.flatMap((option) =>
      isRecord(option) ? [valueKey(option.value)] : [],
    ),
  );
};

type WeightEntry = { value: unknown; weight: unknown };
type SelectionEntry = { count: unknown; probability: unknown };

const weightEntries = (synthetic: Record<string, unknown>): WeightEntry[] =>
  Array.isArray(synthetic.optionWeights)
    ? synthetic.optionWeights.flatMap((entry) =>
        isRecord(entry) ? [{ value: entry.value, weight: entry.weight }] : [],
      )
    : [];

const selectionEntries = (
  synthetic: Record<string, unknown>,
): SelectionEntry[] => {
  const table = synthetic.selectionCount;
  if (!isRecord(table) || !Array.isArray(table.probabilities)) return [];
  return table.probabilities.flatMap((entry) =>
    isRecord(entry)
      ? [{ count: entry.count, probability: entry.probability }]
      : [],
  );
};

/** The variable with one key of its synthetic block replaced, or removed. */
const withSyntheticKey = (
  variable: Record<string, unknown>,
  synthetic: Record<string, unknown>,
  key: string,
  value: unknown,
): Record<string, unknown> => {
  const { [key]: _removed, ...rest } = synthetic;
  const next = value === undefined ? rest : { ...rest, [key]: value };
  // Authored = key present (spec governing rule 4): a block whose last stated
  // property has just gone is no block, not an empty one — which the schema
  // refuses in its own right.
  if (Object.keys(next).length === 0) {
    const { synthetic: _dropped, ...withoutBlock } = variable;
    return withoutBlock;
  }
  return { ...variable, synthetic: next };
};

/**
 * The same variable, with option metadata the schema can no longer accept
 * reconciled away — or exactly what it was given, where the schema was content
 * with it (which is every edit that does not touch an option list).
 */
export const reconcileVariableSynthetic = (
  variable: Record<string, unknown>,
): Record<string, unknown> => {
  if (!isRecord(variable.synthetic)) return variable;
  if (!refusesSynthetic(variable)) return variable;

  const synthetic = variable.synthetic;
  let candidate: Record<string, unknown> = variable;

  // A weight naming a value the variable no longer offers can never be drawn
  // on, so it goes with the option it belonged to. The rest keep their weights.
  const weights = weightEntries(synthetic);
  if (weights.length > 0) {
    const offered = optionValueKeys(variable);
    const kept = weights.filter((entry) => offered.has(valueKey(entry.value)));
    if (kept.length !== weights.length) {
      candidate = withSyntheticKey(
        candidate,
        synthetic,
        'optionWeights',
        kept.length === 0 ? undefined : kept,
      );
      if (!refusesSynthetic(candidate)) return candidate;
    }
  }

  // A size no option list can fill any more takes its share with it, and the
  // shares that remain are rebalanced so they still describe a distribution —
  // which is the one thing a selection table has to be.
  const current = isRecord(candidate.synthetic) ? candidate.synthetic : {};
  const rows = selectionEntries(current);
  if (rows.length > 0) {
    const reachable = rows.filter(
      (row) =>
        !refusesSynthetic({
          ...candidate,
          synthetic: {
            ...current,
            selectionCount: { probabilities: [{ ...row, probability: 1 }] },
          },
        }),
    );
    const total = reachable.reduce(
      (sum, row) =>
        sum + (typeof row.probability === 'number' ? row.probability : 0),
      0,
    );
    const rebalanced =
      reachable.length === 0
        ? undefined
        : {
            probabilities: reachable.map((row) => ({
              count: row.count,
              probability:
                total > 0 && typeof row.probability === 'number'
                  ? row.probability / total
                  : 1 / reachable.length,
            })),
          };
    if (reachable.length !== rows.length) {
      candidate = withSyntheticKey(
        candidate,
        current,
        'selectionCount',
        rebalanced,
      );
      if (!refusesSynthetic(candidate)) return candidate;
    }
  }

  // Nothing narrower worked: the table as a whole is what the schema will not
  // have, so it returns to the resolved default rather than standing in the way
  // of the option edit that outgrew it.
  for (const key of ['selectionCount', 'optionWeights'] as const) {
    const block = isRecord(candidate.synthetic) ? candidate.synthetic : {};
    if (block[key] === undefined) continue;
    candidate = withSyntheticKey(candidate, block, key, undefined);
    if (!refusesSynthetic(candidate)) return candidate;
  }

  // Still refused, for something no option edit can explain — a distribution
  // outside a bound, a missingness on a required attribute. Left as authored;
  // the commit-time validation listener is what reports those, as it does now.
  return variable;
};
