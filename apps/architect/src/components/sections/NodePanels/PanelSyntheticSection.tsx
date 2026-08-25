import { SyntheticNumberField } from '~/components/Synthetic/SyntheticNumberField';
import { SyntheticSection } from '~/components/Synthetic/SyntheticSection';

import {
  PANEL_NOMINATION_HINT,
  PANEL_NOMINATION_LABEL,
  PANEL_NOMINATION_WINDOW,
  summarisePanelNomination,
  usePanelNominationOdds,
} from './panelNominationOdds';

/**
 * A panel's generation parameter, in the panel's own editor: how readily the
 * participant takes back the people it puts in front of them (spec,
 * "Surfaces §3").
 *
 * The same collapsed treatment every synthetic surface gets — resolved value
 * in the summary, reset that removes the key — over the one field
 * `PanelSyntheticSchema` defines. The stage's "Synthetic data" section shows
 * the very same parameter as a plain row (spec revision 2, item 5); both read
 * and write it through {@link usePanelNominationOdds}, so the two surfaces are
 * one control in two places rather than two controls over one field.
 *
 * Only a panel the schema admits odds ON gets one — a roster panel's
 * contribution is drawn once for the whole stage rather than person by
 * person — which is `panelAcceptsNominationOdds`' question, asked by the
 * caller that decides whether to render this at all.
 */

const SECTION_TITLE = 'Synthetic data';

export type PanelSyntheticSectionProps = {
  /** The panel's stage-form path, e.g. `panels[0]`. */
  fieldName: string;
};

export function PanelSyntheticSection({
  fieldName,
}: PanelSyntheticSectionProps) {
  const { probability, authored, refusals, commit, reset } =
    usePanelNominationOdds(fieldName);

  return (
    <SyntheticSection
      title={SECTION_TITLE}
      summary={summarisePanelNomination(probability)}
      authored={authored}
      onReset={reset}
    >
      <SyntheticNumberField
        name={`${fieldName}.synthetic.nominationProbability`}
        label={PANEL_NOMINATION_LABEL}
        hint={PANEL_NOMINATION_HINT}
        value={probability}
        window={PANEL_NOMINATION_WINDOW}
        errors={refusals}
        onCommit={commit}
      />
    </SyntheticSection>
  );
}
