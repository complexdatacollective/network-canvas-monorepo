import { useMemo } from 'react';

import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import { useField } from '@codaco/fresco-ui/form/hooks/useField';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { CategoricalBinPromptSyntheticSchema } from '@codaco/protocol-validation';
import { describeFieldWindow } from '~/components/Synthetic/schemaIntrospection';
import { formatProbability } from '~/components/Synthetic/summaries';
import { SyntheticNumberField } from '~/components/Synthetic/SyntheticNumberField';
import type { NumericWindow } from '~/components/Synthetic/useNumericDraft';

/**
 * A categorical bin prompt's one generation parameter: how readily a generated
 * participant reaches past the categories the prompt offers and drops an alter
 * into its "other" bin.
 *
 * Per PROMPT, because a prompt is a question — one stage may bin the same
 * alters by ethnicity and then by how they met, and the residual of one says
 * nothing about the residual of the other. That is the schema's reasoning, and
 * `CategoricalBinPromptSyntheticSchema` is where it lives; everything numeric
 * below is read out of that schema rather than restated (spec governing rule
 * 1).
 *
 * ## Why the block is written whole, and only while it says something
 *
 * The schema attaches the parameter to the branch of `categoricalBinPromptSchema`
 * that HAS an other bin and refuses it on the branch that does not — 'synthetic
 * other-bin odds require otherVariable to be set.' So the row must be able to
 * lose the key entirely, not merely to hold an empty block, and
 * `DialogArrayField`'s `mergeEditedRow` can only DELETE a key whose field
 * registered with a value and then lost it. Hence the two halves here:
 *
 *  - the control itself is unconnected (it is the shared `SyntheticNumberField`
 *    every generation parameter is edited through) and writes the whole block
 *    through the row's `synthetic` field;
 *  - `AuthoredBlockPresence` registers that field, and only while the prompt
 *    actually states odds. Registered, the block travels in the dialog's own
 *    submitted values; unregistered after being cleared, it is parked with the
 *    committed block as its `initialValue`, which is what turns the clear into
 *    a deletion. A prompt nobody has told anything therefore registers nothing
 *    and is saved without a `synthetic` key at all (spec governing rule 4).
 */

/** The row field the whole block is written through. */
export const OTHER_BIN_SYNTHETIC_FIELD = 'synthetic';

/** Names the control for its label, its hint and the Issues panel. */
const OTHER_BIN_ODDS_FIELD = `${OTHER_BIN_SYNTHETIC_FIELD}.otherBinProbability`;

const OTHER_BIN_ODDS_LABEL = 'Chance of the ‘other’ bin';

const FALLBACK_WINDOW: NumericWindow = {
  exclusiveMin: false,
  exclusiveMax: false,
  integer: false,
};

/**
 * The window the odds may take, read off the very field they are written to, so
 * the control and the schema cannot come to disagree about what a probability
 * is.
 */
const OTHER_BIN_ODDS_WINDOW: NumericWindow =
  describeFieldWindow(CategoricalBinPromptSyntheticSchema, [
    'otherBinProbability',
  ]) ?? FALLBACK_WINDOW;

/**
 * What a run reads from a prompt that states nothing — the schema's own
 * resolution of an empty block, so the hint quotes generation rather than a
 * number repeated here.
 */
const resolvedDefault = CategoricalBinPromptSyntheticSchema.safeParse({});
const OTHER_BIN_ODDS_DEFAULT = resolvedDefault.success
  ? resolvedDefault.data.otherBinProbability
  : undefined;

const OTHER_BIN_ODDS_HINT = [
  'How often a generated participant drops an alter into this prompt’s “other” bin instead of one of the categories above.',
  ...(OTHER_BIN_ODDS_DEFAULT === undefined
    ? []
    : [
        `Leave this empty to use the default (${formatProbability(OTHER_BIN_ODDS_DEFAULT)}).`,
      ]),
].join(' ');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The odds a block states, or `undefined` where it states none. */
const oddsIn = (block: unknown): number | undefined => {
  if (!isRecord(block)) return undefined;
  const declared = block.otherBinProbability;
  return typeof declared === 'number' ? declared : undefined;
};

/**
 * Registers the row's `synthetic` field so the odds travel with the save, and
 * so clearing them can be told from never having stated any.
 *
 * Rendered only while the prompt states odds — see the note above. It draws
 * nothing: the control beside it is what a researcher sees and writes through.
 */
const AuthoredBlockPresence = ({
  initialValue,
}: {
  initialValue: FieldValue;
}) => {
  useField({ name: OTHER_BIN_SYNTHETIC_FIELD, initialValue });
  return null;
};

export type OtherBinOddsProps = {
  /**
   * The prompt's committed `synthetic` block, from `DialogArrayField`'s `item`
   * spread — the value a save has to be able to remove.
   */
  committed: unknown;
};

export function OtherBinOdds({ committed }: OtherBinOddsProps) {
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const committedOdds = oddsIn(committed);

  // `initialValue` is a register-effect dependency, so it is rebuilt only when
  // the committed odds themselves change.
  const committedBlock = useMemo(
    () =>
      committedOdds === undefined
        ? undefined
        : { otherBinProbability: committedOdds },
    [committedOdds],
  );

  /**
   * The odds as they stand: registered → dormant → the row's pre-edit block.
   *
   * The store ENTRY decides, never the row: an entry holding `undefined` is a
   * researcher who cleared the box, and falling back to the committed block for
   * that would put the removed odds straight back on screen — and keep the
   * field registered, which is what would stop the save removing them.
   *
   * Resolved all the way to the number rather than to the entry, so this
   * component re-renders when the odds change and not when a `FieldState`'s
   * meta churns around them.
   */
  const odds = useFormStore((state) => {
    const entry =
      state.fields.get(OTHER_BIN_SYNTHETIC_FIELD) ??
      state.dormantValues.get(OTHER_BIN_SYNTHETIC_FIELD);
    return oddsIn(entry ? entry.value : committedBlock);
  });

  return (
    <>
      {odds !== undefined && (
        <AuthoredBlockPresence initialValue={committedBlock} />
      )}
      <SyntheticNumberField
        name={OTHER_BIN_ODDS_FIELD}
        label={OTHER_BIN_ODDS_LABEL}
        hint={OTHER_BIN_ODDS_HINT}
        value={odds}
        window={OTHER_BIN_ODDS_WINDOW}
        // Clearing is how the statement is taken back: the schema's own default
        // is what a run then reads, so the block goes rather than the default
        // being written into the protocol.
        clearable
        onCommit={(next) =>
          setFieldValue(
            OTHER_BIN_SYNTHETIC_FIELD,
            next === undefined ? undefined : { otherBinProbability: next },
          )
        }
      />
    </>
  );
}
