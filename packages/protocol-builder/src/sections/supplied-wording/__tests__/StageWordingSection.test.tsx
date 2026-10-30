import { screen, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { sectionId } from '@codaco/studio-sync/taxonomy';

import { egoFormStageEditor } from '../../../editors/ego-form/EgoFormStageEditor.ts';
import { familyPedigreeStageEditor } from '../../../editors/family-pedigree/FamilyPedigreeStageEditor.ts';
import type { StageEditorRegistry } from '../../../stage-editor-contract.ts';
import type { FixtureStageId } from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';

const FIXTURE_LANGUAGE = 'en-US';
const SETTINGS = sectionId({ kind: 'settings' });
const SUPPLIED_HINT = 'Scroll to see more questions';

const mountEgoForm = () =>
  renderStageEditor({ stageId: 'ego-form-1', registry: egoFormStageEditor });

/** A stage editor, with the first write it sends held until `release`. */
const mountWithHeldWrite = (
  stageId: FixtureStageId,
  registry: Partial<StageEditorRegistry>,
) => {
  const first = Promise.withResolvers<void>();
  let held = true;
  const harness = renderStageEditor({
    stageId,
    registry,
    adapter: (host) =>
      host.adapterWith({
        Submit: (input) =>
          Effect.flatMap(
            Effect.promise(async () => {
              if (held) {
                held = false;
                await first.promise;
              }
            }),
            () => host.handle.Submit(input),
          ),
      }),
  });
  return { harness, release: () => first.resolve() };
};

const mountEgoFormWithHeldWrite = () =>
  mountWithHeldWrite('ego-form-1', egoFormStageEditor);

/** One shared word as the protocol holds it. */
const heldWord = (
  harness: ReturnType<typeof mountEgoForm>,
  group: string,
  key: string,
): unknown => {
  const settings = harness.protocolSections()[SETTINGS];
  const interfaceText = settings?.interfaceText as
    | Readonly<Record<string, Readonly<Record<string, unknown>>>>
    | undefined;
  return interfaceText?.[group]?.[key];
};

/** The ego form's shared hint as the protocol holds it. */
const heldHint = (harness: ReturnType<typeof mountEgoForm>): unknown =>
  heldWord(harness, 'egoForm', 'scrollForQuestions');

/**
 * The words every stage of a kind shares, edited where the stage is: a stage
 * with nothing of its own to word shows them straight away, without the parts
 * a stage holding both opens and closes, and writes a change to the protocol
 * as the researcher leaves the field rather than with the stage.
 */
describe('a stage whose only built-in wording is shared', () => {
  it('shows the shared words without a part for the stage’s own', async () => {
    const harness = mountEgoForm();
    await harness.user.click(
      await screen.findByRole('switch', { name: 'Customize built-in wording' }),
    );

    expect(
      await screen.findByRole('textbox', { name: 'More questions hint' }),
    ).toHaveValue(SUPPLIED_HINT);
    expect(
      screen.queryByRole('button', { name: 'Specific to this stage' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'Shared by every stage of this kind',
      }),
    ).not.toBeInTheDocument();
  });

  it('writes a shared word to the protocol as the field is left, before the stage is saved', async () => {
    const harness = mountEgoForm();
    await harness.user.click(
      await screen.findByRole('switch', { name: 'Customize built-in wording' }),
    );
    const hint = await screen.findByRole('textbox', {
      name: 'More questions hint',
    });
    await waitFor(() => expect(hint).not.toHaveAttribute('readonly'));

    await harness.user.clear(hint);
    await harness.user.type(hint, 'More questions below');
    await harness.user.tab();

    await waitFor(() =>
      expect(heldHint(harness)).toEqual({
        [FIXTURE_LANGUAGE]: 'More questions below',
      }),
    );
  });

  it('keeps a shared word the default language leaves empty out of the protocol', async () => {
    const harness = mountEgoForm();
    await harness.user.click(
      await screen.findByRole('switch', { name: 'Customize built-in wording' }),
    );
    const hint = await screen.findByRole('textbox', {
      name: 'More questions hint',
    });
    await waitFor(() => expect(hint).not.toHaveAttribute('readonly'));

    await harness.user.clear(hint);
    await harness.user.tab();

    await waitFor(() => expect(hint).toHaveAccessibleDescription(/Required/));
    expect(heldHint(harness)).toEqual({ [FIXTURE_LANGUAGE]: SUPPLIED_HINT });
  });

  it('puts Network Canvas’s wording back when switched off, once the researcher agrees', async () => {
    const harness = mountEgoForm();
    const section = await screen.findByRole('switch', {
      name: 'Customize built-in wording',
    });
    await harness.user.click(section);
    const hint = await screen.findByRole('textbox', {
      name: 'More questions hint',
    });
    await waitFor(() => expect(hint).not.toHaveAttribute('readonly'));
    await harness.user.clear(hint);
    await harness.user.type(hint, 'More questions below');
    await harness.user.tab();
    await waitFor(() =>
      expect(heldHint(harness)).toEqual({
        [FIXTURE_LANGUAGE]: 'More questions below',
      }),
    );

    await harness.user.click(section);
    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Use Network Canvas’s wording',
      }),
    );

    await waitFor(() =>
      expect(heldHint(harness)).toEqual({ [FIXTURE_LANGUAGE]: SUPPLIED_HINT }),
    );
    expect(section).toHaveAttribute('aria-checked', 'false');
  });

  it('waits for a shared word still being written before switching off, and resets it', async () => {
    const { harness, release } = mountEgoFormWithHeldWrite();
    const section = await screen.findByRole('switch', {
      name: 'Customize built-in wording',
    });
    await harness.user.click(section);
    const hint = await screen.findByRole('textbox', {
      name: 'More questions hint',
    });
    await waitFor(() => expect(hint).not.toHaveAttribute('readonly'));
    await harness.user.clear(hint);
    await harness.user.type(hint, 'More questions below');

    // Leaving the field for the switch starts the write, which is still on
    // its way when the switch is pressed.
    await harness.user.click(section);
    release();

    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Use Network Canvas’s wording',
      }),
    );
    await waitFor(() =>
      expect(section).toHaveAttribute('aria-checked', 'false'),
    );
    expect(heldHint(harness)).toEqual({ [FIXTURE_LANGUAGE]: SUPPLIED_HINT });
  });
});

describe('a stage whose shared wording comes in several groups', () => {
  it('keeps both of two shared words written one straight after the other', async () => {
    const { harness, release } = mountWithHeldWrite(
      'family-pedigree-1',
      familyPedigreeStageEditor,
    );
    const section = await screen.findByRole('switch', {
      name: 'Customize built-in wording',
    });
    if (section.getAttribute('aria-checked') !== 'true') {
      await harness.user.click(section);
    }
    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Shared by every stage of this kind',
      }),
    );
    const wholeFamily = await screen.findByRole('textbox', {
      name: 'Whole family button',
    });
    const pointer = await screen.findByRole('textbox', {
      name: 'Select tool explanation',
    });
    await waitFor(() => expect(wholeFamily).not.toHaveAttribute('readonly'));

    // The two words belong to different groups, so each is written on its
    // own; the first word's write is held on its way while the second is left.
    await harness.user.clear(wholeFamily);
    await harness.user.type(wholeFamily, 'Everyone');
    await harness.user.clear(pointer);
    await harness.user.type(pointer, 'Choose a relative');
    await harness.user.tab();
    release();

    await waitFor(() => {
      expect(heldWord(harness, 'familyTreeView', 'showWholeFamily')).toEqual({
        [FIXTURE_LANGUAGE]: 'Everyone',
      });
      expect(
        heldWord(harness, 'familyPedigree', 'pointerToolDescription'),
      ).toEqual({ [FIXTURE_LANGUAGE]: 'Choose a relative' });
    });
  });
});
