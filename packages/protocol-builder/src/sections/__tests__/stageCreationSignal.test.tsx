import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { fixtureStageIds } from '../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import SkipLogicSection from '../SkipLogicSection.tsx';
import StageNameSection from '../StageNameSection.tsx';

const destinations = () =>
  within(screen.getByRole('combobox', { name: /When this stage is skipped/ }))
    .getAllByRole('option')
    .map((option) => option.textContent);

/**
 * What a section derives from the fact that a stage is being CREATED.
 *
 * A create session carries the position the host will insert the stage at, and
 * that position is the whole of what the sections can read: the interview's own
 * stage order does not contain the stage yet. So the ends of the order are
 * where the derivation is most easily wrong — a stage created first comes
 * before every existing stage, one created last comes after all of them — and
 * the proposed name has to survive a researcher clearing the one they typed.
 */
describe('the creation signal a new stage carries', () => {
  it('offers every stage as a destination for a stage created first', async () => {
    renderStageEditor({
      create: {
        type: 'Information',
        position: 0,
        fields: {
          label: 'New page',
          title: 'New page',
          items: [],
          skipLogic: { action: 'SKIP', filter: { rules: [] } },
        },
      },
      sections: <SkipLogicSection />,
    });

    await screen.findByRole('combobox', { name: /When this stage is skipped/ });
    // Every fixture stage is later than one inserted at position 0, and each
    // is numbered as it will be once this stage exists.
    expect(destinations()).toHaveLength(fixtureStageIds().length + 2);
    expect(destinations()[1]).toMatch(/^Stage 2 — /);
  });

  it('offers no stage as a destination for a stage created last', async () => {
    renderStageEditor({
      create: {
        type: 'Information',
        position: fixtureStageIds().length,
        fields: {
          label: 'New page',
          title: 'New page',
          items: [],
          skipLogic: { action: 'SKIP', filter: { rules: [] } },
        },
      },
      sections: <SkipLogicSection />,
    });

    await screen.findByRole('combobox', { name: /When this stage is skipped/ });
    expect(destinations()).toEqual([
      'Next available stage',
      'End the interview',
    ]);
  });

  it('proposes a name again when the researcher clears the one they typed', async () => {
    const harness = renderStageEditor({
      create: {
        type: 'Information',
        position: 0,
        fields: { title: 'New page', items: [] },
      },
      sections: <StageNameSection />,
    });

    const name = await screen.findByRole('textbox', { name: 'Stage name' });
    const proposed = (name as HTMLInputElement).value;
    expect(proposed).not.toBe('');

    await harness.user.clear(name);
    await harness.user.type(name, 'My own name');
    await harness.user.clear(name);
    await harness.user.tab();

    // Back to the proposal, and still not a name the interview already uses.
    expect((name as HTMLInputElement).value).toBe(proposed);
    expect(
      harness.session
        .getSnapshot()
        .protocolContext.orderedStages.map((stage) => stage.label),
    ).not.toContain(proposed);
  });
});
