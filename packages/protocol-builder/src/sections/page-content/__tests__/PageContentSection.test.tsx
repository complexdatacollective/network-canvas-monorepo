import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import {
  mediaItemSlots,
  TestItemEditor,
  TestItemPreview,
  TestMediaItemEditor,
  TestMediaItemPreview,
} from '../../__tests__/rowFixtures.tsx';
import StageNameSection from '../../stage-heading/StageNameSection.tsx';
import PageContentSection from '../PageContentSection.tsx';

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
      screen.getByRole('button', { name: 'Create new content item' }),
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
      screen.getByRole('button', { name: 'Delete item' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Delete item' }),
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
    'nominationPrompts',
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
        slots={mediaItemSlots}
      />
    ),
  });

  it('opens each block in the control its own type names', async () => {
    const harness = renderStageEditor(mediaPage());

    await harness.user.click(
      (await screen.findAllByRole('button', { name: 'Edit item' }))[1]!,
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
      (await screen.findAllByRole('button', { name: 'Edit item' }))[1]!,
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
          slots={mediaItemSlots}
        />
      ),
    });

    await harness.user.click(
      await screen.findByRole('button', { name: 'Edit item' }),
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

/**
 * Which of the two transforms runs first is the whole of this rule. The
 * family's collapse decides what `content` becomes, and an emptied slot is how
 * a researcher clears it — so stripping absent values first would take the
 * empty slot away before the collapse could read it, and the block would go on
 * showing the prose they just deleted.
 */
describe('a block whose active slot the researcher emptied', () => {
  it('loses the content it held, rather than keeping the old one', async () => {
    const harness = renderStageEditor({
      stage: {
        id: 'information-emptied',
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
          slots={mediaItemSlots}
        />
      ),
    });

    await harness.user.click(
      await screen.findByRole('button', { name: 'Edit item' }),
    );
    await harness.user.clear(
      await screen.findByRole('textbox', { name: 'Block text' }),
    );
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    // The block the researcher is looking at is empty…
    expect(await screen.findByText('Empty block')).toBeInTheDocument();
    expect(screen.queryByText('Read this.')).not.toBeInTheDocument();

    // …and so is the block the editor is holding. A page whose only block has
    // no content is not a page the schema accepts, so the save being refused
    // is what proves the prose is really gone: had `content` survived the
    // collapse, the stage would have saved.
    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(
        'This stage is not finished, so it was not saved. The sections below say what is missing.',
      ),
    ).toBeInTheDocument();
  });
});

/**
 * The two halves of the slot contract travel together, and the type system is
 * what says so.
 *
 * A family that declared the expand half alone used to compile. Its row edits
 * then carried an editor-only key and the pre-edit `content` into the saved
 * stage, and the researcher was held at the save by an error naming a key that
 * is in no protocol schema and nowhere on their screen. Nothing but the types
 * can catch that: both halves are plain functions, and the collapse's absence
 * is invisible until a save.
 */
describe('the expand and collapse halves of a block', () => {
  it('cannot be declared one at a time', () => {
    const halfDeclared = (
      <PageContentSection
        ItemEditor={TestMediaItemEditor}
        ItemPreview={TestMediaItemPreview}
        // @ts-expect-error — `slots` requires `collapse` as well: a page given
        // the expand half alone saves the editor's private slot key into the
        // protocol. Deleting `collapse` from `PageContentSectionProps` — or
        // making it optional — makes this directive unused and fails
        // `typecheck`.
        slots={{ expand: mediaItemSlots.expand }}
      />
    );

    expect(halfDeclared.type).toBe(PageContentSection);
  });

  /**
   * The other half of the same proof, at run time and against the protocol
   * itself: the pair the types now insist on is the pair that strips the
   * editor's own slot before the row is saved.
   */
  it('saves a row the protocol schema accepts', async () => {
    const harness = renderStageEditor({
      stage: {
        id: 'information-live',
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
          slots={mediaItemSlots}
        />
      ),
    });

    await harness.user.click(
      await screen.findByRole('button', { name: 'Edit item' }),
    );
    const text = await screen.findByRole('textbox', { name: 'Block text' });
    await harness.user.clear(text);
    await harness.user.type(text, 'Read this instead.');
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const written = await harness.submit();
    // The row exactly, key for key: an editor-only slot left on it would be a
    // key the protocol schema has never heard of.
    expect(written?.stageDocument.items).toEqual([
      { id: 'block-text', type: 'text', content: 'Read this instead.' },
    ]);
  });
});
