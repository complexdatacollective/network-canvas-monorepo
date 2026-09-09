import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import { fixtureStageIds } from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { writeInto } from '../../__tests__/writeInto.ts';
import { InformationStageEditor } from '../InformationStageEditor.tsx';
import { mountedAs, stageNameInput } from './formEditorHarness.tsx';

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

/** Where a host would insert a new page: over the one the fixture holds. */
const INFORMATION_INDEX = fixtureStageIds().indexOf('information-1');

const createFixture = () => ({
  create: { type: 'Information' as const, position: INFORMATION_INDEX },
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

  it('opens a new stage on the interface template', async () => {
    renderStageEditor(createFixture());

    // An Information stage has no authored defaults, so a new one arrives
    // empty — and the editor has to be able to say so rather than showing a
    // heading nobody wrote. The exception is the name, which the session
    // proposes because it is creating the stage.
    await waitFor(() => expect(stageNameInput()).not.toHaveValue(''));
    expect(stageNameInput().value).toMatch(/^Information/);
    expect(screen.getByRole('textbox', { name: 'Page heading' })).toHaveValue(
      '',
    );
  });

  it('saves a new stage once the researcher has written it', async () => {
    const harness = renderStageEditor(createFixture());
    await waitFor(() => expect(stageNameInput()).not.toHaveValue(''));

    await writeInto(harness, stageNameInput(), 'Welcome screen');
    await writeInto(
      harness,
      screen.getByRole('textbox', { name: 'Page heading' }),
      'Welcome',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Create new content block' }),
    );
    await harness.user.click(
      await screen.findByRole('radio', { name: 'Text' }),
    );
    await writeInto(
      harness,
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

    await waitFor(() =>
      expect(
        screen.getByRole('textbox', { name: 'Page heading' }),
      ).toBeDisabled(),
    );

    // The shell's refusal is the guarantee, not the chrome above it: a
    // keyboard, a stale render, or another host's own button can all still
    // submit the form. See `fallbackSaveControl.test.tsx` for why the save
    // control this editor falls back to stays pressable.
    const form = harness.baseElement.querySelector('form');
    if (form === null) throw new Error('the editor rendered no form');
    fireEvent.submit(form);

    expect(
      await screen.findByText('This stage is read-only', { exact: false }),
    ).toBeInTheDocument();
  });
});
