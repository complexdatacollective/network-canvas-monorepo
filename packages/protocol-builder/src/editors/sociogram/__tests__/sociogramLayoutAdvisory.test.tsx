import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  fixtureLayoutId,
  fixtureTypeId,
} from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { testId } from '../../../testing/testId.ts';
import { NEW_STAGE_POSITION } from '../../__tests__/creationSignal.ts';
import {
  openPrompt,
  sociogramHolding,
  sociogramSections,
} from '../sections/prompts/__tests__/canvasFixtures.tsx';

const PERSON = fixtureTypeId('node', 'person');
const KNOWS = fixtureTypeId('edge', 'knows');
// The fixture's Sociogram and Network Composer place people in this layout.
const LAYOUT = fixtureLayoutId('layout');
// No stage places anything in this layout.
const UNPLACED = testId('unplaced-layout');

const WARNING_TITLE = 'No stage places some nodes in this layout';

const CONNECT_PROMPT = {
  id: testId('sociogram-prompt-1'),
  task: 'connect',
  text: { 'en-US': 'Link the people who know each other' },
  edges: { create: KNOWS, display: [KNOWS] },
};

const LAYOUT_PROMPT = {
  id: testId('sociogram-prompt-1'),
  task: 'layout',
  text: { 'en-US': 'Place the people you know' },
  edges: { display: [KNOWS] },
};

/** A Sociogram with only connect tasks reads its layout and sets nothing. */
describe('the warning about a Sociogram layout with no positions', () => {
  it('warns when a Sociogram with only connect tasks reads a layout no stage sets for its type', async () => {
    renderStageEditor(
      sociogramHolding(CONNECT_PROMPT, { layout: UNPLACED, behaviours: {} }),
    );

    expect(await screen.findByText(WARNING_TITLE)).toBeInTheDocument();
  });

  it('does not warn once another stage sets it', async () => {
    const harness = renderStageEditor(
      sociogramHolding(CONNECT_PROMPT, { layout: LAYOUT, behaviours: {} }),
    );

    await waitFor(() => expect(harness.outline()).toHaveLength(4));
    expect(
      screen.getByText('Link the people who know each other'),
    ).toBeInTheDocument();
    expect(screen.queryByText(WARNING_TITLE)).not.toBeInTheDocument();
  });

  it('judges a stage that is not saved yet', async () => {
    renderStageEditor({
      create: {
        type: 'Sociogram',
        position: NEW_STAGE_POSITION,
        fields: {
          subject: { entity: 'node', types: [PERSON] },
          background: { concentricCircles: 4 },
          layout: UNPLACED,
          prompts: [CONNECT_PROMPT],
        },
      },
      sections: sociogramSections,
    });

    expect(await screen.findByText(WARNING_TITLE)).toBeInTheDocument();
  });

  it('does not warn about a new stage before it has any prompts', async () => {
    const harness = renderStageEditor({
      create: {
        type: 'Sociogram',
        position: NEW_STAGE_POSITION,
        fields: {
          subject: { entity: 'node', types: [PERSON] },
          background: { concentricCircles: 4 },
          behaviours: {},
          layout: UNPLACED,
          prompts: [],
        },
      },
      sections: sociogramSections,
    });

    await waitFor(() => expect(harness.outline()).toHaveLength(4));
    expect(screen.queryByText(WARNING_TITLE)).not.toBeInTheDocument();
  });

  it('warns as soon as the last layout task is changed to a connect task', async () => {
    const harness = renderStageEditor(
      sociogramHolding(LAYOUT_PROMPT, { layout: UNPLACED, behaviours: {} }),
    );

    await waitFor(() => expect(harness.outline()).toHaveLength(4));
    expect(screen.queryByText(WARNING_TITLE)).not.toBeInTheDocument();

    const prompt = await openPrompt(harness);
    await harness.user.click(
      await prompt.findByRole('option', { name: /Connect nodes/ }),
    );
    await harness.user.click(
      await prompt.findByRole('radio', { name: /knows/ }),
    );
    await harness.user.click(prompt.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(WARNING_TITLE)).toBeInTheDocument();
  });
});
