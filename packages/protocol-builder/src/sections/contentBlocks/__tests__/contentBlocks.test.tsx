import { act, screen, waitFor } from '@testing-library/react';
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
  collapseContentBlock,
  expandContentBlock,
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
    itemSelector={expandContentBlock}
    normalizeItem={collapseContentBlock}
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
   * no longer be shown. The editor has to say so — and must not turn their
   * deletion into this session's own edit, which is what a command emitted
   * here would do.
   */
  it('follows a resource removed elsewhere without echoing it back', async () => {
    const harness = renderStageEditor(mediaPage());
    // The block itself, shown from the gateway rather than described.
    expect(
      await screen.findByRole('img', { name: 'Welcome image' }),
    ).toBeInTheDocument();

    const dispatch = vi.spyOn(harness.session, 'dispatch');
    const sections = {
      ...harness.session.getSnapshot().protocolSections,
      [sectionId({ kind: 'assets' })]: {},
    };
    act(() => {
      harness.session.receiveAuthoritativeUpdate({
        protocolSections: sections,
        manifestRevision: { sequence: 2n, hash: 'revision-2' },
      });
    });

    expect(
      await screen.findByText(/resource is not in this protocol/),
    ).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toHaveLength(0);
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
 * The other page these blocks are mounted on, and the reason the size control
 * is decided from the stage rather than from a prop: a pedigree's introduction
 * items are a STRICT object without `size`, so offering the control there
 * would author a stage the protocol refuses.
 */
describe('the same blocks on a task’s introduction screen', () => {
  const introScreenPage = () => ({
    stage: {
      id: 'family-pedigree-intro',
      type: 'FamilyPedigree' as const,
      fields: {
        ...loadFixtureStage('family-pedigree-1').fields,
        introScreen: {
          items: [{ id: 'intro-image', type: 'asset', content: 'intro_image' }],
        },
      },
    },
    assets: {
      intro_image: { name: 'Intro image', type: 'image', source: 'intro.png' },
    },
    sections: pageOfBlocks('introScreen'),
  });

  it('says which pages carry a display size at all', () => {
    expect(pageBlocksCarrySize('Information')).toBe(true);
    expect(pageBlocksCarrySize('FamilyPedigree')).toBe(false);
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
