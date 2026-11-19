import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { informationStageEditor } from '../../editors/information/InformationStageEditor.ts';
import { loadFixtureStage } from '../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';

const NOT_A_VALUE = /"ghost" is not a value this text can show here/;

const openWithUnboundValue = () => {
  const { type, fields } = loadFixtureStage('information-1');
  return renderStageEditor({
    stage: {
      type,
      // `ghost` is shown by the text and bound by no one.
      fields: { ...fields, title: { 'en-US': 'Hello {ghost}' } },
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
        harness.outline().find((section) => section.title === 'Page content')
          ?.state,
      ).toMatch(/^Has a problem\./),
    );
  });

  it('says so beside the field the text is in, and not beside another', async () => {
    const harness = openWithUnboundValue();
    await harness.opened();

    expect(await harness.submit()).toBeNull();

    const heading = screen
      .getByRole('textbox', { name: 'Page heading' })
      .closest<HTMLElement>('[data-field-name]');
    if (heading === null) throw new Error('The heading is not in a field.');
    expect(await within(heading).findByText(NOT_A_VALUE)).toBeInTheDocument();
    const name = screen
      .getByRole('textbox', { name: 'Stage name' })
      .closest<HTMLElement>('[data-field-name]');
    expect(name).not.toBeNull();
    expect(within(name ?? heading).queryByText(NOT_A_VALUE)).toBeNull();
  });
});
