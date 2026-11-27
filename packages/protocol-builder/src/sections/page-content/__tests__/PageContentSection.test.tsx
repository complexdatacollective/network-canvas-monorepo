import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { dynamicValueNameFor } from '@codaco/protocol-validation';

import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { testId, testVariableId } from '../../../testing/testId.ts';
import PageContentSection from '../PageContentSection.tsx';

const SHORT = testId('condition/returning');
const RETURNING = testVariableId('returning');

const openEditor = () => ({
  stageId: 'information-1' as const,
  sections: <PageContentSection />,
});

describe('a page of content rather than a task', () => {
  it('is one rich-text editor holding the whole page, labelled Rich Text in a section named Content', async () => {
    const harness = renderStageEditor(openEditor());

    const editor = await screen.findByRole('textbox', {
      name: 'Rich Text',
    });
    expect(editor).toHaveTextContent('Welcome');
    expect(editor).toHaveTextContent('Welcome to this interview.');
    await waitFor(() => expect(harness.outline()).toHaveLength(1));
    expect(harness.outline()[0]).toEqual({
      title: 'Content',
      state: 'Finished',
    });
  });

  it('offers the toolbar for text and for putting attributes, logic blocks and media into it', async () => {
    renderStageEditor(openEditor());
    await screen.findByRole('textbox', { name: 'Rich Text' });

    for (const name of [
      /^Text style:/,
      'Attribute',
      'Logic block',
      'Insert image',
      'Insert audio',
      'Insert video',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('saves the stage it opened, unchanged', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.roundTrip();
  });

  it('shows a logic block of the page as its branches, and saves it unchanged', async () => {
    const returning = dynamicValueNameFor({
      kind: 'condition',
      conditionId: SHORT,
    });
    const harness = renderStageEditor({
      stage: {
        type: 'Information',
        fields: {
          label: { 'en-US': 'Welcome' },
          content: {
            'en-US': `# Welcome\n\n{${returning}, select, true {Thanks for coming back.} other {Welcome to this interview.}}`,
          },
          conditions: {
            [SHORT]: {
              rules: [
                {
                  id: testId('rule/returning'),
                  type: 'ego',
                  options: { attribute: RETURNING, operator: 'EXISTS' },
                },
              ],
            },
          },
        },
      },
      sections: <PageContentSection />,
    });

    const editor = await screen.findByRole('textbox', { name: 'Rich Text' });
    await waitFor(() =>
      expect(editor.querySelectorAll('[data-logic-branch-view]')).toHaveLength(
        2,
      ),
    );
    expect(editor).toHaveTextContent('Thanks for coming back.');
    expect(editor).toHaveTextContent('Otherwise');
    await harness.roundTrip();
  });

  it('is refused while the page is empty', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'Information',
        fields: { label: { 'en-US': 'Empty' }, content: { 'en-US': '' } },
      },
      sections: <PageContentSection />,
    });

    expect(await harness.submit()).toBeNull();
  });
});
