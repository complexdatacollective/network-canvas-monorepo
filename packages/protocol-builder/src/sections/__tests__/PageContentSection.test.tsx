import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import PageContentSection from '../PageContentSection.tsx';
import StageNameSection from '../StageNameSection.tsx';
import {
  collapseMediaItem,
  expandMediaItem,
  TestItemEditor,
  TestItemPreview,
  TestMediaItemEditor,
  TestMediaItemPreview,
} from './rowFixtures.tsx';

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

/**
 * A page can be the stage itself, or the screen that precedes a task. Where
 * the blocks live and whether there is a heading above them are not two
 * decisions a caller makes separately: they follow from which of those two
 * things the page is.
 */
describe('a page shown before a task begins', () => {
  const introScreen = (
    <PageContentSection
      variant="introScreen"
      ItemEditor={TestItemEditor}
      ItemPreview={TestItemPreview}
    />
  );

  const familyPedigree = () => ({
    stageId: 'family-pedigree-1',
    sections: introScreen,
  });

  const pedigreeUnowned = [
    'label',
    'nodeConfig',
    'edgeConfig',
    'framing',
    'boundaries',
    'censusPrompt',
  ];

  it('has no heading of its own, and can be switched off entirely', async () => {
    const harness = renderStageEditor(familyPedigree());

    await waitFor(() => expect(harness.outline()).toHaveLength(1));
    // A pedigree that opens straight into the task is an ordinary thing to
    // want, so a stage arriving without an introduction opens switched off.
    expect(harness.outline()[0]).toEqual({
      title: 'Introduction screen',
      state: 'Switched off',
    });
    expect(
      screen.queryByRole('textbox', { name: 'Page heading' }),
    ).not.toBeInTheDocument();
    await harness.roundTrip({ unowned: pedigreeUnowned });
  });

  it('writes its blocks where the pedigree keeps them', async () => {
    const harness = renderStageEditor(familyPedigree());

    await harness.user.click(
      await screen.findByRole('switch', { name: /Introduction screen/ }),
    );
    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Create new introduction block',
      }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Block text' }),
      'Some families are complicated.',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByText('Some families are complicated.');

    const request = await harness.submit();
    expect(request?.stageDocument.introScreen).toEqual({
      items: [
        {
          id: expect.any(String) as unknown as string,
          type: 'text',
          content: 'Some families are complicated.',
        },
      ],
    });
    // The blocks live INSIDE `introScreen`, so nothing of them reaches the
    // stage's own `items`, which this interface does not have.
    expect(request?.stageDocument).not.toHaveProperty('items');
  });
});

/**
 * A block's `content` is one key whose meaning depends on its `type`. Editing
 * it through a single control means a type change has to destroy the value —
 * and until it does, the incoming type's control is showing the outgoing
 * type's value. So a family gives each type a slot of its own, and this
 * section carries the pair of transforms that expand and collapse them.
 */
describe('a page whose blocks can be prose or a resource', () => {
  const mediaPage = () => ({
    stage: {
      id: 'information-media',
      type: 'Information' as const,
      fields: {
        label: 'Information',
        title: 'Welcome',
        items: [
          { id: 'block-text', type: 'text', content: 'Read this.' },
          { id: 'block-asset', type: 'asset', content: 'geo_data' },
        ],
      },
    },
    sections: (
      <PageContentSection
        ItemEditor={TestMediaItemEditor}
        ItemPreview={TestMediaItemPreview}
        itemSelector={expandMediaItem}
        normalizeItem={collapseMediaItem}
      />
    ),
  });

  it('opens each block in the control its own type names', async () => {
    const harness = renderStageEditor(mediaPage());

    await harness.user.click(
      (await screen.findAllByRole('button', { name: 'Edit block' }))[1]!,
    );

    expect(
      await screen.findByRole('textbox', { name: 'Resource' }),
    ).toHaveValue('geo_data');
    // The bug this exists to prevent: a resource id in the control that holds
    // what a participant reads.
    expect(
      screen.queryByRole('textbox', { name: 'Block text' }),
    ).not.toBeInTheDocument();
  });

  it('saves the block the schema’s way, carrying no editor slot with it', async () => {
    const harness = renderStageEditor(mediaPage());

    await harness.user.click(
      (await screen.findAllByRole('button', { name: 'Edit block' }))[1]!,
    );
    const resource = await screen.findByRole('textbox', { name: 'Resource' });
    await harness.user.clear(resource);
    await harness.user.type(resource, 'roster_data');
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    const items = request?.stageDocument.items;
    expect(Array.isArray(items) ? items : []).toEqual([
      { id: 'block-text', type: 'text', content: 'Read this.' },
      { id: 'block-asset', type: 'asset', content: 'roster_data' },
    ]);
  });
});

/**
 * The section's own rule survives a family's collapse: the two are composed,
 * not chosen between. The protocol schema has one spelling for "not
 * answered" — the key is not there — and a control the researcher touched and
 * left empty hands back `''`, which reaches a save as `"description": ""` and
 * is refused in the schema's own words against a path.
 */
describe('a block field the researcher left empty', () => {
  it('is left out of the block entirely, collapse or no collapse', async () => {
    const harness = renderStageEditor({
      stage: {
        id: 'information-empty',
        type: 'Information',
        fields: {
          label: 'Information',
          title: 'Welcome',
          items: [{ id: 'block-text', type: 'text', content: 'Read this.' }],
        },
      },
      sections: (
        <PageContentSection
          ItemEditor={TestMediaItemEditor}
          ItemPreview={TestMediaItemPreview}
          itemSelector={expandMediaItem}
          normalizeItem={collapseMediaItem}
        />
      ),
    });

    await harness.user.click(
      await screen.findByRole('button', { name: 'Edit block' }),
    );
    // Written and then taken back out, which is how a value becomes `''`
    // rather than simply never existing.
    const description = await screen.findByRole('textbox', {
      name: 'Block description',
    });
    await harness.user.type(description, 'Extra context.');
    await harness.user.clear(description);
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    const items = request?.stageDocument.items;
    expect(Array.isArray(items) ? items : []).toEqual([
      { id: 'block-text', type: 'text', content: 'Read this.' },
    ]);
  });
});
