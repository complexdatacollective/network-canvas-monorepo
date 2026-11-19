import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { informationStage } from '@codaco/protocol-validation';

import { informationStageEditor } from '../../editors/information/InformationStageEditor.ts';
import { declaredDynamicValueSite } from '../../testing/declaredDynamicValueSite.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';

const INSERT_A_VALUE = { name: /^Inject piped text/ };

const fieldAround = (control: HTMLElement): HTMLElement => {
  const field = control.closest<HTMLElement>('[data-field-name]');
  if (field === null) throw new Error('The control is not inside a field.');
  return field;
};

/**
 * Whether a text field offers to insert a value follows the site its schema
 * declares: a stage's label may not show values, its page heading may.
 */
describe('the insert-a-value control', () => {
  it('is declared by the schema for the heading and not for the label', () => {
    expect(declaredDynamicValueSite(informationStage, ['label'])).toBe(
      undefined,
    );
    expect(declaredDynamicValueSite(informationStage, ['title'])).toBe(
      'stageText',
    );
  });

  it('is absent from a stage label and present on a page heading', async () => {
    renderStageEditor({
      stageId: 'information-1',
      editor: informationStageEditor.Information,
    });

    const label = fieldAround(
      await screen.findByRole('textbox', { name: 'Stage name' }),
    );
    const heading = fieldAround(
      await screen.findByRole('textbox', { name: 'Page heading' }),
    );

    expect(within(label).queryByRole('button', INSERT_A_VALUE)).toBeNull();
    expect(
      within(heading).getByRole('button', INSERT_A_VALUE),
    ).toBeInTheDocument();
  });
});
