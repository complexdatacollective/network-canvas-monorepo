import { act, screen, waitFor, within } from '@testing-library/react';
import { type ComponentProps, useEffect, useMemo } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { contentHash } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  buildVariableRoleMap,
  excludeUnvalidatedUses,
  variableRoleConflicts,
} from '../../codebook/variableRoles.ts';
import { draftAdditionalAttributeVariableIds } from '../../codebook/variableValidation.ts';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { useStageValue } from '../../form/stageFormHooks.ts';
import { protocolContextFromSections } from '../../protocol-context.ts';
import { FIXTURE_SESSION_OWNER } from '../../testing/fixtureSession.ts';
import { loadFixtureStage } from '../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import type { SectionCapability } from '../BuilderSection.tsx';
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

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

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

/**
 * A stage whose prompt stamps an attribute onto every node it adds, and which
 * also asks about that subject in a form.
 *
 * Written out rather than taken from the fixture because no fixture stage does
 * both yet, and the two together are the whole point: `flagged` is written
 * unvalidated HERE, in the stage the editor has open, and nowhere else in the
 * protocol.
 */
const STAMPING_NAME_GENERATOR = {
  id: 'stamps-an-attribute-it-also-asks-about',
  type: 'NameGenerator' as const,
  fields: {
    label: 'Name generator',
    subject: { entity: 'node', type: 'person' },
    form: {
      title: 'Add a person',
      fields: [{ variable: 'name', prompt: "What is this person's name?" }],
    },
    prompts: [
      {
        id: 'name-generator-prompt-1',
        text: 'Who are the people you know?',
        additionalAttributes: [{ variable: 'flagged', value: true }],
      },
    ],
  },
};

const PERSON = { entity: 'node', type: 'person' } as const;

/**
 * What the picker asks the role map, in the role map's own terms.
 *
 * `AttributePicker` filters its pool through exactly this call, so a pool of
 * one attribute answers "would this attribute have been offered?" without
 * standing anything in for the section.
 */
const offeredByRoleMap = (
  sections: Readonly<Record<string, Record<string, unknown>>>,
  variableId: string,
  excludedStageId?: string,
): string[] =>
  excludeUnvalidatedUses(
    buildVariableRoleMap(
      protocolContextFromSections(sections),
      excludedStageId,
    ),
    PERSON,
    [{ value: variableId }],
  ).map((option) => option.value);

/**
 * The stage being edited is part of the protocol its form is checked against.
 *
 * A form field is a VALIDATED writer, so a stage's own form contributes
 * nothing the role map is read for — but a stage may write the same subject
 * UNVALIDATED somewhere else in itself, and a name generator's prompt stamps
 * are exactly that. The schema's role-conflict rule refuses such a pairing
 * wherever the two writers sit, so a role map that excluded the open stage
 * would offer the researcher a field the protocol cannot hold.
 */
describe('an attribute the open stage itself writes unvalidated', () => {
  it('is not offered to a field of that stage’s own form', async () => {
    const harness = renderStageEditor({
      stage: STAMPING_NAME_GENERATOR,
      sections: <FormFieldsSection subject="node" hasTitle />,
    });

    const dialog = await openField(harness, 'Create new form field');
    const offered = offeredAttributes(dialog);

    // Not the empty picker: everything else about this subject is still there.
    expect(offered).toContain('age');
    expect(offered).not.toContain('flagged');
  });

  it('would have been offered while the role map excluded the open stage', async () => {
    const harness = renderStageEditor({
      stage: STAMPING_NAME_GENERATOR,
      sections: <FormFieldsSection subject="node" hasTitle />,
    });
    await screen.findByRole('button', { name: 'Create new form field' });

    // The protocol the mounted section reads, exactly as the session holds it.
    const sections = harness.session.getSnapshot().protocolSections;

    expect(offeredByRoleMap(sections, 'flagged')).toEqual([]);
    // The stamp is the only unvalidated write of `flagged` in the protocol, so
    // excluding the stage it lives in leaves the attribute looking free — and
    // the researcher would have authored a stage the schema refuses to save.
    expect(offeredByRoleMap(sections, 'flagged', harness.seeded.id)).toEqual([
      'flagged',
    ]);
  });
});

/** The same name generator, with nothing stamped on the nodes it adds yet. */
const UNSTAMPED_NAME_GENERATOR = {
  id: 'binds-a-slot-while-the-form-is-open',
  type: 'NameGenerator' as const,
  fields: {
    ...STAMPING_NAME_GENERATOR.fields,
    prompts: [
      {
        id: 'name-generator-prompt-1',
        text: 'Who are the people you know?',
      },
    ],
  },
};

/** What that prompt looks like once the researcher has bound the slot. */
const STAMPED_PROMPTS = STAMPING_NAME_GENERATOR.fields.prompts;

/** Lets a test bind the slot from outside, past the row dialog. */
type SlotBinder = { bind?: () => void };

/**
 * Binds the prompt's stamp in the DRAFT, as the prompts section does.
 *
 * Written through `applyOwnCommands` rather than through a control, because
 * the moment this test is about is one where a row dialog is open over the
 * editor: the modal takes every pointer event, and a researcher's own binding
 * of a slot before opening the dialog is the same draft write either way.
 */
function SlotBinder({ handle }: Readonly<{ handle: SlotBinder }>) {
  const { applyOwnCommands } = useStageEditorForm();

  useEffect(() => {
    handle.bind = () => {
      applyOwnCommands([{ op: 'set', key: 'prompts', value: STAMPED_PROMPTS }]);
    };
  }, [applyOwnCommands, handle]);

  return null;
}

/**
 * The form as an interface that owns unvalidated slots mounts it: reading its
 * own live prompts, and telling the section what they now write.
 *
 * Exactly what Architect's own Form section does
 * (`draftAdditionalAttributeVariableIds(promptDrafts)`), which is the point —
 * the two hosts must refuse the same picks.
 */
function FormBesideItsSlots({ handle }: Readonly<{ handle: SlotBinder }>) {
  const prompts = useStageValue('prompts');
  const draftUnvalidatedVariables = useMemo(
    () => [...draftAdditionalAttributeVariableIds(prompts)],
    [prompts],
  );

  return (
    <>
      <SlotBinder handle={handle} />
      <FormFieldsSection
        subject="node"
        hasTitle
        draftUnvalidatedVariables={draftUnvalidatedVariables}
      />
    </>
  );
}

/**
 * A slot the researcher binds in THIS session, which no saved section holds.
 *
 * The role map is built from the authoritative protocol, so it describes the
 * open stage as it was last saved: a prompt stamp bound a minute ago is
 * invisible to it. Without the draft, the picker goes on offering that
 * attribute and the row dialog goes on accepting it, and the contradiction
 * arrives at stage submit — against the prompt, which is not what the
 * researcher was working on.
 */
describe('an attribute the open stage’s DRAFT writes unvalidated', () => {
  it('stops being offered the moment the slot is bound', async () => {
    const handle: SlotBinder = {};
    const harness = renderStageEditor({
      stage: UNSTAMPED_NAME_GENERATOR,
      sections: <FormBesideItsSlots handle={handle} />,
    });

    // Nothing writes `flagged` unvalidated yet, here or anywhere else.
    const before = await openField(harness, 'Create new form field');
    expect(offeredAttributes(before)).toContain('flagged');
    await harness.user.click(before.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    act(() => handle.bind?.());

    const after = await openField(harness, 'Create new form field');
    const offered = offeredAttributes(after);
    // Not the empty picker: everything else about this subject is still there.
    expect(offered).toContain('age');
    expect(offered).not.toContain('flagged');
  });

  /**
   * The backstop, for the pick that was legal when it was made. The picker
   * cannot offer what is already bound, so the only way to reach this refusal
   * is to bind the slot while the dialog stands open — and the researcher has
   * to be told which of their own two edits contradicts the other.
   */
  it('refuses a row that was picked before the slot was bound, and says where', async () => {
    const handle: SlotBinder = {};
    const harness = renderStageEditor({
      stage: UNSTAMPED_NAME_GENERATOR,
      sections: <FormBesideItsSlots handle={handle} />,
    });

    const dialog = await openField(harness, 'Create new form field');
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Attribute' }),
      'flagged',
    );
    await harness.user.type(
      dialog.getByRole('textbox', { name: 'Question text' }),
      'Are they flagged?',
    );

    act(() => handle.bind?.());
    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));

    expect(
      await dialog.findByText(
        '"flagged" is assigned without validation by a prompt in this stage, so it cannot be used as a form field',
      ),
    ).toBeInTheDocument();
    // The dialog stays open on the refusal, so the pick can be changed.
    expect(screen.queryAllByRole('dialog')).toHaveLength(1);
  });

  /**
   * Without the draft the section has only the saved protocol, which still
   * says `flagged` is free — so the same journey ends with the pick accepted
   * and the stage saved holding both writers of one attribute, which is the
   * contradiction the picker exists to prevent.
   */
  it('is offered and accepted while the section reads only the saved protocol', async () => {
    const handle: SlotBinder = {};
    const harness = renderStageEditor({
      stage: UNSTAMPED_NAME_GENERATOR,
      sections: (
        <>
          <SlotBinder handle={handle} />
          <FormFieldsSection subject="node" hasTitle />
        </>
      ),
    });
    await screen.findByRole('button', { name: 'Create new form field' });

    act(() => handle.bind?.());

    const dialog = await openField(harness, 'Create new form field');
    expect(offeredAttributes(dialog)).toContain('flagged');
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Attribute' }),
      'flagged',
    );
    await harness.user.type(
      dialog.getByRole('textbox', { name: 'Question text' }),
      'Are they flagged?',
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    const request = await harness.submit();
    if (request === null) throw new Error('the stage did not save');
    // Saved, holding both writers of `flagged` in the one stage: a form field
    // that checks the participant's answer, and a prompt that stamps one
    // unchecked. Nothing refuses that at save, so the picker is where it has
    // to be caught — and what does report it names the prompt as loudly as the
    // field, which is not what the researcher was working on.
    const saved = protocolContextFromSections({
      ...harness.session.getSnapshot().protocolSections,
      [sectionId({ kind: 'stage', stageId: harness.seeded.id })]:
        request.stageDocument,
    });
    const here = saved.orderedStages.findIndex(
      (stage) => stage.id === harness.seeded.id,
    );
    const conflict = variableRoleConflicts(saved).find(
      (candidate) => candidate.variableId === 'flagged',
    );

    expect(conflict?.validated.map((hit) => hit.stageIndex)).toContain(here);
    expect(conflict?.unvalidated.map((hit) => hit.stageIndex)).toContain(here);
  });
});

/**
 * A Family Pedigree keeps its family-member form at `nodeConfig.form` and
 * names the node type it collects into at `nodeConfig.type` — which the schema
 * says in its own terms, as
 * `withStageSubjectResolution({ from: 'stagePath', path: ['nodeConfig', 'type'] })`.
 * The same section serves it, pointed at both.
 */
const pedigreeHoldingForm = (form: readonly unknown[]) => {
  const pedigree = loadFixtureStage('family-pedigree-1');
  return {
    id: pedigree.id,
    type: pedigree.type,
    fields: {
      ...pedigree.fields,
      nodeConfig: { ...asRecord(pedigree.fields.nodeConfig), form },
    },
  };
};

const pedigreeForm = (
  request: Awaited<ReturnType<ReturnType<typeof renderStageEditor>['submit']>>,
): unknown => asRecord(request?.stageDocument.nodeConfig).form;

/** The family-member form as the session holds it right now. */
const formRows = (harness: ReturnType<typeof renderStageEditor>): unknown[] => {
  const form = asRecord(
    harness.session.getSnapshot().editedSection.fields.nodeConfig,
  ).form;
  return Array.isArray(form) ? form : [];
};

/** Every command this session has issued and not had acknowledged. */
const commandsOf = (harness: ReturnType<typeof renderStageEditor>) =>
  harness.pendingCommands().flatMap((batch) => [...batch.commands]);

/**
 * Removes the only field through its own confirmation.
 *
 * The confirmation's button carries the same name as the row's — it IS the
 * row's confirmation. Waiting for the second one is what proves it opened.
 */
const removeField = async (harness: ReturnType<typeof renderStageEditor>) => {
  await harness.user.click(
    await screen.findByRole('button', { name: 'Remove field' }),
  );
  await harness.user.click(
    await screen.findByRole('button', { name: 'Remove field' }),
  );
};

/**
 * The pedigree's family-member form, and nothing else.
 *
 * Deliberately alone. A section pointed at a nested path owns that path and
 * only that path: the other five things a pedigree keeps on its node
 * configuration are edited by sections this test does not mount, and a save
 * from here must leave them exactly where it found them. This file used to
 * mount a stand-in for them, because a mounted field replaced its whole
 * top-level key.
 */
const familyMemberForm = (
  props: Partial<ComponentProps<typeof FormFieldsSection>> = {},
) => (
  <FormFieldsSection
    subject="node"
    fieldsPath="nodeConfig.form"
    subjectTypePath="nodeConfig.type"
    {...props}
  />
);

const FAMILY_MEMBER_FORM: SectionCapability = {
  fields: ['nodeConfig.form'],
  confirmClear: {
    title: 'Ask nothing about each family member?',
    description:
      'The questions this pedigree asks about each family member will be forgotten.',
    confirmLabel: 'Ask nothing',
  },
};

describe('a form the stage keeps somewhere other than `form.fields`', () => {
  it('reads and writes the list at `fieldsPath`', async () => {
    const harness = renderStageEditor({
      stage: pedigreeHoldingForm([
        { variable: 'fm_name', prompt: 'What is their name?' },
      ]),
      sections: familyMemberForm(),
    });

    // The seeded field is on screen, so the list was read from `nodeConfig.form`
    // rather than from an absent `form.fields`.
    expect(
      await screen.findByText('What is their name?', { exact: false }),
    ).toBeInTheDocument();

    const dialog = await openField(harness, 'Edit field');
    const question = dialog.getByRole('textbox', { name: 'Question text' });
    await harness.user.clear(question);
    await harness.user.type(question, 'What do people call them?');
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    // A bare array, which is the shape `FormFieldArraySchema` describes — the
    // rewritten field went back where the seeded one came from, and nothing was
    // written to `form.fields`.
    expect(pedigreeForm(await harness.submit())).toEqual([
      { variable: 'fm_name', prompt: 'What do people call them?' },
    ]);
  });

  it('draws its picker from the type named at `subjectTypePath`', async () => {
    const harness = renderStageEditor({
      stage: pedigreeHoldingForm([]),
      sections: familyMemberForm({ optional: true }),
    });

    const dialog = await openField(harness, 'Create new form field');
    const offered = offeredAttributes(dialog);

    // A family member's attributes, not a person's: `nodeConfig.type` is the
    // only place this interface says which codebook the form collects into,
    // and a section that went looking for `subject` would have found nothing.
    expect(offered).toContain('fm_name');
    expect(offered).not.toContain('relationship_to_ego');
    expect(offered).not.toContain('name');
    // Derived from the tree the participant draws, in this very stage, so the
    // whole-protocol role map refuses them here.
    expect(offered).not.toContain('is_ego');
    expect(offered).not.toContain('fm_relationship_to_ego');
    expect(offered).not.toContain('biologicalSex');
  });

  it('accepts a form emptied down to nothing when it is optional', async () => {
    const harness = renderStageEditor({
      stage: pedigreeHoldingForm([
        { variable: 'fm_name', prompt: 'What is their name?' },
      ]),
      sections: familyMemberForm({ optional: true }),
    });

    // Twice: the first click asks, and the confirmation carries the same words.
    await harness.user.click(
      await screen.findByRole('button', { name: 'Remove field' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Remove field' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Edit field' }),
      ).not.toBeInTheDocument(),
    );

    // `FormFieldArraySchema.optional()` rather than `FormSchema.fields.min(1)`:
    // a pedigree that asks nothing about each family member is a real protocol,
    // so "add at least one field" must not be applied to it.
    expect(pedigreeForm(await harness.submit())).toEqual([]);
    expect(
      screen.queryByText(
        'Add at least one field. A form with no fields collects nothing.',
      ),
    ).not.toBeInTheDocument();
  });

  it('leaves the rest of the node configuration to the sections that own it', async () => {
    const seeded = pedigreeHoldingForm([
      { variable: 'fm_name', prompt: 'What is their name?' },
    ]);
    const harness = renderStageEditor({
      stage: seeded,
      sections: familyMemberForm(),
    });

    const dialog = await openField(harness, 'Edit field');
    const question = dialog.getByRole('textbox', { name: 'Question text' });
    await harness.user.clear(question);
    await harness.user.type(question, 'What do people call them?');
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    // Nothing here edits the node type or the four variable slots, and a save
    // that dropped them would leave the pedigree unable to draw a tree — the
    // same loss as deleting a top-level key no section renders, one level down.
    // Only the form moved.
    expect(
      asRecord((await harness.submit())?.stageDocument.nodeConfig),
    ).toEqual({
      ...asRecord(seeded.fields.nodeConfig),
      form: [{ variable: 'fm_name', prompt: 'What do people call them?' }],
    });
  });

  it('commits a removed field as that row leaving the list it lives in', async () => {
    const harness = renderStageEditor({
      stage: pedigreeHoldingForm([
        { variable: 'fm_name', prompt: 'What is their name?' },
      ]),
      sections: familyMemberForm({ optional: true }),
    });

    await removeField(harness);
    await waitFor(() => expect(formRows(harness)).toHaveLength(0));

    // The command says WHICH row went, and where the list it went from lives.
    // A whole-value `set` on `nodeConfig` would say only "the node config is
    // now this" — unmergeable with any change made elsewhere in it, and it
    // would need every sibling slot mounted to say even that much.
    expect(commandsOf(harness)).toEqual([
      { op: 'removeItem', key: ['nodeConfig', 'form'], index: 0 },
    ]);
  });

  it('asks in the owning interface’s words before switching the form off', async () => {
    const harness = renderStageEditor({
      stage: pedigreeHoldingForm([
        { variable: 'fm_name', prompt: 'What is their name?' },
      ]),
      sections: familyMemberForm({
        optional: true,
        capability: FAMILY_MEMBER_FORM,
      }),
    });

    // Seeded with a form, so the capability opens switched on.
    const toggle = await screen.findByRole('switch', { name: 'Form fields' });
    expect(toggle).toBeChecked();

    await harness.user.click(toggle);
    expect(
      await screen.findByText('Ask nothing about each family member?'),
    ).toBeInTheDocument();
    await harness.user.click(
      screen.getByRole('button', { name: 'Ask nothing' }),
    );

    await waitFor(() =>
      expect(
        harness.outline().find((section) => section.title === 'Form fields')
          ?.state,
      ).toBe('Switched off'),
    );

    // Absent, which is how the schema spells "this pedigree asks nothing about
    // each family member" — not an empty list left behind by a closed section.
    const request = await harness.submit();
    expect(
      Object.hasOwn(asRecord(request?.stageDocument.nodeConfig), 'form'),
    ).toBe(false);
  });
});

/** The person type exactly as the host holds it right now. */
const personDocument = (harness: ReturnType<typeof renderStageEditor>) =>
  asRecord(
    harness.host.getSnapshot().protocolSections[
      sectionId({ kind: 'codebookNode', typeId: 'person' })
    ],
  );

const personVariables = (harness: ReturnType<typeof renderStageEditor>) =>
  asRecord(personDocument(harness).variables);

/** The attribute the host holds under this researcher-facing name. */
const savedAttribute = (
  harness: ReturnType<typeof renderStageEditor>,
  name: string,
) =>
  Object.entries(personVariables(harness)).find(
    ([, variable]) => asRecord(variable).name === name,
  );

/**
 * Adds one value to the attribute list the codebook editor is showing.
 *
 * The editor opens on the values the attribute already has, so the row a new
 * one lands in is one past them.
 */
const addValue = async (
  harness: ReturnType<typeof renderStageEditor>,
  position: number,
  label: string,
  value: string,
) => {
  await harness.user.click(screen.getByRole('button', { name: 'Add option' }));
  await harness.user.type(
    screen.getByRole('textbox', { name: `Option ${position} label` }),
    label,
  );
  await harness.user.type(
    screen.getByRole('textbox', { name: `Option ${position} value` }),
    value,
  );
};

/**
 * Invents the categorical attribute a field collects, with its first two
 * values, through the control the row dialog offers for it.
 *
 * The fixture's own categorical and ordinal attributes are both written
 * unvalidated by a bin stage, so a form may collect neither — which is why
 * every journey here starts by making one.
 */
const createContactSetting = async (
  harness: ReturnType<typeof renderStageEditor>,
  dialog: ReturnType<typeof within>,
) => {
  await harness.user.selectOptions(
    dialog.getByRole('combobox', { name: 'Attribute' }),
    '__create_new_attribute__',
  );
  await harness.user.selectOptions(
    await dialog.findByRole('combobox', { name: 'Kind of answer' }),
    'categorical',
  );
  await harness.user.click(
    dialog.getByRole('button', {
      name: 'Create this attribute and its values',
    }),
  );
  await harness.user.type(
    await screen.findByRole('textbox', { name: 'Attribute name' }),
    'contact_setting',
  );
  await addValue(harness, 1, 'At home', 'home');
  await addValue(harness, 2, 'At work', 'work');
  await harness.user.click(
    screen.getByRole('button', { name: 'Create attribute' }),
  );

  return waitFor(() => {
    const entry = savedAttribute(harness, 'contact_setting');
    if (entry === undefined) throw new Error('the attribute was not created');
    return entry;
  });
};

/**
 * Everything about a form field that lives on the codebook attribute rather
 * than on the field.
 *
 * A field binds a question to an attribute, and what that attribute is called,
 * what values it offers and which answers it accepts are all the codebook's.
 * Architect authors them inline in this same dialog and writes the whole set
 * through the field's save (`Form/fieldCommit.ts`); here they are compound
 * edits of their own, so the dialog opens the codebook's own editors on them
 * and the field's save writes only the field.
 */
describe('the codebook an attribute a form field collects lives in', () => {
  /**
   * A categorical attribute IS its values — `categoricalOptionsSchema`
   * requires at least two — so an attribute invented from a name and a type
   * alone is one the schema refuses every time, and the researcher is sent to
   * the codebook and back to finish what they had just started.
   */
  it('creates a categorical attribute with the values it will offer', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    const dialog = await openField(harness, 'Create new form field');
    const created = await createContactSetting(harness, dialog);

    expect(created[1]).toMatchObject({
      type: 'categorical',
      options: [
        { label: 'At home', value: 'home' },
        { label: 'At work', value: 'work' },
      ],
    });

    // The field is bound to what was just created, and finishing the row
    // writes the input control onto the same attribute.
    await harness.user.selectOptions(
      await dialog.findByRole('combobox', { name: 'Input control' }),
      'CheckboxGroup',
    );
    await harness.user.type(
      dialog.getByRole('textbox', { name: 'Question text' }),
      'Where do you usually meet?',
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    expect(asRecord(personVariables(harness)[created[0]])).toMatchObject({
      component: 'CheckboxGroup',
    });
    expect(fieldsOf(await harness.submit()).at(-1)).toEqual({
      id: expect.any(String) as unknown as string,
      variable: created[0],
      prompt: 'Where do you usually meet?',
    });
  });

  /**
   * The values a participant chooses between are the researcher's to change
   * from where they are looking at them. Without this the field editor could
   * bind a question to a list of answers and offer no way to author the list —
   * and a value thought of a moment later would mean leaving the form, finding
   * the attribute in the codebook, and coming back.
   */
  it('changes the values an attribute already offers', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    const dialog = await openField(harness, 'Create new form field');
    const [variableId] = await createContactSetting(harness, dialog);

    await harness.user.click(
      await dialog.findByRole('button', {
        name: 'Change this attribute’s values',
      }),
    );
    await addValue(harness, 3, 'Somewhere else', 'elsewhere');
    await harness.user.click(
      screen.getByRole('button', { name: 'Save attribute' }),
    );

    await waitFor(() =>
      expect(
        asRecord(personVariables(harness)[variableId]).options,
      ).toHaveLength(3),
    );
    expect(asRecord(personVariables(harness)[variableId]).options).toEqual([
      { label: 'At home', value: 'home' },
      { label: 'At work', value: 'work' },
      { label: 'Somewhere else', value: 'elsewhere' },
    ]);
  });

  /**
   * The rules are the only thing standing between a participant typing an
   * answer and one the study cannot use, and a form field is the writer that
   * honours them — so the field that collects the attribute is where a
   * researcher expects to set them.
   */
  it('sets the rules an answer to this field must satisfy', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    const dialog = await openField(harness, 'Edit field');
    await harness.user.click(
      dialog.getByRole('button', { name: 'Set rules for this answer' }),
    );
    await screen.findByRole('button', { name: 'Save validation' });
    await harness.user.click(
      screen.getByRole('checkbox', { name: 'Required' }),
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Save validation' }),
    );

    await waitFor(() =>
      expect(
        asRecord(
          asRecord(personVariables(harness).relationship_to_ego).validation,
        ).required,
      ).toBe(true),
    );
  });

  /**
   * The create control is the only way an attribute with values comes into
   * existence here, so a row that names one and never opened it points at
   * nothing — and the refusal has to say what to press rather than repeating
   * the schema's own count.
   */
  it('refuses a row that named a categorical attribute it never created', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    const dialog = await openField(harness, 'Create new form field');
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Attribute' }),
      '__create_new_attribute__',
    );
    await harness.user.selectOptions(
      await dialog.findByRole('combobox', { name: 'Kind of answer' }),
      'categorical',
    );
    await harness.user.type(
      dialog.getByRole('textbox', { name: 'Question text' }),
      'Where do you usually meet?',
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));

    expect(
      await dialog.findByText(
        'Create this attribute and the values it offers before adding the field that collects it.',
      ),
    ).toBeInTheDocument();
    // Nothing was written, and the row is still open to be finished.
    expect(savedAttribute(harness, '')).toBeUndefined();
    expect(screen.queryAllByRole('dialog').length).toBeGreaterThan(0);
  });

  /**
   * There is deliberately no test for a field whose attribute HAS fewer than
   * two values, because a picker can never offer one: `NodeDefinitionSchema`
   * is parsed whole, so a codebook holding a one-value categorical attribute
   * drops the entity type out of the protocol context and the field editor
   * offers no attributes at all. A refusal written for that case could only
   * ever be dead.
   */
});
