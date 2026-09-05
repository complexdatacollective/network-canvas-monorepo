import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import PageContentSection from '../PageContentSection.tsx';
import StageNameSection from '../StageNameSection.tsx';
import { TestItemEditor, TestItemPreview } from './rowFixtures.tsx';

const pageContent = (
  <>
    <StageNameSection />
    <PageContentSection
      ItemEditor={TestItemEditor}
      ItemPreview={TestItemPreview}
    />
  </>
);

const openEditor = () => ({ stageId: 'information-1', sections: pageContent });

describe('a page of content rather than a task', () => {
  it('owns the page heading and the blocks under it', async () => {
    const harness = renderStageEditor(openEditor());

    expect(screen.getByRole('textbox', { name: 'Page heading' })).toHaveValue(
      'Welcome',
    );
    expect(screen.getByText('Welcome to this interview.')).toBeInTheDocument();
    await waitFor(() => expect(harness.outline()).toHaveLength(2));
    expect(harness.outline()[1]).toEqual({
      title: 'Page content',
      state: 'Finished',
    });
  });

  it('saves the stage it opened, unchanged', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.roundTrip();
  });

  it('adds a block with an identity of its own', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new content block' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Block text' }),
      'And then this.',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByText('And then this.');

    const request = await harness.submit();
    const items = request?.stageDocument.items;
    expect(Array.isArray(items) ? items : []).toEqual([
      {
        id: 'info-item-1',
        type: 'text',
        content: 'Welcome to this interview.',
      },
      {
        id: expect.any(String) as unknown as string,
        content: 'And then this.',
        type: 'text',
      },
    ]);
  });

  it('refuses to save a page with nothing on it', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Remove block' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Remove block' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByText('Welcome to this interview.'),
      ).not.toBeInTheDocument(),
    );

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(/Add at least one block/),
    ).toBeInTheDocument();
  });

  it('refuses to save a page with no heading', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.clear(
      screen.getByRole('textbox', { name: 'Page heading' }),
    );

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText('This field is required.'),
    ).toBeInTheDocument();
  });
});
