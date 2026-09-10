import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { loadFixtureStage } from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import PageContentSection, {
  type PageContentVariant,
} from '../../PageContentSection.tsx';
import ContentBlockEditor from '../ContentBlockEditor.tsx';
import ContentBlockPreview from '../ContentBlockPreview.tsx';
import {
  contentBlockSlots,
  pageBlocksCarrySize,
} from '../contentBlockTypes.ts';

/**
 * The block editor's text control is a rich-text editor, and ProseMirror
 * cannot be driven in jsdom: it places the caret through `elementFromPoint`
 * and `getClientRects`, neither of which jsdom implements, so typing throws
 * rather than producing text. A plain input carrying the same value keeps
 * these tests about what they are for — which control a block opens on, and
 * what reaches the stage — and the rich text field has its own test.
 */
vi.mock('../../../fields/RichTextField.tsx', () => ({
  default: ({
    id,
    name,
    value,
    onChange,
  }: Readonly<{
    id?: string;
    name?: string;
    value?: unknown;
    onChange?: (next: string) => void;
  }>) => (
    <input
      id={id}
      name={name}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

/**
 * The blocks, as both of their consumers mount them: the shared page section,
 * given this family's row editor, preview, and the pair of functions that
 * expand a saved block onto its own kind's control and collapse it back.
 */
const pageOfBlocks = (variant?: PageContentVariant) => (
  <PageContentSection
    ItemEditor={ContentBlockEditor}
    ItemPreview={ContentBlockPreview}
    slots={contentBlockSlots}
    {...(variant === undefined ? {} : { variant })}
  />
);

const itemsOf = (document: SectionDoc): Record<string, unknown>[] => {
  const items = document.items;
  return Array.isArray(items) ? (items as Record<string, unknown>[]) : [];
};

const mediaPage = () => ({
  stage: {
    id: 'information-media',
    type: 'Information' as const,
    fields: {
      label: 'Information',
      title: 'Welcome',
      items: [
        { id: 'block-text', type: 'text', content: 'Read this.' },
        { id: 'block-image', type: 'asset', content: 'welcome_image' },
      ],
    },
  },
  assets: {
    welcome_image: {
      name: 'Welcome image',
      type: 'image',
      source: 'welcome.png',
    },
  },
  sections: pageOfBlocks(),
});

/**
 * A block's `content` is one key whose meaning depends on its `type` — prose
 * for text, a resource id otherwise. The editor gives each kind a control of
 * its own, and the saved block collapses back to the schema's two-branch shape.
 */
describe('a page whose blocks are text and media', () => {
  it('reads a text block as the participant will read it', async () => {
    renderStageEditor(mediaPage());

    expect(await screen.findByText('Read this.')).toBeInTheDocument();
  });

  it('opens a resource block on a picker rather than on a text editor', async () => {
    const harness = renderStageEditor(mediaPage());

    await harness.user.click(
      (await screen.findAllByRole('button', { name: 'Edit block' }))[1]!,
    );

    expect(await screen.findByRole('radio', { name: 'Image' })).toBeChecked();
    // The bug this exists to prevent: a resource id in the control that holds
    // what a participant reads.
    expect(
      screen.queryByRole('textbox', { name: 'Content' }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText('Welcome image')).toBeInTheDocument();
  });

  it('offers a display size only to the blocks the schema sizes', async () => {
    const harness = renderStageEditor(mediaPage());

    await harness.user.click(
      (await screen.findAllByRole('button', { name: 'Edit block' }))[1]!,
    );
    expect(
      await screen.findByRole('radio', { name: 'Medium' }),
    ).toBeInTheDocument();

    await harness.user.click(screen.getByRole('radio', { name: 'Medium' }));
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(itemsOf(request?.stageDocument ?? {})).toEqual([
      { id: 'block-text', type: 'text', content: 'Read this.' },
      {
        id: 'block-image',
        type: 'asset',
        content: 'welcome_image',
        size: 'MEDIUM',
      },
    ]);
  });

  /**
   * The protocol around this stage keeps changing while it is open, and a
   * resource a collaborator removes is the change a page feels: its block can
   * no longer be shown. The manifest is a section of its own, so removing the
   * file is a write this editor's lock does not cover, and the block has to
   * follow it rather than go on showing a file the protocol no longer holds.
   */
  it('follows a resource removed elsewhere', async () => {
    const harness = renderStageEditor(mediaPage());
    // The block itself, shown from the host's own bytes rather than described.
    expect(
      await screen.findByRole('img', { name: 'Welcome image' }),
    ).toBeInTheDocument();

    act(() => {
      harness.host.store.applyAsCollaborator(sectionId({ kind: 'assets' }), {});
    });

    expect(
      await screen.findByText(/resource is not in this protocol/),
    ).toBeInTheDocument();
  });

  it('carries no editor slot into the saved block', async () => {
    const harness = renderStageEditor(mediaPage());

    await harness.user.click(
      (await screen.findAllByRole('button', { name: 'Edit block' }))[0]!,
    );
    const content = await screen.findByRole('textbox', { name: 'Content' });
    await harness.user.clear(content);
    await harness.user.type(content, 'Read this instead.');
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(itemsOf(request?.stageDocument ?? {})).toEqual([
      { id: 'block-text', type: 'text', content: 'Read this instead.' },
      { id: 'block-image', type: 'asset', content: 'welcome_image' },
    ]);
  });

  it('writes a block the researcher adds from nothing', async () => {
    const harness = renderStageEditor({
      stage: {
        id: 'information-added',
        type: 'Information',
        fields: {
          label: 'Information',
          title: 'Welcome',
          items: [{ id: 'block-text', type: 'text', content: 'Read this.' }],
        },
      },
      sections: pageOfBlocks(),
    });

    await harness.user.click(
      await screen.findByRole('button', { name: 'Create new content block' }),
    );
    await harness.user.click(
      await screen.findByRole('radio', { name: 'Text' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Content' }),
      'Thank you for taking part.',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByText('Thank you for taking part.');

    const request = await harness.submit();
    expect(itemsOf(request?.stageDocument ?? {})).toEqual([
      { id: 'block-text', type: 'text', content: 'Read this.' },
      {
        id: expect.any(String) as unknown as string,
        type: 'text',
        content: 'Thank you for taking part.',
      },
    ]);
  });
});

/**
 * A media block's `description` is the words that stand in for the file, and
 * the interview runtime is where that matters: it reads them as an image's alt
 * text and as the accessible name of an audio or video player. The schema has
 * carried the key all along — on a page's items and on a task's introduction
 * items alike — so a page whose editor cannot write it is a page whose
 * researcher cannot describe their own media, and cannot repair a description
 * somebody else got wrong.
 */
describe('describing a media block for a participant who cannot see it', () => {
  const describedPage = (description?: string) => ({
    stage: {
      id: 'information-described',
      type: 'Information' as const,
      fields: {
        label: 'Information',
        title: 'Welcome',
        items: [
          { id: 'block-text', type: 'text', content: 'Read this.' },
          {
            id: 'block-image',
            type: 'asset',
            content: 'welcome_image',
            ...(description === undefined ? {} : { description }),
          },
        ],
      },
    },
    assets: {
      welcome_image: {
        name: 'Welcome image',
        type: 'image',
        source: 'welcome.png',
      },
    },
    sections: pageOfBlocks(),
  });

  const openImageBlock = async (harness: {
    user: { click: (element: Element) => Promise<void> };
  }) => {
    await harness.user.click(
      (await screen.findAllByRole('button', { name: 'Edit block' }))[1]!,
    );
    await screen.findByRole('radio', { name: 'Image' });
  };

  it('opens the block on the words somebody already wrote', async () => {
    const harness = renderStageEditor(
      describedPage('Two people talking at a kitchen table.'),
    );

    await openImageBlock(harness);

    expect(
      await screen.findByRole('textbox', { name: 'Description' }),
    ).toHaveValue('Two people talking at a kitchen table.');
  });

  it('saves a description the researcher writes for an undescribed block', async () => {
    const harness = renderStageEditor(describedPage());

    await openImageBlock(harness);
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Description' }),
      'A researcher waving at the camera.',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(itemsOf(request?.stageDocument ?? {})).toEqual([
      { id: 'block-text', type: 'text', content: 'Read this.' },
      {
        id: 'block-image',
        type: 'asset',
        content: 'welcome_image',
        description: 'A researcher waving at the camera.',
      },
    ]);
  });

  /**
   * An image a page shows for decoration is correctly described by nothing at
   * all, and the schema spells that by the key being absent. An empty string
   * saved instead would not merely be untidy: the runtime names an audio or
   * video player `description ?? name`, so `""` is a player whose accessible
   * name is nothing, which is worse than the filename it replaced.
   */
  it('removes a description the researcher clears rather than emptying it', async () => {
    const harness = renderStageEditor(
      describedPage('Two people talking at a kitchen table.'),
    );

    await openImageBlock(harness);
    await harness.user.clear(
      await screen.findByRole('textbox', { name: 'Description' }),
    );
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(itemsOf(request?.stageDocument ?? {})).toEqual([
      { id: 'block-text', type: 'text', content: 'Read this.' },
      { id: 'block-image', type: 'asset', content: 'welcome_image' },
    ]);
  });

  /**
   * A text block is already its own words: the runtime renders its markdown
   * and reads no description from it, so a control here would ask a researcher
   * to describe prose to somebody who is about to be read the prose.
   */
  it('asks nothing about a text block, which is already its own words', async () => {
    const harness = renderStageEditor(describedPage());

    await harness.user.click(
      (await screen.findAllByRole('button', { name: 'Edit block' }))[0]!,
    );
    await screen.findByRole('radio', { name: 'Text' });

    expect(
      screen.queryByRole('textbox', { name: 'Description' }),
    ).not.toBeInTheDocument();
  });
});

/**
 * Choosing or changing a block's content type swaps a whole required control —
 * a rich text editor becomes a resource picker, or the other way round. A
 * sighted researcher watches that happen; the live region is the only thing
 * that says so to anyone else, and silence about a change that can destroy
 * work is the worst possible reading of it.
 *
 * Read as whole sentences rather than by re-formatting the descriptors the
 * editor read, because that would pass whatever the catalog said. This is also
 * what holds `CONTENT_BLOCK_KIND_LABELS` to the words the announcements splice
 * in: the kind is named here as "Text" and "Image", so a label rebuilt from a
 * capitalised `type` fails.
 */
describe('what a screen reader is told when a block changes type', () => {
  // Scoped to the dialog: the editor beneath it reports its own list changes
  // through a live region of its own, and this is the block editor's.
  const status = () =>
    within(screen.getByRole('dialog')).getByRole('status').textContent;

  it('names the control that has just appeared on a new block', async () => {
    const harness = renderStageEditor(mediaPage());

    await harness.user.click(
      await screen.findByRole('button', { name: 'Create new content block' }),
    );
    await harness.user.click(
      await screen.findByRole('radio', { name: 'Text' }),
    );

    await waitFor(() =>
      expect(status()).toBe(
        'Content type set to Text. A content field for it has been added below.',
      ),
    );
  });

  it('walks a saved block through all three outcomes for its draft', async () => {
    const harness = renderStageEditor(mediaPage());

    await harness.user.click(
      (await screen.findAllByRole('button', { name: 'Edit block' }))[1]!,
    );
    await screen.findByRole('radio', { name: 'Image' });

    // The image's own reference is entered, and text has nothing — so leaving
    // the image for text keeps the reference where it can come back from.
    await harness.user.click(screen.getByRole('radio', { name: 'Text' }));
    await waitFor(() =>
      expect(status()).toBe(
        'Content type changed to Text. The content you entered for the previous type is kept, and returns if you change back to it.',
      ),
    );

    // Back again, and the image's reference is what it finds waiting.
    await harness.user.click(screen.getByRole('radio', { name: 'Image' }));
    await waitFor(() =>
      expect(status()).toBe(
        'Content type changed to Image. The content you entered for Image earlier has been restored.',
      ),
    );

    // A third kind neither has a draft nor leaves one behind: the outgoing
    // image slot still holds its reference, so this is only reachable from a
    // kind whose own slot is empty.
    await harness.user.click(screen.getByRole('radio', { name: 'Text' }));
    await waitFor(() => expect(status()).toContain('changed to Text'));
    await harness.user.click(screen.getByRole('radio', { name: 'Audio' }));
    await waitFor(() =>
      expect(status()).toBe(
        'Content type changed to Audio. Nothing has been entered for Audio yet.',
      ),
    );
  });
});

/**
 * A block pointing at a resource that IS in this protocol and is simply not
 * something a page can present — a roster, a map layer, an API key — is a
 * different problem from one pointing at a deletion, and telling the second
 * researcher their file is missing would send them hunting for something that
 * never happened.
 */
describe('a block naming a resource no page can present', () => {
  /** `geo_data` is a map layer the shared fixture protocol really holds. */
  const unpresentablePage = (size?: string) => ({
    stage: {
      id: 'information-unpresentable',
      type: 'Information' as const,
      fields: {
        label: 'Information',
        title: 'Welcome',
        items: [
          {
            id: 'block-layer',
            type: 'asset',
            content: 'geo_data',
            ...(size === undefined ? {} : { size }),
          },
        ],
      },
    },
    sections: pageOfBlocks(),
  });

  it('says the resource is the wrong kind rather than gone', async () => {
    const harness = renderStageEditor(unpresentablePage());

    await harness.user.click(
      await screen.findByRole('button', { name: 'Edit block' }),
    );

    expect(
      await screen.findByText(
        /is not an image, audio or video file, so this block cannot show it/u,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/no longer in this protocol/u),
    ).not.toBeInTheDocument();
  });

  /**
   * The block keeps the `asset` type the schema stores, because nothing can
   * resolve it to a kind — so the rule about which blocks carry a display size
   * has to accept that type as well. Without it, opening this block and
   * closing it again silently throws away a size the researcher chose while
   * the resource still worked.
   */
  it('keeps the display size it was saved with', async () => {
    const harness = renderStageEditor(unpresentablePage('MEDIUM'));

    await harness.user.click(
      await screen.findByRole('button', { name: 'Edit block' }),
    );
    await screen.findByText(/is not an image, audio or video file/u);
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(itemsOf(request?.stageDocument ?? {})).toEqual([
      {
        id: 'block-layer',
        type: 'asset',
        content: 'geo_data',
        size: 'MEDIUM',
      },
    ]);
  });
});

/**
 * The other page these blocks are mounted on, and the reason the size control
 * is decided from the stage rather than from a prop: a pedigree's introduction
 * items are a STRICT object without `size`, so offering the control there
 * would author a stage the protocol refuses.
 */
describe('the same blocks on a task’s introduction screen', () => {
  const introScreenPage = (size?: string) => ({
    stage: {
      id: 'family-pedigree-intro',
      type: 'FamilyPedigree' as const,
      fields: {
        ...loadFixtureStage('family-pedigree-1').fields,
        introScreen: {
          items: [
            {
              id: 'intro-image',
              type: 'asset',
              content: 'intro_image',
              ...(size === undefined ? {} : { size }),
            },
          ],
        },
      },
    },
    assets: {
      intro_image: { name: 'Intro image', type: 'image', source: 'intro.png' },
    },
    sections: pageOfBlocks('introScreen'),
  });

  const introItemsOf = (document: SectionDoc): Record<string, unknown>[] => {
    const introScreen = document.introScreen;
    return typeof introScreen === 'object' && introScreen !== null
      ? itemsOf(introScreen as SectionDoc)
      : [];
  };

  it('says which pages carry a display size at all', () => {
    expect(pageBlocksCarrySize('Information')).toBe(true);
    expect(pageBlocksCarrySize('FamilyPedigree')).toBe(false);
  });

  /**
   * The other half of the same rule, and the half the control cannot cover.
   *
   * A `size` can already be on the block — written by an older tool, by hand,
   * or by the same block before it was moved onto an introduction screen — and
   * the collapse restores one for every kind that could carry one. The
   * pedigree's intro items are a strict object with no `size` at all, so the
   * key rides through the editor invisibly and holds the stage at the save
   * with a refusal about a key that is nowhere on the researcher's screen.
   * What decides is the same fact the control is decided from, so the two
   * cannot disagree.
   */
  it('throws away a display size the block arrived with', async () => {
    const harness = renderStageEditor(introScreenPage('MEDIUM'));

    await harness.user.click(
      await screen.findByRole('button', { name: 'Edit introduction block' }),
    );
    expect(await screen.findByRole('radio', { name: 'Image' })).toBeChecked();
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    // The save has to SUCCEED: the size the researcher never chose and cannot
    // see is exactly what the strict intro-item schema refuses, so a refusal
    // here is the defect rather than the assertion below failing.
    const request = await harness.submit();
    expect(request).not.toBeNull();
    expect(introItemsOf(request?.stageDocument ?? {})).toEqual([
      { id: 'intro-image', type: 'asset', content: 'intro_image' },
    ]);
  });

  /**
   * The half of the same question that goes the other way. `size` is a key
   * only SOME pages have room for, so the control is decided from the stage.
   * `description` is on both page schemas and read by the same runtime
   * component whichever page rendered it, so it is offered here unconditionally
   * — and a rule copied from `size` would have hidden it on the very screen a
   * task's introduction media is most likely to need explaining.
   */
  it('describes an introduction block the same way a page’s block is described', async () => {
    const harness = renderStageEditor(introScreenPage());

    await harness.user.click(
      await screen.findByRole('button', { name: 'Edit introduction block' }),
    );
    await screen.findByRole('radio', { name: 'Image' });
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Description' }),
      'The family tree this task builds.',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(request).not.toBeNull();
    expect(introItemsOf(request?.stageDocument ?? {})).toEqual([
      {
        id: 'intro-image',
        type: 'asset',
        content: 'intro_image',
        description: 'The family tree this task builds.',
      },
    ]);
  });

  it('offers no display size for a block the schema has no room for', async () => {
    const harness = renderStageEditor(introScreenPage());

    await harness.user.click(
      await screen.findByRole('button', { name: 'Edit introduction block' }),
    );

    expect(await screen.findByRole('radio', { name: 'Image' })).toBeChecked();
    expect(
      screen.queryByRole('radio', { name: 'Medium' }),
    ).not.toBeInTheDocument();
  });
});
