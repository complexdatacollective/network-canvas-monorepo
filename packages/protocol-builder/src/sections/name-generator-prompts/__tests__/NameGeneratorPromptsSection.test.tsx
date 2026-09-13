import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { attributeField } from '../../../testing/attributePicker.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import NameGeneratorPromptsSection from '../NameGeneratorPromptsSection.tsx';

/**
 * The prompt text is a rich-text editor, and its editing surface cannot be
 * driven in jsdom: ProseMirror places the caret through `elementFromPoint` and
 * `getClientRects`, neither of which jsdom implements, so typing throws rather
 * than producing text. A plain input carrying the same value keeps these tests
 * about what they are for — the list around the row, the stamps inside it, and
 * what reaches the stage — and the editor itself is covered by its own test.
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

const prompts = <NameGeneratorPromptsSection />;

type Harness = ReturnType<typeof renderStageEditor>;

/**
 * A prompt's open dialog, with the element it was found as.
 *
 * The element is carried because the attribute picker opens a SECOND dialog on
 * top of this one, so "the dialog" is ambiguous while its window is up: the
 * window is the one that is not this element.
 */
type OpenDialog = ReturnType<typeof within> & { element: HTMLElement };

const openPrompt = async (
  harness: Harness,
  name: string,
): Promise<OpenDialog> => {
  await harness.user.click(screen.getByRole('button', { name }));
  const element = await screen.findByRole('dialog');
  return Object.assign(within(element), { element });
};

/** The field a stamp row picks its attribute in. */
const STAMP_PICKER = 'Create or select an attribute';

/** The two names the attribute picker's trigger goes by, before and after. */
const isPickerTrigger = (name: string) =>
  name === 'Select attribute' || name === 'Change attribute';

const stampPicker = (dialog: OpenDialog): HTMLElement =>
  attributeField(STAMP_PICKER, dialog.element);

/** Opens the stamp row's picker, and hands back the window it opened. */
const openPicker = async (
  harness: Harness,
  dialog: OpenDialog,
): Promise<HTMLElement> => {
  await harness.user.click(
    within(stampPicker(dialog)).getByRole('button', { name: isPickerTrigger }),
  );
  return await waitFor(() => {
    const window = screen
      .getAllByRole('dialog')
      .find((element) => element !== dialog.element);
    if (window === undefined) {
      throw new Error('the attribute window did not open');
    }
    return window;
  });
};

const expectWindowClosed = async (window: HTMLElement) => {
  await waitFor(() => {
    if (window.isConnected) throw new Error('the attribute window is open');
  });
};

/** Every attribute the window is offering, by the id choosing it would store. */
const offeredIds = (window: HTMLElement): string[] =>
  [...window.querySelectorAll('[role="option"]')].map(
    (row) => row.getAttribute('data-attribute-id') ?? '',
  );

/** Points the stamp row at the attribute the codebook files under this id. */
const chooseStamp = async (
  harness: Harness,
  dialog: OpenDialog,
  attributeId: string,
) => {
  const window = await openPicker(harness, dialog);
  const row = window.querySelector<HTMLElement>(
    `[role="option"][data-attribute-id="${attributeId}"]`,
  );
  if (row === null) {
    throw new Error(`The window is not offering "${attributeId}".`);
  }
  await harness.user.click(row);
  // The pick is written as the window closes, so nothing may carry on while it
  // is still covering the row.
  await expectWindowClosed(window);
};

/** The search box a name is typed into, which is also where one is invented. */
const searchBox = (window: HTMLElement): HTMLElement =>
  within(window).getByRole('searchbox', {
    name: 'Find or create an attribute',
  });

const personDefinition = (variables: Record<string, unknown>) => ({
  name: 'person',
  color: 'node-color-seq-1',
  icon: 'add-a-person',
  shape: { default: 'circle' },
  variables,
});

describe("a name generator's prompts", () => {
  it('shows what the stage asks, and saves it unchanged', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: prompts,
    });

    expect(
      await screen.findByText('Who are the people you know?'),
    ).toBeInTheDocument();
    // The stage's name, the type it nominates, and its add-a-person form
    // belong to sections this mount does not include.
    await harness.roundTrip({ unowned: ['label', 'subject', 'form'] });
  });

  it('records the question the researcher wrote', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: prompts,
    });

    const dialog = await openPrompt(harness, 'Create new prompt');
    await harness.user.type(
      dialog.getByRole('textbox', { name: 'Prompt text' }),
      'And who else?',
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));
    await screen.findByText('And who else?');

    const request = await harness.submit();
    const rows = request?.stageDocument.prompts;
    expect(Array.isArray(rows) && rows.at(-1)).toEqual({
      id: expect.any(String) as unknown as string,
      text: 'And who else?',
    });
  });

  it('stamps the attribute the researcher chose on the people it names', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: prompts,
    });

    const dialog = await openPrompt(harness, 'Edit prompt');
    await harness.user.click(
      dialog.getByRole('button', { name: 'Add new attribute to assign' }),
    );
    await chooseStamp(harness, dialog, 'highlighted');
    await harness.user.click(dialog.getByRole('radio', { name: 'True' }));
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    const rows = request?.stageDocument.prompts;
    expect(Array.isArray(rows) && rows[0]).toMatchObject({
      additionalAttributes: [{ variable: 'highlighted', value: true }],
    });
  });

  /**
   * A stamp writes its value straight onto the node, so it may not name an
   * attribute a form collects — the export would otherwise mix validated and
   * unvalidated answers under one name. `name` is collected by this stage's
   * own form; `flagged` by the alter form elsewhere in the protocol.
   */
  it('does not offer an attribute a form already collects', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: prompts,
    });

    const dialog = await openPrompt(harness, 'Edit prompt');
    await harness.user.click(
      dialog.getByRole('button', { name: 'Add new attribute to assign' }),
    );
    const offered = offeredIds(await openPicker(harness, dialog));

    expect(offered).toContain('highlighted');
    expect(offered).not.toContain('name');
    expect(offered).not.toContain('flagged');
  });

  /**
   * A half-finished stamp survives every rule the row itself can run — a row
   * is not a registered field, so its errors can only be displayed — and
   * reaches the protocol as `{ variable: 'x' }`, which the schema refuses long
   * after the researcher has moved on.
   */
  it('refuses a stamp with no value chosen', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: prompts,
    });

    const dialog = await openPrompt(harness, 'Edit prompt');
    await harness.user.click(
      dialog.getByRole('button', { name: 'Add new attribute to assign' }),
    );
    await chooseStamp(harness, dialog, 'highlighted');
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));

    expect(
      await dialog.findByText(
        'Every additional attribute needs both an attribute and a value.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  /**
   * The codebook is not this stage's section, so a collaborator may add an
   * attribute to it while this stage is open. It has to reach the picker,
   * which subscribes to the codebook where it renders rather than reading a
   * copy the stage editor took when it opened.
   */
  it('offers an attribute another session added', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: prompts,
    });

    harness.receiveCodebookUpdate({
      node: {
        person: personDefinition({
          name: { name: 'name', type: 'text', component: 'Text' },
          highlighted: {
            name: 'highlighted',
            type: 'boolean',
            component: 'Boolean',
          },
          contacted: { name: 'contacted', type: 'boolean' },
        }),
      },
    });

    const dialog = await openPrompt(harness, 'Edit prompt');
    await harness.user.click(
      dialog.getByRole('button', { name: 'Add new attribute to assign' }),
    );
    const window = await openPicker(harness, dialog);
    // The revision reaches the picker over the protocol channel, which is a
    // microtask rather than the click that opened the dialog.
    await waitFor(() => expect(offeredIds(window)).toContain('contacted'));
  });

  /**
   * Cancelling a row dialog is a real answer — "leave this prompt as it was" —
   * and nothing typed in it may reach the stage.
   */
  it('leaves the prompt untouched when the dialog is cancelled', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: prompts,
    });

    const dialog = await openPrompt(harness, 'Edit prompt');
    const text = dialog.getByRole('textbox', { name: 'Prompt text' });
    await harness.user.clear(text);
    await harness.user.type(text, 'Something else entirely');
    await harness.user.click(dialog.getByRole('button', { name: 'Cancel' }));
    // Closing an edited row asks before throwing the edit away, so the answer
    // is part of what "cancelled" means here.
    await harness.user.click(
      await screen.findByRole('button', { name: 'Discard changes' }),
    );
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    expect(
      screen.getByText('Who are the people you know?'),
    ).toBeInTheDocument();
    await harness.roundTrip({ unowned: ['label', 'subject', 'form'] });
  });

  /**
   * A stamp is a flag, and the flag a researcher wants to set almost never
   * exists yet — deciding to mark these people is the same thought as
   * inventing the attribute to mark them with. Architect offers it on every
   * attribute row, so a researcher who has to leave the prompt, open the
   * codebook and come back has been sent away by this builder alone.
   *
   * The attribute is committed to the codebook as it is created, under the
   * codebook's own lock, so it is in the protocol before the stage that
   * references it is saved — and stays there whatever this stage edit does
   * next.
   */
  it('creates the boolean attribute a stamp needs, and selects it', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: prompts,
    });

    const dialog = await openPrompt(harness, 'Edit prompt');
    await harness.user.click(
      dialog.getByRole('button', { name: 'Add new attribute to assign' }),
    );
    // Looking for the attribute and finding it does not exist are one act, so
    // the name is typed into the window's search box and invented from there.
    const window = await openPicker(harness, dialog);
    await harness.user.type(searchBox(window), 'nominated_early');
    await harness.user.click(
      within(window).getByRole('option', {
        name: 'Create new attribute called “nominated_early”.',
      }),
    );
    // A create that landed closes the window, and the row now shows what it
    // holds: the attribute the researcher has just invented.
    await expectWindowClosed(window);
    expect(
      within(stampPicker(dialog)).getByText('nominated_early'),
    ).toBeInTheDocument();

    // A stamp is written straight onto the node, so it has to be a boolean
    // the interview can set — the type is the section's, not the researcher's.
    // Read from the protocol rather than from the picker: the attribute is
    // already committed, and nothing this stage saves later can add it. The id
    // it was filed under is the codebook's to choose, so the stamp below is
    // compared against whatever the codebook says it is.
    const variables = harness.hostCodebook().node?.person?.variables ?? {};
    const [created] =
      Object.entries(variables).find(
        ([, variable]) => variable.name === 'nominated_early',
      ) ?? [];
    if (created === undefined) {
      throw new Error('nominated_early was not added to the codebook');
    }
    expect(variables[created]).toMatchObject({
      name: 'nominated_early',
      type: 'boolean',
    });

    await harness.user.click(dialog.getByRole('radio', { name: 'True' }));
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    const request = await harness.submit();
    const rows = request?.stageDocument.prompts;
    expect(Array.isArray(rows) && rows[0]).toMatchObject({
      additionalAttributes: [{ variable: created, value: true }],
    });
  });

  /**
   * A row is handed a variable id or nothing, so it cannot carry a refusal —
   * and a create that quietly did nothing leaves the researcher pressing the
   * button again. So the refusal is shown, and it says what the researcher has
   * to change: the name they typed has a space in it, and the codebook stores
   * names that become XML element names and CSV column headers.
   *
   * The exact sentence the row cell, the entity editor and the request builder
   * all use for that rule (`allowedNameMessage`), rather than the schema's own
   * words — an `InvalidCodebookDraftError` says "the variable draft is
   * invalid", which is written for whoever reads a log and names nothing the
   * researcher can act on.
   *
   * And the name stays in the box. The refusal is ABOUT the name they typed,
   * so it is the one thing they need in front of them to act on it.
   */
  it('says why an attribute it could not create was not created', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: prompts,
    });

    const dialog = await openPrompt(harness, 'Edit prompt');
    await harness.user.click(
      dialog.getByRole('button', { name: 'Add new attribute to assign' }),
    );
    const window = await openPicker(harness, dialog);
    const box = searchBox(window);
    await harness.user.type(box, 'nominated early');

    // Said on the row that would have created it, which is switched off rather
    // than offering a write the codebook is going to refuse.
    const refused = within(window).getByRole('option', {
      name: 'Cannot create attribute named “nominated early”: only letters, numbers and the symbols ._-: can be used in a name',
    });
    expect(refused).toHaveAttribute('aria-disabled', 'true');
    await harness.user.click(refused);

    // The name stays in the box: the refusal is ABOUT that name, and it is the
    // one thing the researcher needs in front of them to act on it.
    expect(box).toHaveValue('nominated early');

    // And the row is still holding nothing. Read with the window dismissed,
    // because the window takes the surface underneath it out of the
    // accessibility tree while it is up.
    await harness.user.keyboard('{Escape}');
    await expectWindowClosed(window);
    expect(
      within(stampPicker(dialog)).getByRole('button', {
        name: 'Select attribute',
      }),
    ).toBeInTheDocument();
  });
});
