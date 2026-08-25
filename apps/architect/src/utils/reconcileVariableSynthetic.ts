import { optionValueKey, VariableSchema } from '@codaco/protocol-validation';
import {
  asSyntheticVariableDraft,
  syntheticRefusals,
} from '~/components/Codebook/VariableSynthetic/draft';

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
 * Option lists are not the only sibling a synthetic block depends on. The same
 * field editors write `validation` and a date picker's `parameters`, and both
 * bound the block just as directly: narrowing an attribute to 18–80 strands a
 * synthetic constant of 5, and moving a date picker to whole years strands a
 * bound written as `2020-06-15`. So the repair is ordered by how much authored
 * content it gives up — the option tables first, since they are the ones an
 * option edit can explain, then whatever the schema itself names, and the
 * block as a whole only when nothing inside it could be kept.
 *
 * The result is one guarantee: **an ordinary field edit cannot leave a
 * `synthetic` block the schema refuses.** Whatever survives, generation reads
 * the rest as unstated and resolves it, which is always a valid protocol —
 * where leaving it would invalidate the protocol from an editor that shows no
 * generation control at all.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Whether the schema's complaint about this variable is the BLOCK's.
 *
 * The editors' own question, asked through their own implementation: the
 * variable is parsed with the block and without it, and only what the second
 * parse did not already raise counts. Reading issue paths instead was not
 * enough — a branch of `VariableSchema` that no longer matches at all reports
 * `invalid_union` at the variable's root, naming nothing, so a block missing
 * the parameter its family requires looked to this file like a variable the
 * schema was content with.
 */
const refusesSynthetic = (variable: unknown): boolean => {
  const draft = asSyntheticVariableDraft(variable);
  if (draft === undefined) return false;
  return syntheticRefusals(draft, draft.synthetic).length > 0;
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

/** The variable carrying this block, or carrying none where it is empty. */
const withSyntheticBlock = (
  variable: Record<string, unknown>,
  synthetic: Record<string, unknown>,
): Record<string, unknown> => {
  // Authored = key present (spec governing rule 4): a block whose last stated
  // property has just gone is no block, not an empty one — which the schema
  // refuses in its own right.
  if (Object.keys(synthetic).length === 0) {
    const { synthetic: _dropped, ...withoutBlock } = variable;
    return withoutBlock;
  }
  return { ...variable, synthetic };
};

/** The variable with one key of its synthetic block replaced, or removed. */
const withSyntheticKey = (
  variable: Record<string, unknown>,
  synthetic: Record<string, unknown>,
  key: string,
  value: unknown,
): Record<string, unknown> => {
  const { [key]: _removed, ...rest } = synthetic;
  return withSyntheticBlock(
    variable,
    value === undefined ? rest : { ...rest, [key]: value },
  );
};

/**
 * The synthetic keys the schema is complaining about, read off the issue paths
 * rather than worked out here.
 *
 * Asking the schema which key is at fault is what lets this repair reach rules
 * it knows nothing about: a constant outside a validation window reports
 * `synthetic.value`, a date bound at the wrong resolution reports
 * `synthetic.min`, and a rule added tomorrow will report its own key without
 * this file being edited (spec governing rule 1).
 */
const refusedSyntheticKeys = (variable: unknown): Set<string> => {
  const result = VariableSchema.safeParse(variable);
  const keys = new Set<string>();
  if (result.success) return keys;
  for (const issue of result.error.issues) {
    if (issue.path[0] !== 'synthetic') continue;
    const key = issue.path[1];
    if (typeof key === 'string') keys.add(key);
  }
  return keys;
};

/**
 * The block with everything the schema objects to taken out of it, a round of
 * complaints at a time.
 *
 * The family itself is the last thing to go, and goes as one thing: it is
 * removed only once the schema has stopped naming a removable parameter, and
 * once it is gone every parameter still standing is an unrecognised key to the
 * branch that remains — which the schema then names, so the next round clears
 * them. That is why this terminates on rules nobody wrote it against.
 */
const withoutRefusedKeys = (
  variable: Record<string, unknown>,
): Record<string, unknown> => {
  let current = variable;
  let familyDropped = false;
  // Every round removes at least one key or stops, so the number of keys the
  // block started with (plus the round that gives up the family) bounds it.
  const startingKeys = isRecord(variable.synthetic)
    ? Object.keys(variable.synthetic).length
    : 0;

  for (let round = 0; round <= startingKeys + 1; round += 1) {
    if (!refusesSynthetic(current)) return current;
    const block = isRecord(current.synthetic) ? current.synthetic : {};
    if (Object.keys(block).length === 0) return current;

    // The discriminant is held back from the ordinary sweep: dropping it on
    // the first complaint would take a whole authored distribution away over
    // one parameter the edit had outgrown.
    const named = [...refusedSyntheticKeys(current)].filter(
      (key) => key !== 'distribution' && key in block,
    );

    if (named.length > 0) {
      const remaining = { ...block };
      for (const key of named) delete remaining[key];
      current = withSyntheticBlock(current, remaining);
      continue;
    }
    if (!familyDropped && 'distribution' in block) {
      const { distribution: _gone, ...remaining } = block;
      current = withSyntheticBlock(current, remaining);
      familyDropped = true;
      continue;
    }
    return current;
  }
  return current;
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

  // Still refused, for something no option edit explains — a constant the new
  // validation bounds exclude, a date bound at a resolution the picker has
  // stopped offering, a missingness on an attribute just made required. The
  // schema names the key in each case, so each goes on its own terms.
  candidate = withoutRefusedKeys(candidate);
  if (!refusesSynthetic(candidate)) return candidate;

  // Nothing inside the block could be kept. It goes whole, and generation
  // resolves the variable from the schema's defaults — because the alternative
  // is a protocol that an ordinary field edit has invalidated, reported later
  // by the commit-time listener, from an editor with no control on screen that
  // could put it right.
  const { synthetic: _dropped, ...withoutBlock } = candidate;
  return withoutBlock;
};
