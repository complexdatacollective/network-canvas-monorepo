import Button from '@codaco/fresco-ui/Button';
import { SyntheticNumberField } from '~/components/Synthetic/SyntheticNumberField';

import {
  PANEL_NOMINATION_HINT,
  PANEL_NOMINATION_WINDOW,
  usePanelNominationOdds,
} from './panelNominationOdds';

/**
 * One panel's nomination odds, shown in the stage's "Synthetic data" section
 * (spec revision 2, item 5).
 *
 * A plain row rather than a second disclosure: the whole reason it is here is
 * that a researcher looking for generation parameters could not find it inside
 * the side-panel editor, and a parameter behind one more click is barely more
 * discoverable than one behind a different section. The panel's own editor
 * keeps its collapsed disclosure; both write the same field through
 * {@link usePanelNominationOdds}.
 *
 * Named by the panel, not by the parameter. Two panels — and the panel editor's
 * own copy of this control — would otherwise be three identically named
 * spinbuttons to anyone listing the page's fields.
 */

const RESET_LABEL = 'Reset to default';

export type PanelNominationOddsRowProps = {
  /** The panel's stage-form path, e.g. `panels[0]`. */
  fieldName: string;
  /** The panel's own title, where the researcher has given it one. */
  title?: string | undefined;
  /** 1-based position, used to name a panel that has no title yet. */
  position: number;
};

/**
 * What this control is called. Two whole sentences rather than one assembled
 * from parts: the titled form reads as the panel's name, the untitled one as a
 * position, and neither is the other with a word swapped.
 */
const labelFor = (title: string | undefined, position: number): string =>
  title === undefined || title.trim() === ''
    ? `Nomination probability for panel ${position}`
    : `Nomination probability for ‘${title}’`;

export function PanelNominationOddsRow({
  fieldName,
  title,
  position,
}: PanelNominationOddsRowProps) {
  const { probability, authored, refusals, commit, reset } =
    usePanelNominationOdds(fieldName);
  const label = labelFor(title, position);

  return (
    <div className="min-w-0">
      <SyntheticNumberField
        // The same field this parameter is written to, because it IS the same
        // field — the panel editor renders another control over it. Anything
        // scoping by name (a test, an e2e locator) has to scope by surface too.
        name={`${fieldName}.synthetic.nominationProbability`}
        label={label}
        hint={PANEL_NOMINATION_HINT}
        value={probability}
        window={PANEL_NOMINATION_WINDOW}
        errors={refusals}
        onCommit={commit}
      />
      {authored && (
        <Button
          variant="text"
          size="sm"
          onClick={reset}
          // Named by the panel too, for the same reason the field is.
          aria-label={`${RESET_LABEL} ${label}`}
        >
          {RESET_LABEL}
        </Button>
      )}
    </div>
  );
}
