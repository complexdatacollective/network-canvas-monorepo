import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { informationStage } from '@codaco/protocol-validation';

import { informationStageEditor } from '../../editors/information/InformationStageEditor.ts';
import { declaredDynamicValueSite } from '../../testing/declaredDynamicValueSite.ts';
import { fieldAround } from '../../testing/fieldAround.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';

const INSERT_A_VALUE = { name: 'Attribute' };

/**
 * Whether a text field offers to insert a value follows the site its schema
 * declares: a stage's label may not show values, its page content may.
 */
describe('the Attribute menu', () => {
  it('is declared by the schema for the content and not for the label', () => {
    expect(declaredDynamicValueSite(informationStage, ['label'])).toBe(
      undefined,
    );
    expect(declaredDynamicValueSite(informationStage, ['content'])).toBe(
      'stageText',
    );
  });

  it('is absent from a stage label and present on the page content', async () => {
    renderStageEditor({
      stageId: 'information-1',
      editor: informationStageEditor.Information,
    });

    const label = fieldAround(
      await screen.findByRole('textbox', { name: 'Stage name' }),
    );
    const content = fieldAround(
      await screen.findByRole('textbox', { name: 'Rich Text' }),
    );

    expect(within(label).queryByRole('button', INSERT_A_VALUE)).toBeNull();
    expect(
      within(content).getByRole('button', INSERT_A_VALUE),
    ).toBeInTheDocument();
  });
});
