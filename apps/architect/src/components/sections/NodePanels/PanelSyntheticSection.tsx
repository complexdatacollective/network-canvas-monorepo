import { useCallback, useState } from 'react';

import {
  DEFAULT_PANEL_NOMINATION_PROBABILITY,
  PanelSyntheticSchema,
} from '@codaco/protocol-validation';
import {
  useSetStageValue,
  useStageFormValue,
} from '~/components/StageEditor/stageFormHooks';
import { describeFieldWindow } from '~/components/Synthetic/schemaIntrospection';
import { formatProbability } from '~/components/Synthetic/summaries';
import { SyntheticNumberField } from '~/components/Synthetic/SyntheticNumberField';
import { SyntheticSection } from '~/components/Synthetic/SyntheticSection';
import type { NumericWindow } from '~/components/Synthetic/useNumericDraft';

/**
 * A panel's generation parameter: how readily the participant takes back the
 * people it puts in front of them (spec, "Surfaces §3").
 *
 * The same collapsed treatment every synthetic surface gets — resolved value
 * in the summary, authored/default badge, reset that removes the key — over
 * the one field `PanelSyntheticSchema` defines.
 *
 * Only an existing-network panel gets one: the schema refuses nomination odds
 * on a roster panel, whose contribution is drawn once for the whole stage
 * rather than person by person, so the control is not rendered there at all.
 *
 * The block is written whole through the panel's own `panels[N].synthetic`
 * field, which `NodePanels` registers and rewrites on every add, delete and
 * reorder. Registering a leaf of it here would put a second writer on the same
 * slot, and the next gesture would drop whichever of them the list did not
 * read.
 */

const SECTION_TITLE = 'Synthetic data';
const PROBABILITY_LABEL = 'Nomination probability';
const PROBABILITY_HINT =
  'How likely a participant is to re-nominate each person this panel shows them, when a synthetic interview is generated.';
const summaryFor = (probability: number): string =>
  `Nomination probability: ${formatProbability(probability)}`;

/**
 * The window the odds may take, read off the very field they are written to —
 * so the control and the schema cannot come to disagree about what a
 * probability is. Every value inside it is still offered to
 * `PanelSyntheticSchema` before it is written.
 */
const PROBABILITY_WINDOW: NumericWindow = describeFieldWindow(
  PanelSyntheticSchema,
  ['nominationProbability'],
) ?? { exclusiveMin: false, exclusiveMax: false, integer: false };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type PanelSyntheticSectionProps = {
  /** The panel's stage-form path, e.g. `panels[0]`. */
  fieldName: string;
};

export function PanelSyntheticSection({
  fieldName,
}: PanelSyntheticSectionProps) {
  const setStageValue = useSetStageValue();
  const authoredBlock = useStageFormValue(`${fieldName}.synthetic`);
  const [refusals, setRefusals] = useState<string[]>([]);

  const authored = isRecord(authoredBlock)
    ? Object.keys(authoredBlock).length > 0
    : false;

  // The schema's own resolution of the panel's descriptor: its prefault is
  // what puts the default probability there, so the summary shows what
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

  const handleReset = useCallback(() => {
    setRefusals([]);
    setStageValue(`${fieldName}.synthetic`, undefined);
  }, [fieldName, setStageValue]);

  return (
    <SyntheticSection
      title={SECTION_TITLE}
      summary={summaryFor(probability)}
      authored={authored}
      onReset={handleReset}
    >
      <SyntheticNumberField
        name={`${fieldName}.synthetic.nominationProbability`}
        label={PROBABILITY_LABEL}
        hint={PROBABILITY_HINT}
        value={probability}
        window={PROBABILITY_WINDOW}
        errors={refusals}
        onCommit={commit}
      />
    </SyntheticSection>
  );
}
