import { useCallback, useState } from 'react';

import {
  DEFAULT_PANEL_NOMINATION_PROBABILITY,
  panelSchema,
  PanelSyntheticSchema,
} from '@codaco/protocol-validation';
import {
  useSetStageValue,
  useStageFormValue,
} from '~/components/StageEditor/stageFormHooks';
import { describeFieldWindow } from '~/components/Synthetic/schemaIntrospection';
import { formatProbability } from '~/components/Synthetic/summaries';
import type { NumericWindow } from '~/components/Synthetic/useNumericDraft';

/**
 * A panel's one generation parameter — how readily the participant takes back
 * the people it puts in front of them — and everything both of its homes need
 * to render it.
 *
 * There are two homes on purpose (spec revision 2, item 5). The panel's own
 * editor is where it belongs structurally; the stage's "Synthetic data"
 * section is where a researcher looking for generation parameters actually
 * goes, and a parameter they can only find by opening a different section is a
 * parameter they never find. Both render the same hook over the same field, so
 * the two surfaces cannot come to disagree about the panel's odds.
 *
 * The block is written whole through the panel's own `panels[N].synthetic`
 * field, which `NodePanels` registers and rewrites on every add, delete and
 * reorder. Registering a leaf of it in either home would put a second writer
 * on the same slot, and the next gesture would drop whichever of them the list
 * did not read.
 */

export const PANEL_NOMINATION_LABEL = 'Nomination probability';
export const PANEL_NOMINATION_HINT =
  'How likely a participant is to re-nominate each person this panel shows them, when a synthetic interview is generated.';

/** The collapsed row's one line, and the same sentence read out anywhere else. */
export const summarisePanelNomination = (probability: number): string =>
  `${PANEL_NOMINATION_LABEL}: ${formatProbability(probability)}`;

/**
 * The window the odds may take, read off the very field they are written to —
 * so the control and the schema cannot come to disagree about what a
 * probability is. Every value inside it is still offered to
 * `PanelSyntheticSchema` before it is written.
 */
export const PANEL_NOMINATION_WINDOW: NumericWindow = describeFieldWindow(
  PanelSyntheticSchema,
  ['nominationProbability'],
) ?? { exclusiveMin: false, exclusiveMax: false, integer: false };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Whether this panel is one the schema lets carry nomination odds at all.
 *
 * ASKED of `panelSchema` rather than restated as "its data source is the
 * interview network". The schema refuses odds on a roster panel — whose
 * contribution is drawn once for the whole stage rather than person by
 * person — and that refusal is the whole rule; a second spelling of it in the
 * editor is a second rule, free to drift.
 *
 * A panel under edit is routinely invalid elsewhere (no title yet), so only a
 * refusal pathed AT `synthetic` counts: everything else says nothing about
 * whether odds are admissible here.
 */
export const panelAcceptsNominationOdds = (panel: unknown): boolean => {
  const result = panelSchema.safeParse({
    ...(isRecord(panel) ? panel : {}),
    synthetic: {
      nominationProbability: DEFAULT_PANEL_NOMINATION_PROBABILITY,
    },
  });
  if (result.success) return true;
  return !result.error.issues.some((issue) => issue.path[0] === 'synthetic');
};

export type PanelNominationOdds = {
  /** What a run would use: the authored value, or the schema's own default. */
  probability: number;
  /** Whether the panel carries a `synthetic` key at all (spec rule 4). */
  authored: boolean;
  /** The schema's refusals for the last rejected entry, in its own words. */
  refusals: string[];
  commit: (probability: number | undefined) => void;
  reset: () => void;
};

/**
 * Reads and writes one panel's nomination odds off the stage form.
 *
 * `fieldName` is the panel's stage-form path, e.g. `panels[0]`.
 */
export const usePanelNominationOdds = (
  fieldName: string,
): PanelNominationOdds => {
  const setStageValue = useSetStageValue();
  const authoredBlock = useStageFormValue(`${fieldName}.synthetic`);
  const [refusals, setRefusals] = useState<string[]>([]);

  const authored = isRecord(authoredBlock)
    ? Object.keys(authoredBlock).length > 0
    : false;

  // The schema's own resolution of the panel's descriptor: its prefault is
  // what puts the default probability there, so every surface shows what
  // generation would read rather than a number restated here.
  const resolved = PanelSyntheticSchema.safeParse(
    isRecord(authoredBlock) ? authoredBlock : {},
  );
  const probability = resolved.success
    ? resolved.data.nominationProbability
    : DEFAULT_PANEL_NOMINATION_PROBABILITY;

  const commit = useCallback(
    (nominationProbability: number | undefined) => {
      // The field is not `clearable`: the panel's block is either written
      // whole or removed by the reset, so there is no unstated probability
      // for a cleared box to mean.
      if (nominationProbability === undefined) return;
      const candidate = { nominationProbability };
      const parsed = PanelSyntheticSchema.safeParse(candidate);
      if (!parsed.success) {
        setRefusals(parsed.error.issues.map((issue) => issue.message));
        return;
      }
      setRefusals([]);
      setStageValue(`${fieldName}.synthetic`, candidate);
    },
    [fieldName, setStageValue],
  );

  const reset = useCallback(() => {
    setRefusals([]);
    setStageValue(`${fieldName}.synthetic`, undefined);
  }, [fieldName, setStageValue]);

  return { probability, authored, refusals, commit, reset };
};
