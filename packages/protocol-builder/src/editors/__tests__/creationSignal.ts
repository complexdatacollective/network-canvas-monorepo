import { screen, waitFor } from '@testing-library/react';
import { expect } from 'vitest';

import { fixtureStageIds } from '../../testing/protocolFixture.ts';

/**
 * Where a host is inserting the stage it is creating: after the whole
 * interview.
 *
 * A real position rather than zero, because the session validates a stage
 * being created where it is about to live — a skip destination is judged
 * against the stages that would come after it — so a position no interview
 * would use makes every editor's create test a weaker one.
 */
export const NEW_STAGE_POSITION = fixtureStageIds().length;

const stageNameInput = (): HTMLInputElement =>
  screen.getByRole('textbox', { name: 'Stage name' });

/**
 * What every named editor owes a stage the session is creating.
 *
 * Two consequences of one signal. The host opened the session saying this
 * stage does not exist yet, and the shared sections read that from the
 * editor's own context — so an editor gets both without passing a prop, and a
 * family that forgot to pass one cannot be the reason a researcher sees the
 * wrong thing.
 *
 * - The name is PROPOSED. A stage nobody has named yet would otherwise open on
 *   an empty required field, which reads as an error before the researcher has
 *   done anything.
 * - There is NO position line. A stage the interview does not contain has no
 *   place in it to report, and a guessed one would tell the researcher they
 *   are editing stage 4 of an interview with no fourth stage.
 *
 * The second is asserted as an absence, so it is only worth something while
 * something proves the line appears otherwise: `stageEditorDispatch.test.tsx`
 * opens every one of these interfaces from the fixture protocol and reads it.
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
  expect(screen.queryByText(/^Stage \d+ of \d+$/)).not.toBeInTheDocument();
}
