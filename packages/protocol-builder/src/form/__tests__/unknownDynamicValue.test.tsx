import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { informationStageEditor } from '../../editors/information/InformationStageEditor.ts';
import { fieldAround } from '../../testing/fieldAround.ts';
import { loadFixtureStage } from '../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';

const NOT_A_VALUE = /cannot use "ghost": it does not refer to an attribute/;

const openWithUnknownValue = () => {
  const { type, fields } = loadFixtureStage('information-1');
  return renderStageEditor({
    stage: {
      type,
      // `ghost` names no attribute, label, condition or date.
      fields: { ...fields, content: { 'en-US': 'Hello {ghost}' } },
    },
    registry: informationStageEditor,
  });
};

describe('a stage text that names a value that does not exist', () => {
  it('refuses the save and files the fault under the section that holds the text', async () => {
    const harness = openWithUnknownValue();
    await harness.opened();

    expect(await harness.submit()).toBeNull();

    await waitFor(() =>
      expect(
        harness.outline().find((section) => section.title === 'Content')?.state,
      ).toMatch(/^Has a problem\./),
    );
  });

  it('says so beside the field the text is in, and not beside another', async () => {
    const harness = openWithUnknownValue();
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
    const harness = openWithUnknownValue();
    await harness.opened();

    expect(await harness.submit()).toBeNull();

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Rich Text' })).toHaveFocus(),
    );
  });
});
