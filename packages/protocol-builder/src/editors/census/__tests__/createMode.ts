import { screen, waitFor } from '@testing-library/react';
import { expect } from 'vitest';

import {
  fixtureStageIds,
  loadFixtureStage,
} from '../../../testing/protocolFixture.ts';
import type { StageEditorHarness } from '../../../testing/renderStageEditor.tsx';

/**
 * Where the host is about to insert the stage every create-mode test opens.
 *
 * Deliberately late in the interview, and not where any of this family's own
 * fixture stages sit: sixteen stages come before it, so a destination list that
 * ignored the insertion position would be obviously wrong rather than
 * accidentally right.
 */
export const CREATE_POSITION = fixtureStageIds().indexOf('network-composer-1');

export const stageNameInput = (): HTMLInputElement =>
  screen.getByRole('textbox', { name: 'Stage name' });

/**
 * Switches skip logic on, and proves it went on.
 *
 * The switch's own state is asserted rather than assumed, because everything
 * a caller does next reads the fields that mount WITH it: a click that did not
 * take reports itself as "the destination list is not in the document", which
 * names the wrong thing and sends the reader looking at the destinations. Seen
 * once under a loaded full-suite run, where the switch was still
 * `aria-checked="false"` by the time the destinations were read.
 */
export const switchSkipLogicOn = async (
  harness: StageEditorHarness,
): Promise<void> => {
  const control = screen.getByRole('switch', { name: 'Skip logic' });
  await harness.user.click(control);
  await waitFor(() => expect(control).toBeChecked());
};

export const destinationOptions = (): string[] => {
  const select = screen.getByRole('combobox', {
    name: 'When this stage is skipped',
  });
  return [...select.querySelectorAll('option')].map(
    (option) => option.textContent ?? '',
  );
};

/**
 * Where the interview may continue for a stage inserted at `CREATE_POSITION`,
 * as the researcher will read it.
 *
 * Everything from the insertion point onwards, including the stage this one
 * displaces, numbered as the interview will be once the new stage exists —
 * which is why each offset gains two rather than one.
 */
export const destinationsAfterInsertion = (): string[] => [
  'Next available stage',
  ...fixtureStageIds()
    .slice(CREATE_POSITION)
    .map((stageId, offset) => {
      const label = loadFixtureStage(stageId).fields.label;
      return `Stage ${CREATE_POSITION + offset + 2} — ${
        typeof label === 'string' ? label : ''
      }`;
    }),
  'End the interview',
];
