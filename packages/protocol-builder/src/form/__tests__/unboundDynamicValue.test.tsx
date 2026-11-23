import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { informationStageEditor } from '../../editors/information/InformationStageEditor.ts';
import { fieldAround } from '../../testing/fieldAround.ts';
import { loadFixtureStage } from '../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';

const NOT_A_VALUE =
  /This text refers to a value that does not exist: "ghost"\./;

const openWithUnboundValue = () => {
  const { type, fields } = loadFixtureStage('information-1');
  return renderStageEditor({
    stage: {
      type,
      // `ghost` is shown by the text and bound by no one.
      fields: { ...fields, content: { 'en-US': 'Hello {ghost}' } },
    },
    registry: informationStageEditor,
  });
};

describe('a stage text that shows a value the stage does not bind', () => {
  it('refuses the save and files the fault under the section that holds the text', async () => {
    const harness = openWithUnboundValue();
    await harness.opened();

    expect(await harness.submit()).toBeNull();

    await waitFor(() =>
      expect(
        harness.outline().find((section) => section.title === 'Content')?.state,
      ).toMatch(/^Has a problem\./),
    );
  });

  it('says so beside the field the text is in, and not beside another', async () => {
    const harness = openWithUnboundValue();
    await harness.opened();

    expect(await harness.submit()).toBeNull();

    const content = fieldAround(
      screen.getByRole('textbox', { name: 'Rich Text' }),
    );
    expect(await within(content).findByText(NOT_A_VALUE)).toBeInTheDocument();
    const name = fieldAround(
      screen.getByRole('textbox', { name: 'Stage name' }),
    );
    expect(within(name).queryByText(NOT_A_VALUE)).toBeNull();
  });

  it('moves focus to the field the text is in', async () => {
    const harness = openWithUnboundValue();
    await harness.opened();

    expect(await harness.submit()).toBeNull();

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Rich Text' })).toHaveFocus(),
    );
  });
});
