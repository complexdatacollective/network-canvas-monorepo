import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import PageContentSection from '../PageContentSection.tsx';

const openEditor = () => ({
  stageId: 'information-1' as const,
  sections: <PageContentSection />,
});

describe('a page of content rather than a task', () => {
  it('is one rich-text editor holding the whole page, named for the section', async () => {
    const harness = renderStageEditor(openEditor());

    const editor = await screen.findByRole('textbox', {
      name: 'Page content',
    });
    expect(editor).toHaveTextContent('Welcome');
    expect(editor).toHaveTextContent('Welcome to this interview.');
    await waitFor(() => expect(harness.outline()).toHaveLength(1));
    expect(harness.outline()[0]).toEqual({
      title: 'Page content',
      state: 'Finished',
    });
  });

  it('offers the toolbar for text and for putting media into it', async () => {
    renderStageEditor(openEditor());
    await screen.findByRole('textbox', { name: 'Page content' });

    for (const name of [
      'Heading 1',
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
