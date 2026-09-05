import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import NameGeneratorPromptsSection from '../NameGeneratorPromptsSection.tsx';

/**
 * The prompt text is a rich-text editor, and its editing surface cannot be
 * driven in jsdom: ProseMirror places the caret through `elementFromPoint` and
 * `getClientRects`, neither of which jsdom implements, so typing throws rather
 * than producing text. A plain input carrying the same value keeps these tests
 * about what they are for — the list around the row, the stamps inside it, and
 * what reaches the stage — and the editor itself is covered by its own test.
 */
vi.mock('../../fields/RichTextField.tsx', () => ({
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

const openPrompt = async (
  harness: ReturnType<typeof renderStageEditor>,
  name: string,
) => {
  await harness.user.click(screen.getByRole('button', { name }));
  return within(await screen.findByRole('dialog'));
};

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
    await harness.user.selectOptions(
      await dialog.findByRole('combobox', {
        name: 'Create or select an attribute',
      }),
      'highlighted',
    );
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
    const picker = await dialog.findByRole('combobox', {
      name: 'Create or select an attribute',
    });
    const offered = within(picker)
      .getAllByRole('option')
      .map((option) => (option as HTMLOptionElement).value);

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
    await harness.user.selectOptions(
      await dialog.findByRole('combobox', {
        name: 'Create or select an attribute',
      }),
      'highlighted',
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));

    expect(
      await dialog.findByText(
        'Every additional attribute needs both an attribute and a value.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  /**
   * A collaborator adding an attribute is not this session's edit. It has to
   * reach the picker, and it must not be echoed back as a command of ours —
   * doing so would write their change into this stage's pending batches and
   * save it as ours.
   */
  it('offers an attribute another session added, without claiming it', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: prompts,
    });

    const before = harness.pendingCommands().length;
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
    const picker = await dialog.findByRole('combobox', {
      name: 'Create or select an attribute',
    });
    expect(
      within(picker)
        .getAllByRole('option')
        .map((option) => (option as HTMLOptionElement).value),
    ).toContain('contacted');
    expect(harness.pendingCommands()).toHaveLength(before);
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
});
