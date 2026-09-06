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
 * something proves the line appears otherwise — which is what
 * `expectStatesItsPosition` below is for.
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

/**
 * What an editor owes a stage the interview already holds: its place in it.
 *
 * The other half of the absence above, and asked of each editor separately
 * because each composes the shared heading itself — an editor that left the
 * heading out would still dispatch to the right component, still open on the
 * right sections, and simply stop telling the researcher which stage they are
 * looking at.
 *
 * The number is derived from the fixture's own stage order rather than written
 * down here, so an editor that stopped reading the protocol and printed
 * something fixed could not pass.
 */
export function expectStatesItsPosition(stageId: string): void {
  const order = fixtureStageIds();
  const index = order.indexOf(stageId);
  if (index === -1) {
    throw new Error(
      `The all-interfaces protocol has no "${stageId}" stage, so there is no position to read for it.`,
    );
  }
  expect(
    screen.getByText(`Stage ${index + 1} of ${order.length}`),
  ).toBeInTheDocument();
}
