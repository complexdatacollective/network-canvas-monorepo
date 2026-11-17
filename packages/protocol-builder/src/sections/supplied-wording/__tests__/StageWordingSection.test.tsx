import { screen, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { sectionId } from '@codaco/studio-sync/taxonomy';

import { familyPedigreeStageEditor } from '../../../editors/family-pedigree/FamilyPedigreeStageEditor.ts';
import { networkComposerStageEditor } from '../../../editors/network-composer/NetworkComposerStageEditor.ts';
import type { StageEditorRegistry } from '../../../stage-editor-contract.ts';
import type { FixtureStageId } from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';

const FIXTURE_LANGUAGE = 'en-US';
const SETTINGS = sectionId({ kind: 'settings' });
const SUPPLIED_HINT = 'Type a name, then press Enter';

const mountComposer = () =>
  renderStageEditor({
    stageId: 'network-composer-1',
    registry: networkComposerStageEditor,
  });

/**
 * A stage editor, with the first write it sends held until `release`, and the
 * number of writes the protocol has applied so far.
 */
const mountWithHeldWrite = (
  stageId: FixtureStageId,
  registry: Partial<StageEditorRegistry>,
) => {
  const first = Promise.withResolvers<void>();
  let held = true;
  let applied = 0;
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
            () =>
              Effect.tap(host.handle.Submit(input), () =>
                Effect.sync(() => {
                  applied += 1;
                }),
              ),
          ),
      }),
  });
  return {
    harness,
    release: () => first.resolve(),
    applied: () => applied,
  };
};

const mountComposerWithHeldWrite = () =>
  mountWithHeldWrite('network-composer-1', networkComposerStageEditor);

/** One shared word as the protocol holds it. */
const heldWord = (
  harness: ReturnType<typeof mountComposer>,
  group: string,
  key: string,
): unknown => {
  const settings = harness.protocolSections()[SETTINGS];
  const interfaceText = settings?.interfaceText as
    | Readonly<Record<string, Readonly<Record<string, unknown>>>>
    | undefined;
  return interfaceText?.[group]?.[key];
};

/** The Network Composer's name box placeholder as the protocol holds it. */
const heldHint = (harness: ReturnType<typeof mountComposer>): unknown =>
  heldWord(harness, 'networkComposer', 'addNamePlaceholder');

/**
 * The words every stage of a kind shares, edited where the stage is: a stage
 * with nothing of its own to word shows them straight away, without the parts
 * a stage holding both opens and closes, and writes a change to the protocol
 * as the researcher leaves the field rather than with the stage.
 */
describe('a stage whose only built-in wording is shared', () => {
  it('shows the shared words without a part for the stage’s own', async () => {
    const harness = mountComposer();
    await harness.user.click(
      await screen.findByRole('switch', { name: 'Customize built-in wording' }),
    );

    expect(
      await screen.findByRole('textbox', { name: 'Name box placeholder' }),
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
    const harness = mountComposer();
    await harness.user.click(
      await screen.findByRole('switch', { name: 'Customize built-in wording' }),
    );
    const hint = await screen.findByRole('textbox', {
      name: 'Name box placeholder',
    });
    await waitFor(() => expect(hint).not.toHaveAttribute('readonly'));

    await harness.user.clear(hint);
    await harness.user.type(hint, 'Enter a name');
    await harness.user.tab();

    await waitFor(() =>
      expect(heldHint(harness)).toEqual({
        [FIXTURE_LANGUAGE]: 'Enter a name',
      }),
    );
  });

  it('keeps a shared word the default language leaves empty out of the protocol', async () => {
    const harness = mountComposer();
    await harness.user.click(
      await screen.findByRole('switch', { name: 'Customize built-in wording' }),
    );
    const hint = await screen.findByRole('textbox', {
      name: 'Name box placeholder',
    });
    await waitFor(() => expect(hint).not.toHaveAttribute('readonly'));

    await harness.user.clear(hint);
    await harness.user.tab();

    await waitFor(() => expect(hint).toHaveAccessibleDescription(/Required/));
    expect(heldHint(harness)).toEqual({ [FIXTURE_LANGUAGE]: SUPPLIED_HINT });
  });

  it('puts Network Canvas’s wording back when switched off, once the researcher agrees, holding none of it', async () => {
    const harness = mountComposer();
    const section = await screen.findByRole('switch', {
      name: 'Customize built-in wording',
    });
    await harness.user.click(section);
    const hint = await screen.findByRole('textbox', {
      name: 'Name box placeholder',
    });
    await waitFor(() => expect(hint).not.toHaveAttribute('readonly'));
    await harness.user.clear(hint);
    await harness.user.type(hint, 'Enter a name');
    await harness.user.tab();
    await waitFor(() =>
      expect(heldHint(harness)).toEqual({
        [FIXTURE_LANGUAGE]: 'Enter a name',
      }),
    );

    await harness.user.click(section);
    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Use Network Canvas’s wording',
      }),
    );

    // Network Canvas's wording is shown, not held, so the protocol holds none.
    await waitFor(() => expect(heldHint(harness)).toBeUndefined());
    expect(section).toHaveAttribute('aria-checked', 'false');
  });

  it('waits for a shared word still being written before switching off, and resets it', async () => {
    const { harness, release } = mountComposerWithHeldWrite();
    const section = await screen.findByRole('switch', {
      name: 'Customize built-in wording',
    });
    await harness.user.click(section);
    const hint = await screen.findByRole('textbox', {
      name: 'Name box placeholder',
    });
    await waitFor(() => expect(hint).not.toHaveAttribute('readonly'));
    await harness.user.clear(hint);
    await harness.user.type(hint, 'Enter a name');

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
    expect(heldHint(harness)).toBeUndefined();
  });

  it('keeps a shared word put back while the change before it is still being written', async () => {
    const { harness, release, applied } = mountComposerWithHeldWrite();
    await harness.user.click(
      await screen.findByRole('switch', { name: 'Customize built-in wording' }),
    );
    const hint = await screen.findByRole('textbox', {
      name: 'Name box placeholder',
    });
    await waitFor(() => expect(hint).not.toHaveAttribute('readonly'));

    // The first change is held on its way while the original words are put
    // back, which match what the protocol holds until that change lands.
    await harness.user.clear(hint);
    await harness.user.type(hint, 'Temporary wording');
    await harness.user.tab();
    await harness.user.click(hint);
    await harness.user.clear(hint);
    await harness.user.type(hint, SUPPLIED_HINT);
    await harness.user.tab();
    const before = applied();
    release();

    // Both writes land: the change, then the words put back after it.
    await waitFor(() => expect(applied()).toBe(before + 2));
    expect(heldHint(harness)).toBeUndefined();
    expect(hint).toHaveValue(SUPPLIED_HINT);
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

/**
 * A default language Network Canvas has no wording in (British English, where
 * its English is American) has nothing to put back: the researcher writes
 * that wording, so it is shown without a switch.
 */
describe('a protocol whose default language has no built-in wording', () => {
  it('shows the wording to write, with no switch to turn it off', async () => {
    renderStageEditor({
      stageId: 'network-composer-1',
      registry: networkComposerStageEditor,
      localization: { defaultLocale: 'en-GB', locales: ['en-GB'] },
    });

    expect(
      await screen.findByRole('textbox', { name: 'Name box placeholder' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('switch', { name: 'Customize built-in wording' }),
    ).not.toBeInTheDocument();
  });
});
