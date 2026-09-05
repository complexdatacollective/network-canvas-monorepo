import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { InformationStageEditor } from '../InformationStageEditor.tsx';
import { mountedAs } from './formEditorHarness.tsx';
import { newStageFields } from './newStageFields.ts';

/**
 * The block editor's text control is a rich-text editor, and ProseMirror
 * cannot be driven in jsdom: it places the caret through `elementFromPoint`
 * and `getClientRects`, neither of which jsdom implements, so typing throws
 * rather than producing text. A plain input carrying the same value keeps
 * these tests about what they are for — the composition, the round trip, and
 * what reaches the stage — and the editor has its own test.
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

const openFixture = () => ({
  stageId: 'information-1',
  editor: mountedAs(InformationStageEditor),
});

const itemsOf = (document: SectionDoc): Record<string, unknown>[] => {
  const items = document.items;
  return Array.isArray(items) ? (items as Record<string, unknown>[]) : [];
};

describe('the editor for a page of content', () => {
  it('composes the page in the order the plan sets out', async () => {
    const harness = renderStageEditor(openFixture());

    await waitFor(() => expect(harness.outline()).toHaveLength(4));
    expect(harness.outline().map((section) => section.title)).toEqual([
      'Stage name',
      'Page content',
      'Skip logic',
      'Interviewer guidance',
    ]);
  });

  it('opens on the stage the protocol holds', async () => {
    renderStageEditor(openFixture());

    expect(screen.getByRole('textbox', { name: 'Stage name' })).toHaveValue(
      'Information',
    );
    expect(screen.getByRole('textbox', { name: 'Page heading' })).toHaveValue(
      'Welcome',
    );
    expect(
      await screen.findByText('Welcome to this interview.'),
    ).toBeInTheDocument();
  });

  /**
   * Every key the fixture stage holds is owned by a section this editor
   * mounts. `unowned` is empty deliberately: an Information stage is its name,
   * its heading and its blocks, and all three are on screen.
   */
  it('saves the stage it opened, losing nothing', async () => {
    const harness = renderStageEditor(openFixture());

    expect(harness.ownedKeys()).toEqual(['items', 'label', 'title']);
    await harness.roundTrip({ unowned: [] });
  });

  it('starts a new stage from the interface template', async () => {
    const harness = renderStageEditor({
      stage: {
        id: 'information-new',
        type: 'Information',
        fields: newStageFields('Information'),
      },
      editor: mountedAs(InformationStageEditor),
    });

    // An Information stage has no authored defaults, so a new one arrives
    // empty — and the editor has to be able to say so rather than showing a
    // heading nobody wrote.
    expect(screen.getByRole('textbox', { name: 'Stage name' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Page heading' })).toHaveValue(
      '',
    );

    await harness.user.type(
      screen.getByRole('textbox', { name: 'Stage name' }),
      'Welcome screen',
    );
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Page heading' }),
      'Welcome',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Create new content block' }),
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
    expect(request?.stageDocument.label).toBe('Welcome screen');
    expect(request?.stageDocument.title).toBe('Welcome');
    expect(itemsOf(request?.stageDocument ?? {})).toEqual([
      {
        id: expect.any(String) as unknown as string,
        type: 'text',
        content: 'Thank you for taking part.',
      },
    ]);
  });

  it('refuses a page with no heading, and says which section is at fault', async () => {
    const harness = renderStageEditor(openFixture());

    await harness.user.clear(
      screen.getByRole('textbox', { name: 'Page heading' }),
    );

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText('This field is required.'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        harness.outline().find((section) => section.title === 'Page content')
          ?.state,
      ).toBe('Has a problem'),
    );
  });

  /**
   * Typing is buffered in the form until the researcher saves, so an editor
   * closed without saving has written nothing at all. The pending batches are
   * the proof: a field wired to write on change would leave one behind.
   */
  it('writes nothing when the researcher discards the edit', async () => {
    const harness = renderStageEditor(openFixture());

    await harness.user.clear(
      screen.getByRole('textbox', { name: 'Page heading' }),
    );
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Page heading' }),
      'A heading nobody kept',
    );
    expect(harness.pendingCommands()).toHaveLength(0);

    await harness.cancel();

    expect(harness.pendingCommands()).toHaveLength(0);
    expect(harness.session.getSnapshot().editedSection.fields).toEqual(
      harness.seeded.fields,
    );
  });

  it('refuses to save a stage the session has made read-only', async () => {
    const harness = renderStageEditor(openFixture());

    harness.setReadOnly();

    const save = await screen.findByRole('button', { name: 'Save stage' });
    await waitFor(() => expect(save).toBeDisabled());
    expect(
      screen.getByRole('textbox', { name: 'Page heading' }),
    ).toBeDisabled();

    // A disabled button is chrome, not the guarantee. Submitting the form
    // itself is what a keyboard, a stale render, or another host's own button
    // can still do.
    const form = harness.baseElement.querySelector('form');
    if (form === null) throw new Error('the editor rendered no form');
    fireEvent.submit(form);

    expect(
      await screen.findByText('This stage is read-only', { exact: false }),
    ).toBeInTheDocument();
  });
});

/**
 * A block's `content` is one key whose meaning depends on its `type` — prose
 * for text, a resource id otherwise. The editor gives each kind a control of
 * its own, and the saved block collapses back to the schema's two-branch shape.
 */
describe('a page whose blocks are media', () => {
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
    editor: mountedAs(InformationStageEditor),
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
});
