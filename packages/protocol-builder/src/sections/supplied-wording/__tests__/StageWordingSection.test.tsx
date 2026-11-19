import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { selectIsFormDirty } from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { InterfaceTextUpdate } from '@codaco/protocol-validation';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { familyPedigreeStageEditor } from '../../../editors/family-pedigree/FamilyPedigreeStageEditor.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { sharedWording } from '../sharedWording.tsx';

const FIXTURE_LANGUAGE = 'en-US';
const SETTINGS = sectionId({ kind: 'settings' });
const COMPOSER_STAGE = sectionId({
  kind: 'stage',
  stageId: 'network-composer-1',
});
const SUPPLIED_HINT = 'Type a name, then press Enter';
/** The placeholder as the shared protocol saves it, before any test. */
const SAVED_HINT = { [FIXTURE_LANGUAGE]: SUPPLIED_HINT };

const ComposerWording = sharedWording('NetworkComposer');

/**
 * Whether the stage form holds unsaved work, read from inside it with the
 * selector a host's discard prompt reads.
 */
function DirtyFlag() {
  const dirty = useFormStore(selectIsFormDirty);
  return <p data-testid="form-dirty">{dirty ? 'dirty' : 'clean'}</p>;
}

const formIsDirty = () =>
  screen.getByTestId('form-dirty').textContent === 'dirty';

/**
 * The Network Composer's wording section, which holds only shared words, with
 * every shared word each save carried recorded by attempt.
 */
const mountComposer = () => {
  const sent: (readonly InterfaceTextUpdate[])[] = [];
  const harness = renderStageEditor({
    stageId: 'network-composer-1',
    sections: (
      <>
        <ComposerWording />
        <DirtyFlag />
      </>
    ),
    adapter: (host) =>
      host.adapterWith({
        Submit: (input) => {
          sent.push(input.interfaceText ?? []);
          return host.handle.Submit(input);
        },
      }),
  });
  return { harness, sent };
};

type Harness = ReturnType<typeof mountComposer>['harness'];

/** One shared word as the protocol holds it. */
const heldWord = (harness: Harness, group: string, key: string): unknown => {
  const settings = harness.protocolSections()[SETTINGS];
  const interfaceText = settings?.interfaceText as
    | Readonly<Record<string, Readonly<Record<string, unknown>>>>
    | undefined;
  return interfaceText?.[group]?.[key];
};

/** The Network Composer's name box placeholder as the protocol holds it. */
const heldHint = (harness: Harness): unknown =>
  heldWord(harness, 'networkComposer', 'addNamePlaceholder');

/** Turns the section on and answers with its name box placeholder field. */
const openHint = async (harness: Harness) => {
  const section = await screen.findByRole('switch', {
    name: 'Customize built-in wording',
  });
  if (section.getAttribute('aria-checked') !== 'true') {
    await harness.user.click(section);
  }
  const hint = await screen.findByRole('textbox', {
    name: 'Name box placeholder',
  });
  await waitFor(() => expect(hint).not.toHaveAttribute('readonly'));
  return { section, hint };
};

/**
 * The words every stage of a kind shares, edited where the stage is: a stage
 * with nothing of its own to word shows them straight away, without the parts
 * a stage holding both opens and closes. A change to one is part of the
 * stage's draft like any other change made in the stage editor: held while
 * the stage is open, saved with it, and thrown away with it.
 */
describe('a stage whose only built-in wording is shared', () => {
  it('shows the shared words without a part for the stage’s own', async () => {
    const harness = renderStageEditor({
      stageId: 'network-composer-1',
      sections: <ComposerWording />,
    });
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

  it('holds a changed shared word in the stage’s draft, and writes it only with the stage', async () => {
    const { harness, sent } = mountComposer();
    const { hint } = await openHint(harness);
    expect(formIsDirty()).toBe(false);

    await harness.user.clear(hint);
    await harness.user.type(hint, 'Enter a name');
    await harness.user.tab();

    // Left, and still only the stage's: the form is unsaved, the protocol has
    // not been written.
    expect(formIsDirty()).toBe(true);
    expect(heldHint(harness)).toEqual(SAVED_HINT);
    expect(sent).toEqual([]);

    const before = harness.host.store.read(SETTINGS).revision.sequence;
    expect(await harness.submit()).not.toBeNull();

    expect(sent).toEqual([
      [
        {
          group: 'networkComposer',
          key: 'addNamePlaceholder',
          value: { [FIXTURE_LANGUAGE]: 'Enter a name' },
        },
      ],
    ]);
    expect(heldHint(harness)).toEqual({ [FIXTURE_LANGUAGE]: 'Enter a name' });
    const settings = harness.host.store.read(SETTINGS).revision.sequence;
    expect(settings).toBeGreaterThan(before);
    expect(settings).toBe(
      harness.host.store.read(COMPOSER_STAGE).revision.sequence,
    );
    await waitFor(() => expect(formIsDirty()).toBe(false));
  });

  it('throws a changed shared word away when the editor is cancelled', async () => {
    const { harness, sent } = mountComposer();
    const { hint } = await openHint(harness);
    await harness.user.clear(hint);
    await harness.user.type(hint, 'Enter a name');
    await harness.user.tab();
    expect(formIsDirty()).toBe(true);

    await harness.cancel();

    expect(heldHint(harness)).toEqual(SAVED_HINT);
    expect(sent).toEqual([]);
  });

  it('holds no change once a shared word is put back as the protocol has it', async () => {
    const { harness, sent } = mountComposer();
    const { hint } = await openHint(harness);
    // Saved once, so the protocol holds the researcher's own wording for it.
    await harness.user.clear(hint);
    await harness.user.type(hint, 'Enter a name');
    expect(await harness.submit()).not.toBeNull();
    await waitFor(() => expect(formIsDirty()).toBe(false));

    await harness.user.clear(hint);
    await harness.user.type(hint, 'Temporary wording');
    await harness.user.tab();
    expect(formIsDirty()).toBe(true);
    await harness.user.clear(hint);
    await harness.user.type(hint, 'Enter a name');
    await harness.user.tab();

    expect(formIsDirty()).toBe(false);
    expect(await harness.submit()).not.toBeNull();
    expect(sent.at(-1)).toEqual([]);
    expect(heldHint(harness)).toEqual({ [FIXTURE_LANGUAGE]: 'Enter a name' });
  });

  it('refuses the stage save over a shared word the default language leaves empty', async () => {
    const { harness, sent } = mountComposer();
    const { hint } = await openHint(harness);

    await harness.user.clear(hint);
    await harness.user.tab();
    await waitFor(() => expect(hint).toHaveAccessibleDescription(/Required/));

    expect(await harness.submit()).toBeNull();
    expect(sent).toEqual([]);
    expect(heldHint(harness)).toEqual(SAVED_HINT);
  });

  it('puts Network Canvas’s wording back when switched off, once the researcher agrees, as part of the stage’s draft', async () => {
    const { harness, sent } = mountComposer();
    const { section, hint } = await openHint(harness);
    await harness.user.clear(hint);
    await harness.user.type(hint, 'Enter a name');
    expect(await harness.submit()).not.toBeNull();
    expect(heldHint(harness)).toEqual({ [FIXTURE_LANGUAGE]: 'Enter a name' });
    await waitFor(() => expect(formIsDirty()).toBe(false));

    await harness.user.click(section);
    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Use Network Canvas’s wording',
      }),
    );
    await waitFor(() =>
      expect(section).toHaveAttribute('aria-checked', 'false'),
    );

    // Put back in the stage's draft, not written.
    expect(formIsDirty()).toBe(true);
    expect(heldHint(harness)).toEqual({ [FIXTURE_LANGUAGE]: 'Enter a name' });

    expect(await harness.submit()).not.toBeNull();
    expect(sent.at(-1)).toEqual([
      {
        group: 'networkComposer',
        key: 'addNamePlaceholder',
        value: { [FIXTURE_LANGUAGE]: SUPPLIED_HINT },
      },
    ]);
    // Network Canvas's wording is shown, not held, so the protocol holds none.
    expect(heldHint(harness)).toBeUndefined();
  });

  it('keeps the protocol’s wording when the editor is cancelled after switching off', async () => {
    const { harness } = mountComposer();
    const { section, hint } = await openHint(harness);
    await harness.user.clear(hint);
    await harness.user.type(hint, 'Enter a name');
    expect(await harness.submit()).not.toBeNull();

    await harness.user.click(section);
    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Use Network Canvas’s wording',
      }),
    );
    await waitFor(() =>
      expect(section).toHaveAttribute('aria-checked', 'false'),
    );
    await harness.cancel();

    expect(heldHint(harness)).toEqual({ [FIXTURE_LANGUAGE]: 'Enter a name' });
  });
});

describe('a stage whose shared wording comes in several groups', () => {
  it('saves a shared word of each group with the stage', async () => {
    const harness = renderStageEditor({
      stageId: 'family-pedigree-1',
      registry: familyPedigreeStageEditor,
    });
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

    await harness.user.clear(wholeFamily);
    await harness.user.type(wholeFamily, 'Everyone');
    await harness.user.clear(pointer);
    await harness.user.type(pointer, 'Choose a relative');
    await harness.user.tab();
    expect(heldWord(harness, 'familyTreeView', 'showWholeFamily')).toEqual({
      [FIXTURE_LANGUAGE]: 'Show the whole family',
    });

    expect(await harness.submit()).not.toBeNull();

    expect(heldWord(harness, 'familyTreeView', 'showWholeFamily')).toEqual({
      [FIXTURE_LANGUAGE]: 'Everyone',
    });
    expect(
      heldWord(harness, 'familyPedigree', 'pointerToolDescription'),
    ).toEqual({ [FIXTURE_LANGUAGE]: 'Choose a relative' });
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
      sections: <ComposerWording />,
      localization: { defaultLocale: 'en-GB', locales: ['en-GB'] },
    });

    expect(
      await screen.findByRole('textbox', { name: 'Name box placeholder' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('switch', { name: 'Customize built-in wording' }),
    ).not.toBeInTheDocument();
  });

  it('saves the stage without the shared wording it has not touched', async () => {
    const harness = renderStageEditor({
      stageId: 'network-composer-1',
      sections: <ComposerWording />,
      localization: { defaultLocale: 'en-GB', locales: ['en-GB'] },
    });
    await screen.findByRole('textbox', { name: 'Name box placeholder' });

    expect(await harness.submit()).not.toBeNull();
  });
});
