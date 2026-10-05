import { screen, waitFor } from '@testing-library/react';
import { expect } from 'vitest';

import { fixtureStageIds } from '../../testing/protocolFixture.ts';

/**
 * Where a host is inserting the stage it is creating: after the whole
 * interview.
 *
 * A real position rather than zero, because the editor validates a stage
 * being created where it is about to live — a skip destination is judged
 * against the stages that would come after it — so a position no interview
 * would use makes every editor's create test a weaker one.
 */
export const NEW_STAGE_POSITION = fixtureStageIds().length;

const stageNameInput = (): HTMLInputElement =>
  screen.getByRole('textbox', { name: 'Stage name' });

/**
 * What every named editor owes a stage that is being created.
 *
 * Two consequences of one signal. The host opened the edit saying this
 * stage does not exist yet, and the shared sections read that from the
 * editor's own context — so an editor gets both without passing a prop, and a
 * family that forgot to pass one cannot be the reason a researcher sees the
 * wrong thing.
 *
 * The name is PROPOSED: a stage nobody has named yet would otherwise open on
 * an empty required field, which reads as an error before the researcher has
 * done anything. The proposal is the interface's own name, refined by what the
 * stage collects, so an editor that stopped reading the draft could not pass.
 *
 * Where the stage SITS in the interview is no longer asked here. A stage the
 * interview does not contain has no place in it to report — but nothing in
 * this package draws a position line at all now: the stage's title is the
 * host's, and Architect's own `StageTitle` is where the line, and its absence
 * for a stage being created, are asked about.
 */
export async function expectOpenedAsANewStage(
  interfaceName: string,
): Promise<void> {
  await waitFor(() => {
    expect(stageNameInput()).not.toHaveValue('');
  });
  expect(
    stageNameInput().value,
    `a new ${interfaceName} stage opened on a name that does not describe it`,
  ).toMatch(new RegExp(`^${interfaceName}`));
}
