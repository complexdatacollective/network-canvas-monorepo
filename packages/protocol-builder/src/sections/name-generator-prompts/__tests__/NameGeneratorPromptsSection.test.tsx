import {
  type BoundFunctions,
  type queries,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { sectionId } from '@codaco/studio-sync/taxonomy';

import { attributeField } from '../../../testing/attributePicker.ts';
import { loadFixtureStage } from '../../../testing/protocolFixture.ts';
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

const en = (text: string) => ({ 'en-US': text });

type Harness = ReturnType<typeof renderStageEditor>;

/**
 * A prompt's open dialog, with the element it was found as.
 *
 * The element is carried because the attribute picker opens a SECOND dialog on
 * top of this one, so "the dialog" is ambiguous while its window is up: the
 * window is the one that is not this element.
 */
type OpenDialog = BoundFunctions<typeof queries> & { element: HTMLElement };

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
    await harness.roundTrip({ unowned: ['subject', 'form'] });
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
      text: en('And who else?'),
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
          name: {
            name: 'name',
            type: 'text',
            component: 'Text',
          },
          highlighted: {
            name: 'highlighted',
            type: 'boolean',
            component: 'Boolean',
          },
          contacted: {
            name: 'contacted',
            type: 'boolean',
          },
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
    await harness.roundTrip({ unowned: ['subject', 'form'] });
  });

  /**
   * A stamp is a flag, and the flag a researcher wants to set almost never
   * exists yet — deciding to mark these people is the same thought as
   * inventing the attribute to mark them with. Architect offers it on every
   * attribute row, so a researcher who has to leave the prompt, open the
   * codebook and come back has been sent away by this builder alone.
   *
   * The attribute is held with the prompt's dialog as it is created, joins
   * the stage's draft when the prompt is saved, and reaches the protocol in
   * the same revision as the stage that references it — so a stage that is
   * never saved leaves no attribute behind either.
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

    await harness.user.click(dialog.getByRole('radio', { name: 'True' }));
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    // A stamp is written straight onto the node, so it has to be a boolean
    // the interview can set — the type is the section's, not the researcher's.
    // Read from what the editor holds once the prompt is saved: the attribute
    // joined the stage's draft with it, and is not in the protocol until the
    // stage is. The id it was filed under is the codebook's to choose, so the
    // stamp below is compared against whatever the codebook says it is.
    const variables = harness.editorCodebook().node?.person?.variables ?? {};
    const [created] =
      Object.entries(variables).find(
        ([, variable]) => variable.name === 'nominated_early',
      ) ?? [];
    if (created === undefined) {
      throw new Error('nominated_early was not added to the stage draft');
    }
    expect(variables[created]).toMatchObject({
      name: 'nominated_early',
      type: 'boolean',
    });
    expect(
      Object.values(harness.hostCodebook().node?.person?.variables ?? {}).map(
        (variable) => variable.name,
      ),
    ).not.toContain('nominated_early');

    const request = await harness.submit();
    expect(
      harness.hostCodebook().node?.person?.variables?.[created],
    ).toMatchObject({ name: 'nominated_early', type: 'boolean' });
    const rows = request?.stageDocument.prompts;
    expect(Array.isArray(rows) && rows[0]).toMatchObject({
      additionalAttributes: [{ variable: created, value: true }],
    });
  });

  /**
   * A row is handed a variable id or nothing, so it cannot carry a refusal —
   * and a create that quietly did nothing leaves the researcher pressing the
   * button again. So the refusal is shown, and it says what the researcher has
   * to change: the name they typed would be exported to a column that another
   * attribute's option already has.
   *
   * The exact sentence the picker's create row, the pill rename and the
   * codebook write all use for that rule (`exportColumnRefusals`), rather than
   * the schema's own words — an `InvalidCodebookDraftError` says "the variable
   * draft is invalid", which is written for whoever reads a log and names
   * nothing the researcher can act on.
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
    await harness.user.type(box, 'contactType_call');

    // Said on the row that would have created it, which is switched off rather
    // than offering a write the codebook is going to refuse.
    const refused = within(window).getByRole('option', {
      name: 'Cannot create attribute named “contactType_call”: The export already has a column called “contactType_call” for option “call” of the attribute “contactType”. Choose a different name.',
    });
    expect(refused).toHaveAttribute('aria-disabled', 'true');
    await harness.user.click(refused);

    // The name stays in the box: the refusal is ABOUT that name, and it is the
    // one thing the researcher needs in front of them to act on it.
    expect(box).toHaveValue('contactType_call');

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

  /**
   * The other refusal — the host's, not the schema's — comes with the save.
   *
   * A colleague holding the section the attribute would be written into cannot
   * stop it being invented: nothing is locked while it is only held in the
   * stage's draft, so the window closes on it as for anyone. What the stage
   * SAVE has to lock is refused, naming the holder, and the attribute stays
   * held for the retry.
   */
  it('keeps an attribute a colleague’s hold would refuse, and says so when the stage is saved', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: prompts,
      heldSections: [
        {
          sectionId: sectionId({ kind: 'codebookNode', typeId: 'person' }),
          displayName: 'Priya Raman',
        },
      ],
    });

    const dialog = await openPrompt(harness, 'Edit prompt');
    await harness.user.click(
      dialog.getByRole('button', { name: 'Add new attribute to assign' }),
    );
    const window = await openPicker(harness, dialog);
    await harness.user.type(searchBox(window), 'nominatedEarly');
    await harness.user.click(
      within(window).getByRole('option', {
        name: 'Create new attribute called “nominatedEarly”.',
      }),
    );
    await expectWindowClosed(window);
    await harness.user.click(dialog.getByRole('radio', { name: 'True' }));
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    expect(await harness.submit()).toBeNull();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Priya Raman is currently editing a section needed for this change.',
    );
    expect(
      Object.values(harness.hostCodebook().node?.person?.variables ?? {}).map(
        (variable) => variable.name,
      ),
    ).not.toContain('nominatedEarly');
    expect(
      Object.values(harness.editorCodebook().node?.person?.variables ?? {}).map(
        (variable) => variable.name,
      ),
    ).toContain('nominatedEarly');
  });
});

describe("a name generator prompt's preview", () => {
  it('shows the values its text fills in, and its versions, as pills', async () => {
    const { type, fields } = loadFixtureStage('name-generator-1');
    renderStageEditor({
      stage: {
        type,
        fields: {
          ...fields,
          dynamicValues: { today: { path: 'now' } },
          prompts: [
            {
              id: 'dated',
              text: en(
                'Who did you see **{today}**? {today, select, missing {Anyone} other {Everyone}}',
              ),
            },
          ],
        },
      },
      sections: prompts,
    });

    await waitFor(() =>
      expect(
        document.querySelector('strong [data-token="today"]'),
      ).toHaveTextContent('Today’s date'),
    );
    // Outside the editor a value's versions fold into its pill.
    expect(
      document.querySelectorAll('[data-token="today"]').length,
    ).toBeGreaterThan(1);
    expect(screen.queryByText('Everyone')).not.toBeInTheDocument();
    expect(screen.queryByText(/\{today/)).not.toBeInTheDocument();
  });
});
