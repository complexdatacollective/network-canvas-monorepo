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
import { fixtureMessage } from '../../testing/i18n.ts';
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

/**
 * The picker option standing for an attribute that does not exist yet.
 *
 * Written out here rather than imported from the section, so a change to it
 * has to be made in both places: the value is part of what the picker offers,
 * and a test that followed the constant could not notice it moving inside the
 * alphabet `VariableNameSchema` allows.
 */
const CREATE_NEW_ATTRIBUTE = '#create-new-attribute';

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
const addInventedAttribute = async (
  harness: ReturnType<typeof renderStageEditor>,
  attributeName: string,
) => {
  const dialog = await openField(harness, 'Create new form field');
  await harness.user.selectOptions(
    dialog.getByRole('combobox', { name: 'Attribute' }),
    CREATE_NEW_ATTRIBUTE,
  );
  await harness.user.type(
    await dialog.findByRole('textbox', { name: 'Attribute name' }),
    attributeName,
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

const addInventedNickname = (harness: ReturnType<typeof renderStageEditor>) =>
  addInventedAttribute(harness, 'nickname');

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

/**
 * A saved form collecting an attribute that holds a position rather than an
 * answer. Nothing in the editor can author this — the picker filters those
 * attributes out — so it stands for the protocol that arrives already holding
 * one.
 */
const COLLECTS_A_POSITION = {
  id: 'collects-a-position',
  type: 'AlterForm',
  fields: {
    ...loadFixtureStage('alter-form-1').fields,
    label: 'Where everyone sits',
    form: { fields: [{ variable: 'layout', prompt: 'Where do they sit?' }] },
  },
} as const;

/** Written out, so a catalog that lost the sentence cannot pass. */
const NOT_A_FIELD =
  'This form holds an entry that is not a field, so its fields cannot be shown or changed here. That entry has to be taken out of the protocol before this stage can be saved.';

const NO_WAY_TO_ANSWER =
  'This field’s attribute gives the participant no way to answer. Choose a different attribute, or remove this field.';

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

  /**
   * A field bound to an attribute no control can collect — `layout` records
   * where a node was dropped rather than an answer. The picker never offers
   * one, so this is the protocol that arrives already holding one: an import,
   * a hand-edited file, an attribute a collaborator retyped.
   *
   * The input-control field is not on screen, because there is nothing for it
   * to offer. Before this, the save was refused against that absent field and
   * the researcher was left with a dialog that would not close, nothing said,
   * and `focusFirstError(): no element found in DOM for
   * [data-field-name="_component"]` in the console.
   */
  it('says why a field bound to an uncollectable attribute cannot be saved', async () => {
    const harness = renderStageEditor({
      stage: COLLECTS_A_POSITION,
      sections: <FormFieldsSection subject="node" />,
    });

    const dialog = await openField(harness, 'Edit field');

    // Said as the dialog opens, rather than after a save that was never going
    // to work, and the save control says it is unavailable and why.
    expect(await dialog.findByText(NO_WAY_TO_ANSWER)).toBeInTheDocument();
    const save = dialog.getByRole('button', { name: 'Save' });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    expect(save).toHaveAccessibleDescription(
      /This field\u2019s attribute gives the participant no way to answer\./,
    );

    // Pressed anyway — `aria-disabled` announces that a dialog cannot be
    // submitted, it does not prevent it — and the draft is still on screen
    // with the reason above it rather than committed.
    await harness.user.click(save);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(dialog.getByText(NO_WAY_TO_ANSWER)).toBeInTheDocument();
  });

  /**
   * The way out the sentence names, taken. The refusal is held for exactly as
   * long as the attribute it is about is the one bound, so binding the field
   * to something a participant can answer gives the save back.
   */
  it('gives the save back when the field is bound to something collectable', async () => {
    const harness = renderStageEditor({
      stage: COLLECTS_A_POSITION,
      sections: <FormFieldsSection subject="node" />,
    });

    const dialog = await openField(harness, 'Edit field');
    expect(await dialog.findByText(NO_WAY_TO_ANSWER)).toBeInTheDocument();

    // Already collected with a text box, so the codebook has nothing to write:
    // this is about the dialog letting go, not about a control being recorded.
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Attribute' }),
      'relationship_to_ego',
    );

    expect(dialog.queryByText(NO_WAY_TO_ANSWER)).toBeNull();
    const save = dialog.getByRole('button', { name: 'Save' });
    expect(save).not.toHaveAttribute('aria-disabled');

    await harness.user.click(save);
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );
    expect(fieldsOf(await harness.submit())).toEqual([
      { variable: 'relationship_to_ego', prompt: 'Where do they sit?' },
    ]);
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

  /**
   * The other half of the rule above: the affordance is not merely styled as
   * unavailable, it does nothing.
   *
   * Written as a POSITIVE assertion that no dialog opened, rather than as a
   * branch that drives one if it happens to be there. That branch was the
   * whole of this test, and the test above proves the button is disabled — so
   * the branch was never taken, and what was left (`pendingCommands()` is
   * empty) is true of a harness that has just been rendered, spectator or not.
   */
  it('does not open a row dialog when a spectator clicks Edit', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      readOnly: true,
      sections: <FormFieldsSection subject="node" />,
    });

    await harness.user.click(
      screen.getAllByRole('button', { name: 'Edit field' })[0]!,
    );

    expect(screen.queryAllByRole('dialog')).toHaveLength(0);
    expect(harness.pendingCommands()).toHaveLength(0);
  });

  /**
   * And what a row dialog itself does if one is reached anyway.
   *
   * The trigger is disabled, so a browser cannot get here — but a bug could,
   * and the rule this surface actually depends on is that the dialog's own
   * save writes nothing. Reached by rendering the same section as an editor
   * and then losing the lease, which leaves the dialog open on a session that
   * has become read-only.
   */
  it('commits nothing from a row dialog left open when the lease goes', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    const dialog = await openField(harness, 'Edit field');
    const question = dialog.getByRole('textbox', { name: 'Question text' });
    await harness.user.clear(question);
    await harness.user.type(question, 'A spectator wrote this');

    act(() => {
      harness.session.setAccess({ mode: 'readOnly', reason: 'lease-lost' });
    });

    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));

    // The refusal is what proves the save was reached and turned away: without
    // it the dialog would close on a committed row, and the two assertions
    // below would be about a dialog that had simply not been driven.
    expect(
      await screen.findByText(
        'This stage is read-only, so this field was not saved. Take over editing and try again.',
      ),
    ).toBeInTheDocument();
    expect(harness.pendingCommands()).toHaveLength(0);
    expect(
      JSON.stringify(harness.session.getSnapshot().editedSection.fields.form),
    ).not.toContain('A spectator wrote this');
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

  /**
   * A stage a collaborator moved is NOT one of the refusals, and this says so
   * where a researcher would meet it.
   *
   * Inventing an attribute asks the host to write the codebook and says
   * nothing about the stage, so there is nothing about the stage to check
   * before the request goes out: this session finds out only from the answer,
   * and by then the host has APPLIED the write and is answering with its own
   * stage beside it. Refusing there would be a refusal of something that has
   * already happened — the type exists on the host, and the session would be
   * left on the revision before it — so the stage is adopted instead and the
   * researcher's unsaved rename is rebased onto it. See
   * `sessionIntegration.test.ts`, "adopts a stage it cannot account for".
   *
   * The `stale-base` copy this used to be the surface for is what the FOLD's
   * own stale base still reads like; `VariableEditor` and
   * `CodebookVariableValidationEditor` are where it is pinned.
   */
  it('adopts a stage that moved under the researcher, and still writes', async () => {
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

    // Nothing is refused: the dialog closes and the attribute exists.
    await inventNickname(harness);
    expect(inventedNickname(harness)).toBeDefined();

    // The collaborator's rename is this session's stage now...
    const stageSection = sectionId({
      kind: 'stage',
      stageId: harness.seeded.id,
    });
    expect(
      harness.session.getSnapshot().protocolSections[stageSection],
    ).toMatchObject({ label: 'Renamed elsewhere' });
    // ...and the researcher's own unsaved rename is rebased onto it rather
    // than dropped: still pending, and still what the editor is showing.
    expect(
      harness.pendingCommands().flatMap((batch) => [...batch.commands]),
    ).toContainEqual({ op: 'set', key: 'label', value: 'Renamed here' });
    expect(harness.session.getSnapshot().editedSection.fields).toMatchObject({
      label: 'Renamed here',
    });
  });

  /**
   * A refusal the codebook SCHEMA raised, rather than one the host answered
   * with.
   *
   * `InvalidCodebookDraftError`'s own message is the module-internal "the
   * variable draft is invalid" and its `issues` are the schema's own, written
   * for whoever reads a log. Neither belongs on the Attribute control: what the
   * researcher needs to be told is the one thing this refusal is actually
   * about, in the words every other surface uses for the same rule.
   */
  it('says what is wrong with a name the codebook cannot store', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    await addInventedAttribute(harness, 'first name');

    // Nothing was written, and the dialog stays open over the draft.
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(1),
    );
    expect(inventedNickname(harness)).toBeUndefined();

    expect(
      await screen.findByText(
        'Not a valid attribute name. Only letters, numbers and the symbols ._-: are supported',
      ),
    ).toBeVisible();
    expect(screen.queryByText('the variable draft is invalid')).toBeNull();
  });

  it('control: a name made of the symbols the rule allows is created', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    await addInventedAttribute(harness, 'first_name');

    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );
    expect(
      Object.values(personVariables(harness)).some(
        (variable) => Reflect.get(asRecord(variable), 'name') === 'first_name',
      ),
    ).toBe(true);
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

/** The same prompt with the stamp taken off it again. */
const UNSTAMPED_PROMPTS = UNSTAMPED_NAME_GENERATOR.fields.prompts;

/** Lets a test bind or unbind the slot from outside, past the row dialog. */
type SlotBinder = { bind?: () => void; unbind?: () => void };

/**
 * Binds the prompt's stamp in the DRAFT, as the prompts section does, and
 * takes it off again the same way.
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
    handle.unbind = () => {
      applyOwnCommands([
        { op: 'set', key: 'prompts', value: UNSTAMPED_PROMPTS },
      ]);
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
   * And the other direction, which is the same fact: the draft is the account
   * of what THIS stage writes unvalidated, so a slot the stage saved and the
   * researcher has since unbound writes nothing any more.
   *
   * The saved protocol still says the stamp is there — it is what the stage
   * was last saved holding — and the draft cannot subtract from it. So an
   * attribute the researcher has just freed stayed hidden from the picker and
   * refused at save, and the only way to collect it was to save the stage,
   * close it and open it again.
   */
  it('is offered again once the slot the stage saved is unbound', async () => {
    const handle: SlotBinder = {};
    const harness = renderStageEditor({
      stage: STAMPING_NAME_GENERATOR,
      sections: <FormBesideItsSlots handle={handle} />,
    });

    const before = await openField(harness, 'Create new form field');
    expect(offeredAttributes(before)).not.toContain('flagged');
    await harness.user.click(before.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    act(() => handle.unbind?.());

    const after = await openField(harness, 'Create new form field');
    expect(offeredAttributes(after)).toContain('flagged');

    // And the save-time gate asks the same question of the same two sources,
    // so the row it now offers is a row that commits.
    await harness.user.selectOptions(
      after.getByRole('combobox', { name: 'Attribute' }),
      'flagged',
    );
    await harness.user.type(
      after.getByRole('textbox', { name: 'Question text' }),
      'Are they flagged?',
    );
    await harness.user.click(after.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );
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
/**
 * `unknown` rather than a list, because the protocol is not typed by the time
 * it reaches this section: what an import or a migration left at
 * `nodeConfig.form` is whatever it is, and a seed that could only be a list
 * could not ask the section what it says about the rest.
 */
const pedigreeHoldingForm = (form: unknown) => {
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
    title: fixtureMessage('Ask nothing about each family member?'),
    description: fixtureMessage(
      'The questions this pedigree asks about each family member will be forgotten.',
    ),
    confirmLabel: fixtureMessage('Ask nothing'),
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

/** What the row offers for the two answers of a boolean it collects. */
const EDIT_ANSWER_LABELS = 'Change this attribute’s answer labels';

/**
 * Writes both answers of the boolean the open row collects, through the
 * codebook editor the row opens on them.
 *
 * The row itself is left open and unsaved: the attribute is a compound edit of
 * its own, and whether the row behind it survives one is the point.
 */
const nameBothAnswers = async (
  harness: ReturnType<typeof renderStageEditor>,
  dialog: ReturnType<typeof within>,
) => {
  await harness.user.click(
    await dialog.findByRole('button', { name: EDIT_ANSWER_LABELS }),
  );
  await screen.findByRole('button', { name: 'Save attribute' });
  await harness.user.type(
    screen.getByRole('textbox', { name: 'Label for “true”' }),
    'Yes, definitely',
  );
  await harness.user.type(
    screen.getByRole('textbox', { name: 'Label for “false”' }),
    'No, not at all',
  );
  await harness.user.click(
    screen.getByRole('button', { name: 'Save attribute' }),
  );
  await waitFor(() =>
    expect(asRecord(personVariables(harness).flagged).options).toHaveLength(2),
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
    CREATE_NEW_ATTRIBUTE,
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

    // Creating the attribute is what takes this row out of inventing one, so
    // the button that opened the editor has gone by the time it closes. Focus
    // has to land on something still mounted: the next Tab from `<body>`
    // starts at the top of the document, and a screen-reader user is returned
    // to the page rather than to the control they left.
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Create attribute' }),
      ).toBeNull(),
    );
    expect(document.activeElement).toBe(
      dialog.getByRole('combobox', { name: 'Attribute' }),
    );

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
   * A date field accepts dates between two bounds, at a precision the study
   * decides — and none of that is a list of values, so until now the field
   * that collects it could choose a date picker and then say nothing about
   * what it would accept. Architect authors the same settings inline in this
   * same dialog and writes them through the field's save.
   *
   * Two steps, because the settings belong to an attribute: there is nothing
   * to configure until the attribute exists, and it is the row's save that
   * creates it.
   */
  it('sets what a date field accepts, on the attribute it collects', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    const creating = await openField(harness, 'Create new form field');
    await harness.user.selectOptions(
      creating.getByRole('combobox', { name: 'Attribute' }),
      CREATE_NEW_ATTRIBUTE,
    );
    await harness.user.selectOptions(
      await creating.findByRole('combobox', { name: 'Kind of answer' }),
      'datetime',
    );
    await harness.user.type(
      await creating.findByRole('textbox', { name: 'Attribute name' }),
      'met_on',
    );
    await harness.user.selectOptions(
      await creating.findByRole('combobox', { name: 'Input control' }),
      'DatePicker',
    );
    await harness.user.type(
      creating.getByRole('textbox', { name: 'Question text' }),
      'When did you first meet?',
    );
    await harness.user.click(creating.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );
    const created = savedAttribute(harness, 'met_on');
    if (created === undefined) throw new Error('the attribute was not created');

    const editing = await openField(harness, 'Edit field', 2);
    await harness.user.click(
      await editing.findByRole('button', {
        name: 'Set what this field accepts',
      }),
    );
    await screen.findByRole('button', { name: 'Save attribute' });
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Date resolution' }),
      'year',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Save attribute' }),
    );

    await waitFor(() =>
      expect(asRecord(personVariables(harness)[created[0]]).parameters).toEqual(
        { type: 'year' },
      ),
    );
    // Written on the attribute, beside the control they were authored for —
    // not on the form field, which holds only its question.
    expect(asRecord(personVariables(harness)[created[0]])).toMatchObject({
      name: 'met_on',
      type: 'datetime',
      component: 'DatePicker',
    });
  });

  /**
   * The control the settings are authored FOR is the one the row is showing,
   * not the one the codebook still records.
   *
   * The input control is chosen here and only written when the row is saved,
   * so a researcher who switches a date field from one picker to the other and
   * goes straight to its settings would otherwise be shown the settings of the
   * picker they have just left — and what they authored would be written
   * beside a control that cannot take it, which the schema refuses outright.
   */
  it('offers the settings of the control the row is showing, not the saved one', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    const creating = await openField(harness, 'Create new form field');
    await harness.user.selectOptions(
      creating.getByRole('combobox', { name: 'Attribute' }),
      CREATE_NEW_ATTRIBUTE,
    );
    await harness.user.selectOptions(
      await creating.findByRole('combobox', { name: 'Kind of answer' }),
      'datetime',
    );
    await harness.user.type(
      await creating.findByRole('textbox', { name: 'Attribute name' }),
      'met_on',
    );
    await harness.user.type(
      creating.getByRole('textbox', { name: 'Question text' }),
      'When did you first meet?',
    );
    await harness.user.click(creating.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );
    const created = savedAttribute(harness, 'met_on');
    if (created === undefined) throw new Error('the attribute was not created');
    expect(asRecord(created[1]).component).toBe('DatePicker');

    const editing = await openField(harness, 'Edit field', 2);
    await harness.user.selectOptions(
      await editing.findByRole('combobox', { name: 'Input control' }),
      'RelativeDatePicker',
    );
    await harness.user.click(
      await editing.findByRole('button', {
        name: 'Set what this field accepts',
      }),
    );
    await screen.findByRole('button', { name: 'Save attribute' });

    // The picker the row now names, not the one the codebook still holds.
    expect(
      screen.queryByRole('combobox', { name: 'Date resolution' }),
    ).toBeNull();
    await harness.user.type(screen.getByLabelText('Days before'), '30');
    await harness.user.click(
      screen.getByRole('button', { name: 'Save attribute' }),
    );

    // The control is written with the settings that depend on it, so the two
    // can never be committed out of step.
    await waitFor(() =>
      expect(asRecord(personVariables(harness)[created[0]])).toMatchObject({
        component: 'RelativeDatePicker',
        parameters: { before: 30 },
      }),
    );
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
   * A boolean field asks a yes-or-no question, and the words on those two
   * answers are the researcher's — the schema holds them under the same
   * `options` key a categorical attribute uses, in a shape of its own. So the
   * field that collects a boolean reaches the same surface its neighbours do,
   * named for what is actually being changed.
   */
  it('changes what the two answers of a boolean field say', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    const editing = await openField(harness, 'Edit field', 1);
    await nameBothAnswers(harness, editing);

    expect(asRecord(personVariables(harness).flagged)).toEqual({
      name: 'flagged',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: 'Yes, definitely', value: true },
        { label: 'No, not at all', value: false },
      ],
    });
  });

  /**
   * A toggle is a switch that is on or off, and its variable schema has no
   * `options` key at all — so the answers the choice control showed are not
   * settings that stop applying, they are a variable the codebook refuses.
   * The row is where the control is chosen, so the row's save is what has to
   * take them away; Architect does the same through
   * `clearInapplicableCodebookProperties`.
   */
  it('drops the answers a toggle cannot show when the field changes control', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    const editing = await openField(harness, 'Edit field', 1);
    await nameBothAnswers(harness, editing);

    await harness.user.selectOptions(
      editing.getByRole('combobox', { name: 'Input control' }),
      'Toggle',
    );
    expect(
      editing.queryByRole('button', { name: EDIT_ANSWER_LABELS }),
    ).toBeNull();
    await harness.user.click(editing.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    expect(asRecord(personVariables(harness).flagged)).toEqual({
      name: 'flagged',
      type: 'boolean',
      component: 'Toggle',
    });
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
      CREATE_NEW_ATTRIBUTE,
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

/**
 * Switching the input control an attribute is collected with, from the row.
 *
 * Datetime is the case that makes it more than a name change: the protocol
 * splits it into two variable schemas keyed on `component`, each a
 * `strictObject`, so what a `DatePicker` was configured with is not a key a
 * `RelativeDatePicker` may hold. The row's save has to move the settings block
 * with the control, exactly as the codebook editor's own save does.
 */
describe('switching the input control on a configured attribute', () => {
  /** A date field on a fresh attribute, collected with the plain date picker. */
  const createDateField = async (
    harness: ReturnType<typeof renderStageEditor>,
  ) => {
    const creating = await openField(harness, 'Create new form field');
    await harness.user.selectOptions(
      creating.getByRole('combobox', { name: 'Attribute' }),
      CREATE_NEW_ATTRIBUTE,
    );
    await harness.user.selectOptions(
      await creating.findByRole('combobox', { name: 'Kind of answer' }),
      'datetime',
    );
    await harness.user.type(
      await creating.findByRole('textbox', { name: 'Attribute name' }),
      'met_on',
    );
    await harness.user.type(
      creating.getByRole('textbox', { name: 'Question text' }),
      'When did you first meet?',
    );
    await harness.user.click(creating.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );
    const created = savedAttribute(harness, 'met_on');
    if (created === undefined) throw new Error('the attribute was not created');
    return created[0];
  };

  /** Authors settings for the date picker, so the attribute carries a block. */
  const giveItAResolution = async (
    harness: ReturnType<typeof renderStageEditor>,
  ) => {
    const editing = await openField(harness, 'Edit field', 2);
    await harness.user.click(
      await editing.findByRole('button', {
        name: 'Set what this field accepts',
      }),
    );
    await screen.findByRole('button', { name: 'Save attribute' });
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Date resolution' }),
      'year',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Save attribute' }),
    );
    await waitFor(() =>
      expect(
        asRecord(savedAttribute(harness, 'met_on')?.[1]).parameters,
      ).toEqual({ type: 'year' }),
    );
    await harness.user.click(editing.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );
  };

  const switchToRelative = async (
    harness: ReturnType<typeof renderStageEditor>,
  ) => {
    const editing = await openField(harness, 'Edit field', 2);
    await harness.user.selectOptions(
      await editing.findByRole('combobox', { name: 'Input control' }),
      'RelativeDatePicker',
    );
    await harness.user.click(editing.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );
  };

  it('control: switches while the attribute has no settings', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });
    const variableId = await createDateField(harness);

    await switchToRelative(harness);

    expect(asRecord(personVariables(harness)[variableId]).component).toBe(
      'RelativeDatePicker',
    );
  });

  it('takes the old control’s settings with it', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });
    const variableId = await createDateField(harness);
    await giveItAResolution(harness);

    await switchToRelative(harness);

    const saved = asRecord(personVariables(harness)[variableId]);
    expect(saved.component).toBe('RelativeDatePicker');
    // The resolution belonged to the date picker: a relative picker's schema
    // is a `strictObject` of `anchor`/`before`/`after` and would refuse it.
    expect(Object.hasOwn(saved, 'parameters')).toBe(false);
  });
});

/**
 * Rebinding a row to a different attribute, and what happens to the control.
 *
 * The input control belongs to the ATTRIBUTE, so the answer to "how is this
 * collected?" changes the moment the row is pointed somewhere else. The row's
 * save writes that control back to whichever attribute is bound when it runs,
 * so a control left over from the previous binding is not a stale label: it is
 * a codebook write against an attribute the researcher never touched, and it
 * changes how that attribute is collected in every form that asks for it.
 */
describe('rebinding a form field to another attribute', () => {
  /**
   * A second text attribute, collected with the OTHER text control.
   *
   * The fixture collects every one of a person's text attributes with a plain
   * text box, so nothing in it can tell a control that followed the rebinding
   * from one that was simply never reset.
   */
  const collectNotesInATextArea = (
    harness: ReturnType<typeof renderStageEditor>,
  ) => {
    harness.receiveCodebookUpdate({
      node: {
        person: {
          ...personDocument(harness),
          variables: {
            ...personVariables(harness),
            notes: { name: 'notes', type: 'text', component: 'TextArea' },
          },
        },
      },
    });
  };

  const inputControl = (dialog: ReturnType<typeof within>) =>
    dialog.getByRole('combobox', { name: 'Input control' });

  it('shows the newly chosen attribute’s own control, in both directions', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });
    collectNotesInATextArea(harness);

    const dialog = await openField(harness, 'Create new form field');
    const attribute = dialog.getByRole('combobox', { name: 'Attribute' });

    await harness.user.selectOptions(attribute, 'notes');
    expect(
      await dialog.findByRole('combobox', { name: 'Input control' }),
    ).toHaveValue('TextArea');

    // Both attributes are text, so both offer the same two controls and the
    // field is never unmounted between them: whatever the control says now is
    // what the row will write to `name`.
    await harness.user.selectOptions(attribute, 'name');
    await waitFor(() => expect(inputControl(dialog)).toHaveValue('Text'));

    await harness.user.selectOptions(attribute, 'notes');
    await waitFor(() => expect(inputControl(dialog)).toHaveValue('TextArea'));
  });

  it('does not rewrite the newly chosen attribute’s control in the codebook', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });
    collectNotesInATextArea(harness);

    const dialog = await openField(harness, 'Create new form field');
    const attribute = dialog.getByRole('combobox', { name: 'Attribute' });
    await harness.user.selectOptions(attribute, 'notes');
    await dialog.findByRole('combobox', { name: 'Input control' });
    await harness.user.selectOptions(attribute, 'name');
    await harness.user.type(
      dialog.getByRole('textbox', { name: 'Question text' }),
      'What are they called?',
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    // The researcher never touched the control, so nothing about how either
    // attribute is collected may have changed.
    expect(asRecord(personVariables(harness).name).component).toBe('Text');
    expect(asRecord(personVariables(harness).notes).component).toBe('TextArea');
  });

  /**
   * The same rule where there is no attribute yet: the kind of answer decides
   * which controls exist, so changing it is the same rebinding. A control left
   * over from the previous kind is one the variable schema refuses outright —
   * a `number` is not collected with a `Text` box — so the invention is turned
   * away with the codebook's words for a draft the researcher never authored.
   */
  it('offers the invented attribute’s own controls when its kind of answer changes', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    const dialog = await openField(harness, 'Create new form field');
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Attribute' }),
      CREATE_NEW_ATTRIBUTE,
    );
    const kind = await dialog.findByRole('combobox', {
      name: 'Kind of answer',
    });
    await harness.user.selectOptions(kind, 'text');
    await waitFor(() => expect(inputControl(dialog)).toHaveValue('Text'));

    await harness.user.selectOptions(kind, 'number');
    await waitFor(() => expect(inputControl(dialog)).toHaveValue('Number'));

    await harness.user.type(
      await dialog.findByRole('textbox', { name: 'Attribute name' }),
      'household_size',
    );
    await harness.user.type(
      dialog.getByRole('textbox', { name: 'Question text' }),
      'How many people live there?',
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    expect(savedAttribute(harness, 'household_size')?.[1]).toMatchObject({
      type: 'number',
      component: 'Number',
    });
  });
});

/**
 * A collaborator changing how the bound attribute is collected, under an open
 * row.
 *
 * The other half of the rebinding rule, and the same write either way: the row
 * saves its control to the CODEBOOK, so a control the row is still showing
 * after the codebook has moved is not a stale label — saving anything else in
 * the row puts it back, and the collaborator's change is undone in every form
 * that asks for the attribute, by a researcher who only rewrote a question.
 *
 * The row is not rebound, so nothing about which attribute this is has
 * changed: what changed is the codebook's own answer to a question the row is
 * showing on its behalf.
 */
describe('a control the collaborator changed under an open row', () => {
  const collectItWith = (
    harness: ReturnType<typeof renderStageEditor>,
    component: string,
  ) => {
    harness.receiveCodebookUpdate({
      node: {
        person: {
          ...personDocument(harness),
          variables: {
            ...personVariables(harness),
            relationship_to_ego: {
              ...asRecord(personVariables(harness).relationship_to_ego),
              component,
            },
          },
        },
      },
    });
  };

  const inputControl = (dialog: ReturnType<typeof within>) =>
    dialog.getByRole('combobox', { name: 'Input control' });

  it('shows the new control, and saving the row leaves it alone', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    const dialog = await openField(harness, 'Edit field');
    expect(
      await dialog.findByRole('combobox', { name: 'Input control' }),
    ).toHaveValue('Text');

    collectItWith(harness, 'TextArea');
    await waitFor(() => expect(inputControl(dialog)).toHaveValue('TextArea'));

    // An edit about the QUESTION, which is the whole point: the researcher
    // never went near the control.
    const question = dialog.getByRole('textbox', { name: 'Question text' });
    await harness.user.clear(question);
    await harness.user.type(question, 'How do you know this person?');
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    expect(
      asRecord(personVariables(harness).relationship_to_ego).component,
    ).toBe('TextArea');
  });

  /**
   * And the answer the researcher DID give stands, however the codebook moves
   * afterwards. The control the row shows is only the codebook's until they
   * answer it; from then on it is theirs, and a codebook that later happens to
   * agree with them does not turn it back into a value that may be overwritten.
   */
  it('keeps the control the researcher chose, whatever the codebook does next', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    const dialog = await openField(harness, 'Edit field');
    await harness.user.selectOptions(
      await dialog.findByRole('combobox', { name: 'Input control' }),
      'TextArea',
    );

    // The collaborator arrives at the researcher's answer, and then leaves it.
    collectItWith(harness, 'TextArea');
    await waitFor(() => expect(inputControl(dialog)).toHaveValue('TextArea'));
    collectItWith(harness, 'Text');

    await waitFor(() => expect(inputControl(dialog)).toHaveValue('TextArea'));
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    expect(
      asRecord(personVariables(harness).relationship_to_ego).component,
    ).toBe('TextArea');
  });
});

/**
 * Losing the lease with a codebook editor open over the row.
 *
 * The row dialog itself deliberately survives lease loss — a researcher who
 * has just been made a spectator keeps what they had written, and the save
 * says why it cannot be taken. An editor opened FROM that row holds a draft of
 * exactly the same kind, made in exactly the same session, so unmounting it
 * throws away more of the researcher's work than the surface it was opened
 * from ever would. What goes is the ability to start another one.
 */
describe('a codebook editor open over a row when the lease goes', () => {
  const loseTheLease = (harness: ReturnType<typeof renderStageEditor>) => {
    act(() => {
      harness.session.setAccess({ mode: 'readOnly', reason: 'lease-lost' });
    });
  };

  it('keeps the rules editor on screen, with its draft, and refuses the save', async () => {
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

    loseTheLease(harness);

    // Still on screen, still holding what the researcher had chosen...
    expect(screen.getByRole('checkbox', { name: 'Required' })).toBeChecked();
    // ...and unable to write it, which is what the lease actually means.
    expect(
      screen.getByRole('button', { name: 'Save validation' }),
    ).toBeDisabled();
  });

  it('keeps the attribute editor on screen, with its draft, and refuses the save', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    const dialog = await openField(harness, 'Edit field', 1);
    await harness.user.click(
      dialog.getByRole('button', { name: EDIT_ANSWER_LABELS }),
    );
    await screen.findByRole('button', { name: 'Save attribute' });
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Label for “true”' }),
      'Yes, definitely',
    );

    loseTheLease(harness);

    expect(
      screen.getByRole('textbox', { name: 'Label for “true”' }),
    ).toHaveValue('Yes, definitely');
    expect(
      screen.getByRole('button', { name: 'Save attribute' }),
    ).toBeDisabled();
    expect(personVariables(harness).flagged).not.toHaveProperty('options');
  });

  /**
   * The other half of the rule: what a spectator may not do is START one.
   * Every launch control goes, so the row dialog left open by a lost lease
   * offers no way into the codebook at all.
   */
  it('offers no way to open another one', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    const dialog = await openField(harness, 'Edit field');
    expect(
      dialog.getByRole('button', { name: 'Set rules for this answer' }),
    ).toBeInTheDocument();

    loseTheLease(harness);

    expect(
      dialog.queryByRole('button', { name: 'Set rules for this answer' }),
    ).toBeNull();
  });
});

/**
 * The same rule, met from the other direction: the SECTION these editors read
 * disappearing while one of them is open.
 *
 * A collaborator deleting the node type takes the whole codebook document
 * away, and the launch controls with it — there is nothing left to start an
 * edit against. What was already started is a draft the researcher made in
 * this session, exactly like the one a lost lease keeps, and the row dialog
 * around it survives the same arrival. So the editor stays, holding what they
 * had, with its save refused for the reason it is actually refused: there is
 * no section to write into.
 */
describe('a codebook editor open over a row when its section goes', () => {
  const deleteThePersonType = (
    harness: ReturnType<typeof renderStageEditor>,
  ) => {
    harness.receiveCodebookUpdate({ node: { person: null } });
  };

  it('keeps the rules editor on screen, with its draft, and refuses the save', async () => {
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

    deleteThePersonType(harness);

    expect(screen.getByRole('checkbox', { name: 'Required' })).toBeChecked();
    expect(
      screen.getByRole('button', { name: 'Save validation' }),
    ).toBeDisabled();
  });

  it('keeps the attribute editor on screen, with its draft, and refuses the save', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    const dialog = await openField(harness, 'Edit field', 1);
    await harness.user.click(
      dialog.getByRole('button', { name: EDIT_ANSWER_LABELS }),
    );
    await screen.findByRole('button', { name: 'Save attribute' });
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Label for “true”' }),
      'Yes, definitely',
    );

    deleteThePersonType(harness);

    expect(
      screen.getByRole('textbox', { name: 'Label for “true”' }),
    ).toHaveValue('Yes, definitely');
    expect(
      screen.getByRole('button', { name: 'Save attribute' }),
    ).toBeDisabled();
  });

  /** And the other half, the same as the lease's: nothing new may be started. */
  it('offers no way to open another one', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    const dialog = await openField(harness, 'Edit field');
    expect(
      dialog.getByRole('button', { name: 'Set rules for this answer' }),
    ).toBeInTheDocument();

    deleteThePersonType(harness);

    expect(
      dialog.queryByRole('button', { name: 'Set rules for this answer' }),
    ).toBeNull();
  });
});
/**
 * The stage repointed at ANOTHER type the codebook holds, with an editor open.
 *
 * A section vanishing is not the only way an open editor can lose the ground
 * it was opened on. A collaborator can move the stage from one existing type
 * to another, and every live read here then answers about a codebook this
 * editor was never opened against — while the attribute it is editing is named
 * by a RECORD KEY, and a record key belongs to exactly one type: the schema
 * refuses a codebook that reuses one across types (`CodebookSchema`), because
 * the interview flattens every type's attributes into a single map. So the
 * type the stage moves to never holds what the open editor is editing, and
 * reading the live section leaves that editor looking its attribute up in a
 * document the attribute was never in — telling the researcher their work has
 * gone stale when nothing about it has.
 *
 * The rule is the one the vanished section met: an open editor reads the
 * section it was OPENED against until it closes, and only the launch controls
 * follow the live one. A stage that no longer collects about that type is a
 * stage this editor has nothing to write for, which makes it read-only rather
 * than closed — the draft inside it is the researcher's, made in this session,
 * exactly like the row dialog's around it.
 */
describe('a codebook editor open over a row when the stage is repointed', () => {
  /**
   * What the rules editor shows INSTEAD of the rules once the document it is
   * reading has no such attribute. Written out, so a catalog that lost the
   * sentence cannot pass.
   */
  const ATTRIBUTE_UNAVAILABLE =
    'The latest entity data no longer contains this attribute.';

  /**
   * An attribute of the other type for the repointed stage to collect.
   *
   * Every attribute the fixture's family members already have is spoken for by
   * the pedigree stages, which own the roles they fill, so a form may collect
   * none of them.
   */
  const familyMemberDocument = (
    harness: ReturnType<typeof renderStageEditor>,
  ) =>
    asRecord(
      harness.host.getSnapshot().protocolSections[
        sectionId({ kind: 'codebookNode', typeId: 'family_member' })
      ],
    );

  const giveFamilyMembersSomethingToCollect = (
    harness: ReturnType<typeof renderStageEditor>,
  ) => {
    const document = familyMemberDocument(harness);
    harness.receiveCodebookUpdate({
      node: {
        family_member: {
          ...document,
          variables: {
            ...asRecord(document.variables),
            fm_notes: { name: 'fm_notes', type: 'text', component: 'Text' },
          },
        },
      },
    });
  };

  /**
   * A collaborator points the stage at that other type.
   *
   * The fields move with it, in the same edit, because they have to: a host
   * refuses a stage whose fields ask for attributes the type it collects about
   * does not have. Sent as a STAGE edit through the host, the way the rename
   * is — `receiveCodebookUpdate` deliberately keeps this session's own stage,
   * so no codebook arrival could say this.
   */
  const repointTheStage = (harness: ReturnType<typeof renderStageEditor>) => {
    const stageSection = sectionId({
      kind: 'stage',
      stageId: harness.seeded.id,
    });
    const sections = harness.host.getSnapshot().protocolSections;
    const result = harness.host.submit({
      id: 'collaborator-repoint',
      description: 'Collect about family members instead, from another session',
      edits: [
        {
          kind: 'update',
          sectionId: stageSection,
          expectedContentHash: contentHash(sections[stageSection] ?? {}),
          commands: [
            {
              op: 'set',
              key: 'subject',
              value: { entity: 'node', type: 'family_member' },
            },
            {
              op: 'set',
              key: 'form',
              value: {
                fields: [
                  { variable: 'fm_notes', prompt: 'Anything else to add?' },
                ],
              },
            },
          ],
        },
      ],
      authority: {
        sectionId: stageSection,
        leaseOwner: FIXTURE_SESSION_OWNER,
        leaseEpoch: 1n,
      },
    });
    if (result.status !== 'applied') {
      throw new Error(
        `the collaborator’s repoint did not apply: ${JSON.stringify(result)}`,
      );
    }
    // And then told to this session, under the revision the host issued for
    // it: an authoritative replacement of the stage being edited, which is
    // what `reseedStageForm` writes into the controls on screen. By hand,
    // because the harness's own arrival helper is for CODEBOOK changes and
    // deliberately keeps the session's copy of the edited stage — the one
    // section this arrival is about.
    const { protocolSections, manifestRevision } = harness.host.getSnapshot();
    const stageDocument = asRecord(protocolSections[stageSection]);
    act(() => {
      harness.session.receiveAuthoritativeUpdate({
        protocolSections,
        manifestRevision,
      });
      harness.session.acknowledge({
        // Which stage this is belongs to the session, not to a draft.
        fields: Object.fromEntries(
          Object.entries(stageDocument).filter(
            ([key]) => key !== 'id' && key !== 'type',
          ),
        ),
        // Nothing of this session's is in it: the researcher has saved
        // nothing, and what they are writing is a row dialog's own draft.
        throughBatchId: 0,
        manifestRevision,
      });
    });
  };

  /**
   * Opens a row the researcher is still writing, bound to an attribute of the
   * type the stage collects about now.
   *
   * A new row rather than one of the saved fields: the fields belong to the
   * stage and move with it when it is repointed, and this row is the
   * researcher's own unfinished work, which is what is at stake here.
   */
  const startARowCollecting = async (
    harness: ReturnType<typeof renderStageEditor>,
    variableId: string,
  ) => {
    const dialog = await openField(harness, 'Create new form field');
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Attribute' }),
      variableId,
    );
    return dialog;
  };

  it('keeps the rules editor on the attribute it was opened on, and refuses the save', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });
    giveFamilyMembersSomethingToCollect(harness);

    const dialog = await startARowCollecting(harness, 'age');
    await harness.user.click(
      await dialog.findByRole('button', { name: 'Set rules for this answer' }),
    );
    await screen.findByRole('button', { name: 'Save validation' });
    await harness.user.click(
      screen.getByRole('checkbox', { name: 'Required' }),
    );

    repointTheStage(harness);

    // Still reading the attribute it was opened on, in the codebook that holds
    // it: the rules themselves, rather than the sentence an editor shows in
    // their place when the document it was handed has no such attribute.
    expect(screen.getByRole('checkbox', { name: 'Required' })).toBeChecked();
    expect(screen.queryByText(ATTRIBUTE_UNAVAILABLE)).toBeNull();
    // And unable to write them, because the stage no longer collects about
    // anyone these rules would be asked of.
    expect(
      screen.getByRole('button', { name: 'Save validation' }),
    ).toBeDisabled();
  });

  it('keeps the attribute editor on screen, with its draft, and refuses the save', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });
    giveFamilyMembersSomethingToCollect(harness);

    const dialog = await openField(harness, 'Create new form field');
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Attribute' }),
      CREATE_NEW_ATTRIBUTE,
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

    repointTheStage(harness);

    // The attribute was being invented for a person, and it is a person's
    // codebook it would have been written into.
    expect(screen.getByRole('textbox', { name: 'Attribute name' })).toHaveValue(
      'contact_setting',
    );
    expect(
      screen.getByRole('button', { name: 'Create attribute' }),
    ).toBeDisabled();
  });

  /**
   * The row's OWN answer about how the attribute is collected, when the type
   * under it changes.
   *
   * The control a row shows is written back to the CODEBOOK when the row is
   * saved, so a control still standing after the stage has moved to another
   * type would be a control written onto whatever that type keeps under the
   * same key. It cannot be: a key belongs to one type, so the type the stage
   * moved to holds nothing under the row's, there is no control to offer for
   * an attribute that is not there, and the dialog says so and refuses.
   */
  it('cannot write the control the researcher chose onto the type the stage moved to', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });
    giveFamilyMembersSomethingToCollect(harness);

    const dialog = await startARowCollecting(harness, 'name');
    await harness.user.selectOptions(
      await dialog.findByRole('combobox', { name: 'Input control' }),
      'TextArea',
    );

    repointTheStage(harness);

    expect(
      dialog.queryByRole('combobox', { name: 'Input control' }),
    ).toBeNull();
    expect(await dialog.findByText(NO_WAY_TO_ANSWER)).toBeInTheDocument();
    const add = dialog.getByRole('button', { name: 'Add' });
    expect(add).toHaveAttribute('aria-disabled', 'true');

    // Pressed anyway, because `aria-disabled` announces a refusal rather than
    // preventing one — and nothing of the researcher's control reaches the
    // codebook of the type the stage moved to.
    await harness.user.click(add);
    const variables = asRecord(familyMemberDocument(harness).variables);
    expect(variables.name).toBeUndefined();
    expect(asRecord(variables.fm_notes).component).toBe('Text');
  });

  /** And the other half, the same as the lease's: nothing new may be started. */
  it('offers no way to open another one', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });
    giveFamilyMembersSomethingToCollect(harness);

    const dialog = await startARowCollecting(harness, 'age');
    expect(
      await dialog.findByRole('button', { name: 'Set rules for this answer' }),
    ).toBeInTheDocument();

    repointTheStage(harness);

    expect(
      dialog.queryByRole('button', { name: 'Set rules for this answer' }),
    ).toBeNull();
  });
});

/**
 * A protocol whose codebook happens to hold the id the picker's create option
 * is spelled with.
 *
 * Attribute record keys are the researcher's, not this package's:
 * `VariableNameSchema` accepts letters, digits and `._:-`, and the uuids this
 * section mints are only what IT creates — an imported protocol, or one
 * written by hand, may key an attribute anything that regex allows. So the
 * create option's value has to be something no attribute can ever be called,
 * or the picker offers two options with one value and choosing the real
 * attribute reads as a request to invent one.
 */
describe('an attribute id that collides with the create option', () => {
  const COLLIDING_ID = '__create_new_attribute__';

  const giveThePersonThatAttribute = (
    harness: ReturnType<typeof renderStageEditor>,
  ) => {
    harness.receiveCodebookUpdate({
      node: {
        person: {
          ...personDocument(harness),
          variables: {
            ...personVariables(harness),
            [COLLIDING_ID]: {
              name: 'nickname',
              type: 'text',
              component: 'Text',
            },
          },
        },
      },
    });
  };

  it('offers it once, as itself', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });
    giveThePersonThatAttribute(harness);

    const dialog = await openField(harness, 'Create new form field');

    expect(
      offeredAttributes(dialog).filter((value) => value === COLLIDING_ID),
    ).toEqual([COLLIDING_ID]);
    // And the create option is still there, under a value the codebook could
    // not have given an attribute even if a researcher had tried.
    const createOption = within(
      dialog.getByRole('combobox', { name: 'Attribute' }),
    ).getByRole('option', { name: 'Create a new attribute…' });
    expect((createOption as HTMLOptionElement).value).not.toMatch(
      /^[a-zA-Z0-9._:-]+$/,
    );
  });

  it('binds the field to it rather than inventing a second one', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });
    giveThePersonThatAttribute(harness);
    const before = Object.keys(personVariables(harness)).length;

    const dialog = await openField(harness, 'Create new form field');
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Attribute' }),
      COLLIDING_ID,
    );
    // The attribute exists, so the row has nothing to name and nothing to
    // decide the kind of answer for.
    expect(
      dialog.queryByRole('textbox', { name: 'Attribute name' }),
    ).toBeNull();
    await harness.user.type(
      dialog.getByRole('textbox', { name: 'Question text' }),
      'What do people call them?',
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    expect(fieldsOf(await harness.submit()).at(-1)).toEqual({
      id: expect.any(String) as unknown as string,
      variable: COLLIDING_ID,
      prompt: 'What do people call them?',
    });
    expect(Object.keys(personVariables(harness))).toHaveLength(before);
  });
});

/**
 * A row whose attribute stops being renderable while the researcher is in it.
 *
 * `COLLECTS_A_POSITION` above is the same rule met on arrival — a protocol
 * that already held an uncollectable attribute. These are the two ways a row
 * can arrive at it from a state that was fine: a collaborator deleting the
 * attribute, and a collaborator changing what kind of answer it holds. Both
 * leave the picker naming an id and no control to offer for it, which is where
 * a refusal used to be filed against `_component` — a field with nothing
 * mounted, no error region, and a dialog that would not close.
 */
describe('an attribute that stops being collectable under an open row', () => {
  /** The person type as it is now, minus one attribute. */
  const deleteFromTheCodebook = (
    harness: ReturnType<typeof renderStageEditor>,
    variableId: string,
  ) => {
    const { [variableId]: _removed, ...variables } = personVariables(harness);
    harness.receiveCodebookUpdate({
      node: { person: { ...personDocument(harness), variables } },
    });
  };

  const expectTheSaveWithheld = async (dialog: ReturnType<typeof within>) => {
    expect(await dialog.findByText(NO_WAY_TO_ANSWER)).toBeInTheDocument();
    const save = dialog.getByRole('button', { name: 'Save' });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    expect(save).toHaveAccessibleDescription(
      /This field’s attribute gives the participant no way to answer\./,
    );
  };

  it('says so when a collaborator deletes it', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    const dialog = await openField(harness, 'Edit field');
    // Nothing wrong yet: the attribute is a text box, and the row says so.
    expect(
      await dialog.findByRole('combobox', { name: 'Input control' }),
    ).toBeInTheDocument();

    deleteFromTheCodebook(harness, 'relationship_to_ego');

    await expectTheSaveWithheld(dialog);
    // Pressed anyway — `aria-disabled` announces, it does not prevent — and
    // the draft is still on screen with the reason above it.
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(dialog.getByText(NO_WAY_TO_ANSWER)).toBeInTheDocument();
  });

  it('says so when a collaborator changes what it records', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    const dialog = await openField(harness, 'Edit field');
    await dialog.findByRole('combobox', { name: 'Input control' });

    // A position rather than an answer, so no control can collect it.
    harness.receiveCodebookUpdate({
      node: {
        person: {
          ...personDocument(harness),
          variables: {
            ...personVariables(harness),
            relationship_to_ego: {
              name: 'relationship_to_ego',
              type: 'layout',
            },
          },
        },
      },
    });

    await expectTheSaveWithheld(dialog);
  });

  /**
   * And the way out, from the deleted case: the id the row still names is the
   * only thing keeping the refusal, so choosing another attribute lifts it and
   * the row commits.
   *
   * Bound to an attribute the codebook already collects with a text box, so
   * the row's save asks the host for nothing — the protocol it is holding
   * still has the family pedigree pointed at the attribute this test deleted,
   * and any codebook write would be refused for that rather than for anything
   * this row did. The stage is read from the draft for the same reason.
   */
  it('gives the save back when the row is bound somewhere else', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    const dialog = await openField(harness, 'Edit field');
    await dialog.findByRole('combobox', { name: 'Input control' });
    deleteFromTheCodebook(harness, 'relationship_to_ego');
    await dialog.findByText(NO_WAY_TO_ANSWER);

    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Attribute' }),
      'name',
    );
    await waitFor(() =>
      expect(dialog.queryByText(NO_WAY_TO_ANSWER)).toBeNull(),
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    expect(
      asRecord(
        asRecord(harness.session.getSnapshot().editedSection.fields).form,
      ).fields,
    ).toEqual([
      {
        variable: 'name',
        prompt: "What is this person's relationship to you?",
      },
      { variable: 'flagged', prompt: 'Does this person have this attribute?' },
    ]);
  });
});

/**
 * Where focus goes when a codebook editor closes and its trigger has gone.
 *
 * Two of the three surfaces keep their own trigger, and the create's does not
 * survive the edit it opens — which is why that one already walks back to the
 * row's picker. The other two can lose theirs just as completely, because what
 * offers them is a fact about the LIVE codebook: a collaborator changing what
 * kind of answer an attribute holds takes the values button away, deleting it
 * takes both away, and a lost lease takes every launch control away while the
 * editor deliberately stays open. A `finalFocus` naming a button that is no
 * longer in the document leaves focus on `<body>`, where the next Tab starts
 * at the top of the page and a screen-reader user is returned to the document
 * rather than to the row they were in.
 */
describe('closing a codebook editor whose trigger has gone', () => {
  const closeTheEditor = async (
    harness: ReturnType<typeof renderStageEditor>,
  ) => {
    const editor = screen.getAllByRole('dialog').at(-1)!;
    await harness.user.click(
      within(editor).getByRole('button', { name: 'Close' }),
    );
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(1),
    );
  };

  it('returns to the row’s picker when the attribute changes kind', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    const dialog = await openField(harness, 'Edit field', 1);
    await harness.user.click(
      dialog.getByRole('button', { name: EDIT_ANSWER_LABELS }),
    );
    await screen.findByRole('button', { name: 'Save attribute' });

    // A boolean is the only kind with answer labels to change, so this takes
    // the button that opened this editor away under the researcher.
    harness.receiveCodebookUpdate({
      node: {
        person: {
          ...personDocument(harness),
          variables: {
            ...personVariables(harness),
            flagged: { name: 'flagged', type: 'text', component: 'Text' },
          },
        },
      },
    });

    await closeTheEditor(harness);
    expect(document.activeElement).toBe(
      dialog.getByRole('combobox', { name: 'Attribute' }),
    );
  });

  it('returns to the row’s picker when the attribute is deleted', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    const dialog = await openField(harness, 'Edit field');
    await harness.user.click(
      dialog.getByRole('button', { name: 'Set rules for this answer' }),
    );
    await screen.findByRole('button', { name: 'Save validation' });

    const { relationship_to_ego: _gone, ...variables } =
      personVariables(harness);
    harness.receiveCodebookUpdate({
      node: { person: { ...personDocument(harness), variables } },
    });

    await closeTheEditor(harness);
    expect(document.activeElement).toBe(
      dialog.getByRole('combobox', { name: 'Attribute' }),
    );
  });
});

/**
 * A list entry that is not a field at all.
 *
 * Nothing in the editor can author one — every route through this section
 * writes a record — so it stands for the protocol that arrives holding one: an
 * import, a migration, or another session. The schema refuses such a stage
 * (`FormFieldSchema`), so the save fails whatever this section says; what the
 * section owes the researcher is the reason, in the place they are looking,
 * rather than a list that reports itself complete while the save is refused
 * somewhere else.
 */
describe('a form whose list holds something that is not a field', () => {
  const WITH_A_MALFORMED_ENTRY = {
    id: 'alter-form-1',
    type: 'AlterForm',
    fields: {
      ...loadFixtureStage('alter-form-1').fields,
      form: {
        fields: [
          { variable: 'relationship_to_ego', prompt: 'How do you know them?' },
          null,
        ],
      },
    },
  } as const;

  it('says so above the list, and refuses the save', async () => {
    const harness = renderStageEditor({
      stage: WITH_A_MALFORMED_ENTRY,
      sections: <FormFieldsSection subject="node" />,
    });

    expect(await harness.submit()).toBeNull();
    expect(screen.getByText(NOT_A_FIELD)).toBeInTheDocument();
  });
});

/**
 * A whole list that is not a list.
 *
 * Worse than a single unshowable entry, and from the same protocols: the
 * shared list has no entries at all to turn into rows, so the researcher is
 * looking at a form that reports itself finished while the schema refuses the
 * stage. `FormFieldArraySchema.optional()` spells "this pedigree asks nothing
 * about each family member" as an ABSENT value and only that, so `undefined`
 * is the one thing here that means absence — a string or an object left at
 * `nodeConfig.form` is malformed, and gets the sentence a `null` row gets.
 */
describe('a form whose list is not a list', () => {
  it('says so when an optional form holds a string', async () => {
    const harness = renderStageEditor({
      stage: pedigreeHoldingForm('fm_name'),
      sections: familyMemberForm({ optional: true }),
    });

    expect(await harness.submit()).toBeNull();
    expect(screen.getByText(NOT_A_FIELD)).toBeInTheDocument();
  });

  it('says so when an optional form holds an object', async () => {
    const harness = renderStageEditor({
      // The `form.fields` shape the three form stages use, written one level
      // too high — which is what a hand-edit or a half-applied migration
      // leaves behind here.
      stage: pedigreeHoldingForm({
        fields: [{ variable: 'fm_name', prompt: 'What is their name?' }],
      }),
      sections: familyMemberForm({ optional: true }),
    });

    expect(await harness.submit()).toBeNull();
    expect(screen.getByText(NOT_A_FIELD)).toBeInTheDocument();
  });

  it('says so of a required form too, rather than asking for a first field', async () => {
    const harness = renderStageEditor({
      stage: {
        id: 'alter-form-1',
        type: 'AlterForm',
        fields: {
          ...loadFixtureStage('alter-form-1').fields,
          form: { fields: 'relationship_to_ego' },
        },
      },
      sections: <FormFieldsSection subject="node" />,
    });

    expect(await harness.submit()).toBeNull();
    expect(screen.getByText(NOT_A_FIELD)).toBeInTheDocument();
    // Adding a field would not repair this stage — the value the protocol
    // holds has to come out first — so the sentence that asks for one would
    // send the researcher somewhere that cannot help.
    expect(
      screen.queryByText(
        'Add at least one field. A form with no fields collects nothing.',
      ),
    ).not.toBeInTheDocument();
  });

  it('still accepts an optional form that holds nothing at all', async () => {
    // The fixture pedigree asks nothing about each family member: its
    // `nodeConfig` has no `form` key, which is the shape the schema calls
    // absent.
    const pedigree = loadFixtureStage('family-pedigree-1');
    const harness = renderStageEditor({
      stage: pedigree,
      sections: familyMemberForm({ optional: true }),
    });

    const request = await harness.submit();
    expect(request).not.toBeNull();
    expect(pedigreeForm(request)).toBeUndefined();
    expect(screen.queryByText(NOT_A_FIELD)).not.toBeInTheDocument();
  });
});

/**
 * An attribute answered on a scale is its two end labels.
 *
 * `REQUIRED_PARAMETERS` makes both of them settings the codebook editor
 * refuses to save without, for the reason a categorical attribute needs two
 * values: a slider with nothing written at either end asks the participant to
 * place themselves on a line that means nothing. Invented from a name and a
 * kind alone, that is exactly what the interview would render — the schema
 * takes a scalar with no `parameters` at all — so the row sends the researcher
 * to the editor that authors both, as it already does for a list of values.
 */
describe('inventing an attribute answered on a scale', () => {
  const startInventingAScale = async (
    harness: ReturnType<typeof renderStageEditor>,
  ) => {
    const dialog = await openField(harness, 'Create new form field');
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Attribute' }),
      CREATE_NEW_ATTRIBUTE,
    );
    await harness.user.selectOptions(
      await dialog.findByRole('combobox', { name: 'Kind of answer' }),
      'scalar',
    );
    return dialog;
  };

  it('asks for its end labels instead of offering a name box', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    const dialog = await startInventingAScale(harness);

    expect(
      await dialog.findByRole('button', {
        name: 'Create this attribute and what it accepts',
      }),
    ).toBeInTheDocument();
    expect(
      dialog.queryByRole('textbox', { name: 'Attribute name' }),
    ).toBeNull();
    expect(
      dialog.getByText(
        'An attribute answered on a scale needs a label at each end, so it is created together with them.',
      ),
    ).toBeInTheDocument();
  });

  it('writes both labels onto the attribute, and binds the field to it', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    const dialog = await startInventingAScale(harness);
    await harness.user.click(
      await dialog.findByRole('button', {
        name: 'Create this attribute and what it accepts',
      }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Attribute name' }),
      'closeness',
    );
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Minimum label' }),
      'Not at all close',
    );
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Maximum label' }),
      'As close as can be',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Create attribute' }),
    );

    const created = await waitFor(() => {
      const entry = savedAttribute(harness, 'closeness');
      if (entry === undefined) throw new Error('the attribute was not created');
      return entry;
    });
    expect(created[1]).toMatchObject({
      type: 'scalar',
      parameters: {
        minLabel: 'Not at all close',
        maxLabel: 'As close as can be',
      },
    });
    // A scalar the schema would refuse outright: its own strict object admits
    // no `options` key, so the empty list a list-of-values invention seeds
    // must never reach a scale.
    expect(created[1]).not.toHaveProperty('options');

    await harness.user.selectOptions(
      await dialog.findByRole('combobox', { name: 'Input control' }),
      'VisualAnalogScale',
    );
    await harness.user.type(
      dialog.getByRole('textbox', { name: 'Question text' }),
      'How close are you?',
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    expect(fieldsOf(await harness.submit()).at(-1)).toEqual({
      id: expect.any(String) as unknown as string,
      variable: created[0],
      prompt: 'How close are you?',
    });
  });

  /**
   * The belt behind the control: a row that reaches the commit still naming a
   * scale it never created is refused there rather than quick-creating one
   * with no labels on it.
   */
  it('refuses a row that named a scale it never created', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    const dialog = await startInventingAScale(harness);
    await dialog.findByRole('button', {
      name: 'Create this attribute and what it accepts',
    });
    await harness.user.type(
      dialog.getByRole('textbox', { name: 'Question text' }),
      'How close are you?',
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));

    expect(
      await dialog.findByText(
        'Create this attribute and what it accepts before adding the field that collects it.',
      ),
    ).toBeInTheDocument();
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(savedAttribute(harness, 'closeness')).toBeUndefined();
  });
});

/**
 * A collaborator deleting the attribute an open codebook editor is editing.
 *
 * The section is still there and the stage still points at the same type, so
 * nothing the launch controls read has changed — and the editor beneath cannot
 * say this for itself: `VariableEditor` reads an absent attribute as one whose
 * TYPE changed, so the draft stayed writable and the save came back "the
 * attribute type changed elsewhere. Close and reopen this editor" about an
 * attribute there is nothing left to reopen.
 */
describe('a codebook editor open over a row when its attribute is deleted', () => {
  const deleteFlagged = (harness: ReturnType<typeof renderStageEditor>) => {
    const { flagged: _removed, ...variables } = personVariables(harness);
    harness.receiveCodebookUpdate({
      node: { person: { ...personDocument(harness), variables } },
    });
  };

  it('keeps the attribute editor on screen, with its draft, and says what happened', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    const dialog = await openField(harness, 'Edit field', 1);
    await harness.user.click(
      dialog.getByRole('button', { name: EDIT_ANSWER_LABELS }),
    );
    await screen.findByRole('button', { name: 'Save attribute' });
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Label for “true”' }),
      'Yes, definitely',
    );

    deleteFlagged(harness);

    // The draft the researcher made is still in front of them...
    expect(
      screen.getByRole('textbox', { name: 'Label for “true”' }),
    ).toHaveValue('Yes, definitely');
    // ...with the reason it cannot be written, in its own words rather than
    // the type-changed refusal that used to answer a press of Save.
    expect(
      await screen.findByText(
        'This attribute is no longer in the codebook, so these changes cannot be saved.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save attribute' }),
    ).toBeDisabled();
    expect(
      screen.queryByText(
        'The attribute type changed elsewhere. Close and reopen this editor before saving.',
      ),
    ).toBeNull();
  });

  /**
   * The rules editor answers this for itself (`attributeUnavailableTitle`), so
   * the only thing to check there is that it is not told the same thing twice.
   */
  it('leaves the rules editor to say it in its own words', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });

    const dialog = await openField(harness, 'Edit field', 1);
    await harness.user.click(
      dialog.getByRole('button', { name: 'Set rules for this answer' }),
    );
    await screen.findByRole('button', { name: 'Save validation' });

    deleteFlagged(harness);

    expect(
      await screen.findByText(
        'The latest entity data no longer contains this attribute.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        'This attribute is no longer in the codebook, so these changes cannot be saved.',
      ),
    ).toBeNull();
  });
});

/**
 * A dismissal while a nested codebook editor's save is in flight.
 *
 * The request outlives the dialog: the handler awaiting it stays alive, so a
 * refusal is never shown to anybody and a success still runs `onComplete` —
 * silently binding the row to an attribute the researcher watched no editor
 * finish. `SubjectSection`'s create dialog already withholds every way out
 * until the compound edit answers, and these three are the same act.
 */
describe('dismissing a codebook editor while its save is in flight', () => {
  /** Holds the compound edit open, and hands back the release. */
  const holdTheCompoundEdit = (
    harness: ReturnType<typeof renderStageEditor>,
  ) => {
    const send = harness.session.requestCompoundEdit.bind(harness.session);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(harness.session, 'requestCompoundEdit').mockImplementation(
      async (request) => {
        await held;
        return send(request);
      },
    );
    return () => {
      release();
    };
  };

  it('refuses every way out of the attribute editor until it answers', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });
    const release = holdTheCompoundEdit(harness);

    const dialog = await openField(harness, 'Edit field', 1);
    await harness.user.click(
      await dialog.findByRole('button', { name: EDIT_ANSWER_LABELS }),
    );
    await screen.findByRole('button', { name: 'Save attribute' });
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Label for “true”' }),
      'Yes, definitely',
    );
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Label for “false”' }),
      'No, not at all',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Save attribute' }),
    );

    // Escape and a press outside are the two routes left; the close button is
    // taken away rather than left on screen doing nothing.
    await harness.user.keyboard('{Escape}');
    await harness.user.click(document.body);
    expect(
      screen.getByRole('textbox', { name: 'Label for “true”' }),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: 'Close' })).toHaveLength(0);

    release();
    await waitFor(() =>
      expect(asRecord(personVariables(harness).flagged).options).toHaveLength(
        2,
      ),
    );
  });

  it('refuses every way out of the rules editor until it answers', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });
    const release = holdTheCompoundEdit(harness);

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

    await harness.user.keyboard('{Escape}');
    await harness.user.click(document.body);
    expect(
      screen.getByRole('checkbox', { name: 'Required' }),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: 'Close' })).toHaveLength(0);

    release();
    await waitFor(() =>
      expect(
        asRecord(
          asRecord(personVariables(harness).relationship_to_ego).validation,
        ).required,
      ).toBe(true),
    );
  });
});
