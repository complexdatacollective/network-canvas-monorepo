import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { contentHash } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { FIXTURE_SESSION_OWNER } from '../../testing/fixtureSession.ts';
import { loadFixtureStage } from '../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import FormFieldsSection from '../FormFieldsSection.tsx';

/**
 * The question and hint are rich-text editors, and their editing surface
 * cannot be driven in jsdom: ProseMirror places the caret through
 * `elementFromPoint` and `getClientRects`, neither of which jsdom implements,
 * so typing throws rather than producing text. A plain input carrying the same
 * value keeps these tests about what they are for — the list, the attribute
 * binding, and what reaches the stage — and the editor has its own test.
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

/** Opens a row's editor. Several rows carry the same affordance, so which. */
const openField = async (
  harness: ReturnType<typeof renderStageEditor>,
  name: string,
  index = 0,
) => {
  const trigger = screen.getAllByRole('button', { name })[index];
  if (trigger === undefined) throw new Error(`There is no "${name}" ${index}.`);
  await harness.user.click(trigger);
  return within(await screen.findByRole('dialog'));
};

const offeredAttributes = (dialog: ReturnType<typeof within>) =>
  within(dialog.getByRole('combobox', { name: 'Attribute' }))
    .getAllByRole('option')
    .map((option) => (option as HTMLOptionElement).value);

/**
 * Fills in a field that collects an attribute nobody has declared yet, and
 * submits the row. The dialog is answered with, because whether it closes is
 * the whole question when the codebook write it depends on can be refused.
 */
const addInventedNickname = async (
  harness: ReturnType<typeof renderStageEditor>,
) => {
  const dialog = await openField(harness, 'Create new form field');
  await harness.user.selectOptions(
    dialog.getByRole('combobox', { name: 'Attribute' }),
    '__create_new_attribute__',
  );
  await harness.user.type(
    await dialog.findByRole('textbox', { name: 'Attribute name' }),
    'nickname',
  );
  await harness.user.selectOptions(
    dialog.getByRole('combobox', { name: 'Kind of answer' }),
    'text',
  );
  await harness.user.type(
    dialog.getByRole('textbox', { name: 'Question text' }),
    'What do people call them?',
  );
  await harness.user.click(dialog.getByRole('button', { name: 'Add' }));
  return dialog;
};

/** The same invention, where the codebook write is expected to be accepted. */
const inventNickname = async (
  harness: ReturnType<typeof renderStageEditor>,
) => {
  await addInventedNickname(harness);
  await waitFor(() => expect(screen.queryAllByRole('dialog')).toHaveLength(0));
};

/** Renames the edited stage at the host, as a collaborator would. */
const renameStageElsewhere = (
  harness: ReturnType<typeof renderStageEditor>,
) => {
  const stageSection = sectionId({ kind: 'stage', stageId: harness.seeded.id });
  const sections = harness.host.getSnapshot().protocolSections;
  const result = harness.host.submit({
    id: 'collaborator-rename',
    description: 'Rename the stage from another session',
    edits: [
      {
        kind: 'update',
        sectionId: stageSection,
        expectedContentHash: contentHash(sections[stageSection] ?? {}),
        commands: [{ op: 'set', key: 'label', value: 'Renamed elsewhere' }],
      },
    ],
    authority: {
      sectionId: stageSection,
      leaseOwner: FIXTURE_SESSION_OWNER,
      leaseEpoch: 1n,
    },
  });
  if (result.status !== 'applied') {
    throw new Error('the collaborator’s rename did not apply');
  }
};

/** The attribute the invention above should have written, and its record id. */
const inventedNickname = (harness: ReturnType<typeof renderStageEditor>) => {
  const person =
    harness.host.getSnapshot().protocolSections['codebook:node:person'];
  const variables =
    typeof person === 'object' && person !== null
      ? Reflect.get(person, 'variables')
      : undefined;
  return Object.entries(
    (variables ?? {}) as Record<string, { name?: string; type?: string }>,
  ).find(([, variable]) => variable.name === 'nickname');
};

const fieldsOf = (
  request: Awaited<ReturnType<ReturnType<typeof renderStageEditor>['submit']>>,
): Record<string, unknown>[] => {
  const form = request?.stageDocument.form;
  const fields =
    typeof form === 'object' && form !== null
      ? Reflect.get(form, 'fields')
      : [];
  return Array.isArray(fields) ? (fields as Record<string, unknown>[]) : [];
};

describe('the fields a form collects', () => {
  it('shows what an alter form collects, and saves it unchanged', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    expect(
      await screen.findByText("What is this person's relationship to you?", {
        exact: false,
      }),
    ).toBeInTheDocument();
    // The stage's name, the type it collects about, and the screen shown
    // before it belong to sections this mount does not include.
    await harness.roundTrip({
      unowned: ['label', 'subject', 'introductionPanel'],
    });
  });

  it('records the question the researcher rewrote', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    const dialog = await openField(harness, 'Edit field');
    const question = dialog.getByRole('textbox', { name: 'Question text' });
    await harness.user.clear(question);
    await harness.user.type(question, 'How do you know this person?');
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    const fields = fieldsOf(await harness.submit());
    expect(fields[0]).toEqual({
      variable: 'relationship_to_ego',
      prompt: 'How do you know this person?',
    });
    // The field the researcher did not touch is still exactly as it was.
    expect(fields[1]).toEqual({
      variable: 'flagged',
      prompt: 'Does this person have this attribute?',
    });
  });

  it('binds a new field to the attribute the researcher chose', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    const dialog = await openField(harness, 'Create new form field');
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Attribute' }),
      'age',
    );
    await harness.user.type(
      dialog.getByRole('textbox', { name: 'Question text' }),
      'How old are they?',
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    // The id is the row's own identity, minted on add so a reorder or a
    // removal is committed as the operation it was.
    expect(fieldsOf(await harness.submit()).at(-1)).toEqual({
      id: expect.any(String) as unknown as string,
      variable: 'age',
      prompt: 'How old are they?',
    });
  });

  /**
   * A form is a VALIDATED writer: the participant's answer is checked against
   * the attribute's own rules. `highlighted` is written unvalidated elsewhere
   * in this protocol — a prompt stamps it — so collecting it here too would mix
   * checked and unchecked answers under one name in the export. `flagged` is
   * this form's own second field, and one form may not collect an attribute
   * twice.
   */
  it('does not offer an attribute this form or another stage already writes', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    const dialog = await openField(harness, 'Create new form field');
    const offered = offeredAttributes(dialog);

    expect(offered).toContain('age');
    expect(offered).not.toContain('highlighted');
    expect(offered).not.toContain('flagged');
  });

  /**
   * The picker hides a sibling's attribute, so this is the backstop for a
   * protocol that arrives already repeating one — an import, or a draft that
   * was legal when it was authored. Every field renders under its attribute's
   * name, so the second registration silently replaces the first: two
   * questions, one answer, and no sign of which was kept.
   */
  it('refuses to save a form that collects one attribute twice', async () => {
    const harness = renderStageEditor({
      stage: {
        id: 'repeats-an-attribute',
        type: 'AlterForm',
        fields: {
          label: 'Alter form',
          subject: { entity: 'node', type: 'person' },
          form: {
            fields: [
              {
                variable: 'relationship_to_ego',
                prompt: 'How do you know them?',
              },
              { variable: 'relationship_to_ego', prompt: 'And how else?' },
            ],
          },
        },
      },
      sections: <FormFieldsSection subject="node" />,
    });

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByText(
        'Two fields collect the same attribute. Each attribute may be collected once per form.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * A form with no fields collects nothing, and the schema says so too — as
   * "Too small: expected array to have >=1 items" against a path, long after
   * the researcher has moved on.
   */
  it('refuses to save a form with no fields left', async () => {
    const harness = renderStageEditor({
      stageId: 'ego-form-1',
      sections: <FormFieldsSection subject="ego" />,
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Remove field' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Remove field' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Edit field' }),
      ).not.toBeInTheDocument(),
    );

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByText(
        'Add at least one field. A form with no fields collects nothing.',
      ),
    ).toBeInTheDocument();
  });

  it("collects the participant's own attributes on an ego form, with no title to author", async () => {
    const harness = renderStageEditor({
      stageId: 'ego-form-1',
      sections: <FormFieldsSection subject="ego" />,
    });

    const dialog = await openField(harness, 'Edit field');
    expect(offeredAttributes(dialog)).toContain('ego_name');
    await harness.user.click(dialog.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    expect(
      screen.queryByRole('textbox', { name: 'Form title' }),
    ).not.toBeInTheDocument();
    // An ego form has no subject to own; its name and its introduction screen
    // belong to sections this mount does not include.
    await harness.roundTrip({ unowned: ['label', 'introductionPanel'] });
  });

  it("collects a relationship's attributes on an alter edge form", async () => {
    const harness = renderStageEditor({
      stageId: 'alter-edge-form-1',
      sections: <FormFieldsSection subject="edge" />,
    });

    const dialog = await openField(harness, 'Edit field');
    // The relationship's own attributes, and none of a person's: which
    // codebook a form reads is the whole of what `subject` decides.
    const offered = offeredAttributes(dialog);
    expect(offered).toContain('edgeNotes');
    expect(offered).not.toContain('name');
    await harness.user.click(dialog.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    // The stage's name, the relationship it collects about, and the screen
    // shown before it belong to sections this mount does not include.
    await harness.roundTrip({
      unowned: ['label', 'subject', 'introductionPanel'],
    });
  });

  it("authors the heading shown above a name generator's form, and needs one", async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: <FormFieldsSection subject="node" hasTitle />,
    });

    const title = await screen.findByRole('textbox', { name: 'Form title' });
    expect(title).toHaveValue('Add a person');

    await harness.user.clear(title);
    expect(await harness.submit()).toBeNull();

    await harness.user.type(title, 'Add someone you know');
    const request = await harness.submit();
    expect(request?.stageDocument.form).toMatchObject({
      title: 'Add someone you know',
    });
  });

  /**
   * Reordering is committed as the move it actually was, so both rows survive
   * it whole — a list rewritten wholesale would lose whichever key the section
   * happened not to render.
   */
  it('keeps both fields whole when they are reordered', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    const handle = screen.getByRole('button', { name: 'Reorder field 1 of 2' });
    handle.focus();
    await harness.user.keyboard('{ArrowDown}');

    const fields = fieldsOf(await harness.submit());
    expect(fields.map((field) => field.variable)).toEqual([
      'flagged',
      'relationship_to_ego',
    ]);
    expect(fields[1]).toEqual({
      variable: 'relationship_to_ego',
      prompt: "What is this person's relationship to you?",
    });
  });

  /**
   * A collaborator adding an attribute is not this session's edit. It has to
   * reach the picker, and it must not be echoed back as a command of ours —
   * doing so would write their change into this stage's pending batches and
   * save it as ours.
   */
  it('offers an attribute another session added, without claiming it', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    const before = harness.pendingCommands().length;
    harness.receiveCodebookUpdate({
      node: {
        person: {
          name: 'person',
          color: 'node-color-seq-1',
          icon: 'add-a-person',
          shape: { default: 'circle' },
          variables: {
            relationship_to_ego: {
              name: 'relationship_to_ego',
              type: 'text',
              component: 'Text',
            },
            flagged: { name: 'flagged', type: 'boolean', component: 'Boolean' },
            nickname: { name: 'nickname', type: 'text', component: 'Text' },
          },
        },
      },
    });

    const dialog = await openField(harness, 'Create new form field');
    expect(offeredAttributes(dialog)).toContain('nickname');
    expect(harness.pendingCommands()).toHaveLength(before);
  });

  /**
   * An attribute nobody has declared yet needs two writes — one to the
   * codebook, one to the stage — and the codebook half goes first, because it
   * is the one that can be refused. Both must land, or a field would reference
   * an attribute that was never written.
   */
  it('creates the attribute a field invents, and binds the field to it', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    await inventNickname(harness);

    const created = inventedNickname(harness);
    expect(created?.[1]).toMatchObject({ name: 'nickname', type: 'text' });

    expect(fieldsOf(await harness.submit()).at(-1)).toEqual({
      id: expect.any(String) as unknown as string,
      variable: created?.[0],
      prompt: 'What do people call them?',
    });
  });

  /**
   * The same invention, from a stage the researcher is still CREATING.
   *
   * The codebook half is a compound edit, and the full protocol a host answers
   * one with cannot contain a stage the interview does not have yet. Read as a
   * broken answer, the attribute is written to the codebook and the researcher
   * is told it was not — with the host's own sentence about a stage they never
   * mentioned.
   */
  it('creates the attribute a field invents while the stage itself is being created', async () => {
    const harness = renderStageEditor({
      create: {
        type: 'AlterForm',
        position: 0,
        // Everything a saved alter form needs except the fields themselves,
        // because this journey ends in a save. `AlterForm`'s own template has
        // no authored defaults, so a stage built from it alone is one no
        // researcher could finish yet.
        fields: {
          ...loadFixtureStage('alter-form-1').fields,
          label: 'New alter form',
          form: { fields: [] },
        },
      },
      sections: <FormFieldsSection subject="node" />,
    });

    await inventNickname(harness);

    const created = inventedNickname(harness);
    expect(created?.[1]).toMatchObject({ name: 'nickname', type: 'text' });
    expect(fieldsOf(await harness.submit()).at(-1)).toEqual({
      id: expect.any(String) as unknown as string,
      variable: created?.[0],
      prompt: 'What do people call them?',
    });
  });
});

/**
 * What a spectator can do to the list: look at it. Every affordance that would
 * write is unavailable, and a row dialog reached anyway commits nothing.
 */
describe('a spectator and the fields a form collects', () => {
  it('offers no way to add, edit or remove a field', async () => {
    renderStageEditor({
      stageId: 'alter-form-1',
      readOnly: true,
      sections: <FormFieldsSection subject="node" />,
    });

    const add = await screen.findByRole('button', {
      name: 'Create new form field',
    });
    const edit = screen.getAllByRole('button', { name: 'Edit field' })[0]!;
    const remove = screen.getAllByRole('button', { name: 'Remove field' })[0];

    expect({
      add: add.hasAttribute('disabled') || add.ariaDisabled === 'true',
      edit: edit.hasAttribute('disabled') || edit.ariaDisabled === 'true',
      remove:
        remove === undefined ||
        remove.hasAttribute('disabled') ||
        remove.ariaDisabled === 'true',
    }).toEqual({ add: true, edit: true, remove: true });
  });

  it('does not let a spectator change a row through the dialog', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      readOnly: true,
      sections: <FormFieldsSection subject="node" />,
    });

    await harness.user.click(
      screen.getAllByRole('button', { name: 'Edit field' })[0]!,
    );
    const dialogs = screen.queryAllByRole('dialog');
    if (dialogs.length > 0) {
      const dialog = within(dialogs[0]!);
      const question = dialog.getByRole('textbox', { name: 'Question text' });
      await harness.user.clear(question);
      await harness.user.type(question, 'A spectator wrote this');
      await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
      await waitFor(() =>
        expect(screen.queryAllByRole('dialog')).toHaveLength(0),
      );
    }

    expect(harness.pendingCommands()).toHaveLength(0);
  });
});

/**
 * What a refusal READS like on the control the researcher was using.
 *
 * A compound result's own `message` is written for whoever reads a log — the
 * protocol schema's words about a path, or the session's account of its own
 * reconciliation — and neither names what the researcher did or what they can
 * do next. So the words on the field are the authored ones, exactly as they
 * are in the codebook's own editors.
 */
describe('a codebook write a field needs, refused', () => {
  it('names the colleague who is holding the type', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      heldSections: [
        {
          sectionId: sectionId({ kind: 'codebookNode', typeId: 'person' }),
          displayName: 'Priya Raman',
        },
      ],
      sections: <FormFieldsSection subject="node" />,
    });

    const dialog = await addInventedNickname(harness);

    expect(
      await dialog.findByText(
        'Priya Raman is currently editing a section needed for this change.',
      ),
    ).toBeInTheDocument();
    expect(inventedNickname(harness)).toBeUndefined();
  });

  it('says what a stage that moved under the researcher means', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });
    // Unsaved work on this stage, and a collaborator moving the stage the
    // session is holding it against.
    act(() => {
      harness.session.dispatch([
        { op: 'set', key: 'label', value: 'Renamed here' },
      ]);
    });
    renameStageElsewhere(harness);

    const dialog = await addInventedNickname(harness);

    expect(
      await dialog.findByText(
        'Someone else changed this while you were editing it, so nothing was saved. Close and reopen this editor to load their version, then make your change again.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * The other codebook write a field makes: recording the control an EXISTING
   * attribute is collected with. It is refused the same ways and reads the
   * same, on the control that caused it.
   */
  it('names the colleague who is holding the type when a control is chosen', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      heldSections: [
        {
          sectionId: sectionId({ kind: 'codebookNode', typeId: 'person' }),
          displayName: 'Priya Raman',
        },
      ],
      sections: <FormFieldsSection subject="node" />,
    });

    const dialog = await openField(harness, 'Create new form field');
    // An attribute the codebook records no control for, so settling one here
    // is a codebook write rather than a repeat of what it already says.
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Attribute' }),
      'age',
    );
    await dialog.findByRole('combobox', { name: 'Input control' });
    await harness.user.type(
      dialog.getByRole('textbox', { name: 'Question text' }),
      'How old are they?',
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));

    expect(
      await dialog.findByText(
        'Priya Raman is currently editing a section needed for this change.',
      ),
    ).toBeInTheDocument();
  });
});
