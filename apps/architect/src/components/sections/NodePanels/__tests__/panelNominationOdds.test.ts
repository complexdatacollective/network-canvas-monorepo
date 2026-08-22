import { describe, expect, it } from 'vitest';

import { panelAcceptsNominationOdds } from '../panelNominationOdds';

/**
 * Which panels may carry nomination odds — asked of `panelSchema` rather than
 * restated as "its data source is the interview network".
 *
 * Two surfaces render the control (the panel's own editor and the stage's
 * Synthetic data section), so a second spelling of the rule would be a second
 * rule, free to drift from the schema's refusal.
 */

const EXISTING_PANEL = {
  id: 'panel-1',
  title: 'People you named',
  dataSource: 'existing',
};

describe('panelAcceptsNominationOdds', () => {
  it('accepts a panel drawn from the interview network', () => {
    expect(panelAcceptsNominationOdds(EXISTING_PANEL)).toBe(true);
  });

  it('refuses a panel drawn from a roster asset', () => {
    // A roster panel's contribution is drawn once for the whole stage, so
    // per-candidate odds could never be consulted — and the schema says so.
    expect(
      panelAcceptsNominationOdds({
        ...EXISTING_PANEL,
        dataSource: 'roster-asset',
      }),
    ).toBe(false);
  });

  it('is unmoved by a panel that is invalid for other reasons', () => {
    // A panel under edit routinely has no title yet. Only a refusal pathed at
    // `synthetic` says anything about the odds; treating any refusal as one
    // would hide the control until the rest of the panel was finished.
    const { title: _untitled, ...noTitle } = EXISTING_PANEL;
    expect(panelAcceptsNominationOdds(noTitle)).toBe(true);
  });

  it('reports on the odds alone, so a half-registered panel is not hidden', () => {
    // Every panel the editor creates carries a data source (`createNodePanel`
    // seeds it, `usePanelAt` normalises it), so a panel without one is the
    // window before its field has registered rather than a state a researcher
    // can reach. Staying visible there is what the panel editor did before
    // this helper existed, and the next render corrects it either way.
    expect(panelAcceptsNominationOdds({ id: 'panel-1' })).toBe(true);
  });
});
