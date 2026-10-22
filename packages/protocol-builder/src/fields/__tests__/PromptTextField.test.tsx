import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { dyadCensusStageEditor } from '../../editors/dyad-census/DyadCensusStageEditor.ts';
import type { ProtocolLocalization } from '../../localization/localizedText.ts';
import { loadFixtureStage } from '../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';

const ENGLISH_AND_SPANISH: ProtocolLocalization = {
  defaultLocale: 'en-US',
  locales: ['en-US', 'es'],
};

/**
 * Inside a census's own prompt dialog rather than mounted bare: the question
 * may show values the interview fills in, and what it can show is worked out
 * from the stage it belongs to, so the field only exists inside a stage
 * editor.
 */
const openTranslated = () => {
  const { type, fields } = loadFixtureStage('dyad-census-1');
  return renderStageEditor({
    stage: {
      type,
      fields: {
        ...fields,
        prompts: [
          {
            id: 'dyad-census-prompt-1',
            text: { 'en-US': 'Who do you know?', 'es': '¿A quién conoces?' },
            createEdge: 'knows',
          },
        ],
      },
    },
    registry: dyadCensusStageEditor,
    localization: ENGLISH_AND_SPANISH,
  });
};

describe('PromptTextField', () => {
  it('writes the question in the language being edited and leaves the other translations alone', async () => {
    const harness = openTranslated();
    await harness.opened();

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    const dialog = within(await screen.findByRole('dialog'));
    await harness.user.click(
      dialog.getByRole('button', { name: /Editing language/ }),
    );
    await harness.user.click(
      await screen.findByRole('menuitemradio', { name: /^español/ }),
    );

    // A rich-text editor rather than an input: it shows its text.
    const question = dialog.getByRole('textbox', { name: /^Prompt text/ });
    expect(question.textContent).toBe('¿A quién conoces?');
    await harness.user.clear(question);
    await harness.user.type(question, '¿A quién conoces bien?');
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(request?.stageDocument.prompts).toEqual([
      {
        id: 'dyad-census-prompt-1',
        text: { 'en-US': 'Who do you know?', 'es': '¿A quién conoces bien?' },
        createEdge: 'knows',
      },
    ]);
  });
});
