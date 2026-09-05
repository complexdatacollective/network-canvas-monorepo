import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentType, useMemo } from 'react';
import { describe, expect, it } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { useStageEditorController } from '../../../controller.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
} from '../../../session.ts';
import ProtocolArrayField from '../../ProtocolArrayField.tsx';
import StageEditorShell from '../../StageEditorShell.tsx';
import AssignAttributes, {
  committedAttributeVariableIds,
  makeAssignAttributesValidation,
  type AttributeValue,
} from '../AssignAttributes.tsx';

const NO_DRAFT_VARIABLES: ReadonlySet<string> = new Set();

/**
 * A stand-in for the host's variable picker. Everything this list needs from a
 * picker is a control that reports a variable id; how a host lists, groups and
 * creates them is the host's business, which is why the real one is injected.
 */
const VariablePicker = NativeSelectField as ComponentType<
  Record<string, unknown>
>;

/**
 * Two stages: the one being edited, and a form elsewhere that already collects
 * `worried` with validation. Assigning `worried` from an unvalidated writer
 * would bypass that validation, which is the contradiction the gate names.
 */
const protocolSections: Record<string, SectionDoc> = {
  [sectionId({ kind: 'stageOrder' })]: { stages: ['stage-1', 'stage-2'] },
  [sectionId({ kind: 'stage', stageId: 'stage-1' })]: {
    id: 'stage-1',
    type: 'NameGenerator',
    label: 'People',
    subject: { entity: 'node', type: 'person' },
    prompts: [{ id: 'p1', text: 'Who?' }],
  },
  [sectionId({ kind: 'stage', stageId: 'stage-2' })]: {
    id: 'stage-2',
    type: 'AlterForm',
    label: 'About them',
    subject: { entity: 'node', type: 'person' },
    introductionPanel: { title: 'About', text: 'About' },
    form: { fields: [{ variable: 'worried', prompt: 'Are they worried?' }] },
  },
  [sectionId({ kind: 'codebookNode', typeId: 'person' })]: {
    name: 'Person',
    color: 'node-color-seq-1',
    shape: { default: 'circle' },
    variables: {
      worried: {
        name: 'Worried',
        type: 'boolean',
        validation: { required: true },
      },
      helpful: { name: 'Helpful', type: 'boolean' },
    },
  },
};

const VARIABLE_OPTIONS = [
  { label: 'Worried', value: 'worried', type: 'boolean' },
  { label: 'Helpful', value: 'helpful', type: 'boolean' },
];

function createSession(fields: SectionDoc) {
  return new ProtocolBuilderSessionStore({
    identity: createStageIdentity('NameGenerator', () => 'stage-1'),
    fields,
    protocolSections,
    manifestRevision: { sequence: 1n, hash: 'revision-1' },
    access: { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 1n },
    buildCandidate: ({ stageDocument }) => ({
      name: 'Assign attributes test',
      schemaVersion: 8,
      codebook: {},
      stages: [stageDocument],
    }),
  });
}

/**
 * A picker that can CREATE. The real one is a host surface — it knows how that
 * host lists, groups and creates variables — so all this stands in for is the
 * one affordance that asks for a new attribute by name.
 */
function CreatingVariablePicker({
  onCreateOption,
}: {
  onCreateOption?: (variableName: string) => void;
}) {
  return (
    <button type="button" onClick={() => onCreateOption?.('Brand new')}>
      Create an attribute
    </button>
  );
}

function renderAttributeList(
  session: ProtocolBuilderSessionStore,
  committed: readonly AttributeValue[],
  extra?: Readonly<{
    picker?: ComponentType<Record<string, unknown>>;
    onCreateVariable?: (variableName: string) => Promise<string | undefined>;
  }>,
) {
  function Host() {
    const controller = useStageEditorController(session, 'stage-form');
    const committedVariableIds = useMemo(
      () => committedAttributeVariableIds(committed),
      [],
    );
    const validation = useMemo(
      () =>
        makeAssignAttributesValidation({
          allVariables:
            controller.snapshot.protocolContext.codebook.node?.person
              ?.variables ?? {},
          committedVariableIds,
          draftValidatedVariables: NO_DRAFT_VARIABLES,
          hasValidatedUseElsewhere: () => false,
        }),
      [committedVariableIds, controller.snapshot.protocolContext],
    );

    return (
      <StageEditorShell
        controller={controller}
        actions={({ formId }) => (
          <SubmitButton form={formId}>Finished editing</SubmitButton>
        )}
      >
        <BuilderSection title="Additional attributes">
          <ProtocolArrayField
            name="additionalAttributes"
            label="Additional attributes"
            component={AssignAttributes}
            subject={{ entity: 'node', type: 'person' }}
            variableOptions={VARIABLE_OPTIONS}
            variablePickerComponent={extra?.picker ?? VariablePicker}
            draftValidatedVariables={NO_DRAFT_VARIABLES}
            committedVariableIds={committedVariableIds}
            {...(extra?.onCreateVariable === undefined
              ? {}
              : { onCreateVariable: extra.onCreateVariable })}
            {...validation}
          />
        </BuilderSection>
      </StageEditorShell>
    );
  }

  return render(
    <DialogProvider>
      <Host />
    </DialogProvider>,
  );
}

describe('AssignAttributes', () => {
  it('reads the codebook role a variable already plays from the package context', async () => {
    const user = userEvent.setup();
    const session = createSession({
      label: 'People',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'Who?' }],
      additionalAttributes: [],
    });
    renderAttributeList(session, []);

    await user.click(
      await screen.findByRole('button', {
        name: 'Add new attribute to assign',
      }),
    );

    // `worried` is collected by the OTHER stage's form, which the package's own
    // protocol context is the only source for here. Choosing it must be
    // refused, in the words that say why.
    const picker = await screen.findByRole('combobox', {
      name: 'Create or select an attribute',
    });
    await user.selectOptions(picker, 'worried');

    // Named by its CODEBOOK name, which only the package's protocol context
    // can supply — the pool the picker was handed carries labels, not the
    // codebook entry the message is about.
    await screen.findByText(
      /"Worried" is collected by a form elsewhere in this protocol/,
    );
  });

  it('lets a stamp keep a variable that nothing else validates', async () => {
    const user = userEvent.setup();
    const session = createSession({
      label: 'People',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'Who?' }],
      additionalAttributes: [],
    });
    renderAttributeList(session, []);

    await user.click(
      await screen.findByRole('button', {
        name: 'Add new attribute to assign',
      }),
    );
    await user.selectOptions(
      await screen.findByRole('combobox', {
        name: 'Create or select an attribute',
      }),
      'helpful',
    );

    // The second cell only appears once an attribute is chosen, which is also
    // the proof that the pick was accepted.
    await screen.findByText('Value to assign');
    expect(screen.queryByText(/is collected by a form elsewhere/)).toBeNull();
    await waitFor(() =>
      expect(
        session.getSnapshot().editedSection.fields.additionalAttributes,
      ).toEqual([{ variable: 'helpful' }]),
    );
  });

  it('stops a second row claiming an attribute the first already stamps', async () => {
    const user = userEvent.setup();
    const session = createSession({
      label: 'People',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'Who?' }],
      additionalAttributes: [],
    });
    renderAttributeList(session, []);

    const addButton = await screen.findByRole('button', {
      name: 'Add new attribute to assign',
    });
    await user.click(addButton);
    await user.selectOptions(
      await screen.findByRole('combobox', {
        name: 'Create or select an attribute',
      }),
      'helpful',
    );
    await screen.findByText('Value to assign');
    await user.click(addButton);

    const pickers = await screen.findAllByRole('combobox', {
      name: 'Create or select an attribute',
    });
    const secondRow = within(pickers[1]!);
    // One variable holds one value per node, so a second row stamping the same
    // attribute is not a second stamp — it silently overwrites the first.
    expect(secondRow.getByRole('option', { name: 'Helpful' })).toBeDisabled();
    // Everything else the pool offers is still open, so this is the used
    // attribute being withdrawn rather than the list being closed.
    expect(secondRow.getByRole('option', { name: 'Worried' })).toBeEnabled();
  });

  it('shows which row is incomplete when the save is refused', async () => {
    const user = userEvent.setup();
    const session = createSession({
      label: 'People',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'Who?' }],
      additionalAttributes: [],
    });
    renderAttributeList(session, []);

    await user.click(
      await screen.findByRole('button', {
        name: 'Add new attribute to assign',
      }),
    );
    // A row that has only just been added has nothing to answer for yet.
    expect(screen.queryByText('Required')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    // The array's refusal names no row — these rows are always open, so there
    // is no "finish editing" step to reveal the one that is incomplete, and
    // without the row's own error the researcher is told to fix something with
    // no way to see where it is.
    await screen.findByText(
      'Every additional attribute needs both an attribute and a value.',
    );
    await screen.findByText('Required');
  });
});

/**
 * The render-tolerance contract fresco-ui states on `useField`'s
 * `fieldProps.value`: a control renders whatever the store holds, and the
 * cascade that replaces a foreign-typed value can only run AFTER the render
 * commits. A throw is not cosmetic — the render never commits, so the effect
 * that would have corrected the value never runs and the value stays foreign
 * forever (#1433, where `CheckboxGroup` reached `true.includes(...)`).
 *
 * This list is a field component like any other, so the contract is its
 * contract too: `undefined` is not the only shape a stage document can hold at
 * `additionalAttributes` — an imported protocol, a collaborator's write, or a
 * mid-cascade reseed can put anything there.
 */
describe('a stage document holding something that is not a list', () => {
  const foreignValues = {
    'a bare string': 'worried',
    'a single record': { variable: 'worried', value: true },
    'a list with a hole in it': [null, { variable: 'helpful', value: true }],
  };

  for (const [shape, foreign] of Object.entries(foreignValues)) {
    it(`renders rather than crashing on ${shape}`, async () => {
      const session = createSession({
        label: 'People',
        subject: { entity: 'node', type: 'person' },
        prompts: [{ id: 'p1', text: 'Who?' }],
        additionalAttributes: foreign,
      } as SectionDoc);

      renderAttributeList(session, []);

      // The editor is on screen, so the render committed and whatever comes
      // next — a cascade, a reseed, the researcher's own edit — can still run.
      expect(
        await screen.findByRole('button', {
          name: 'Add new attribute to assign',
        }),
      ).toBeInTheDocument();
    });

    it(`survives ${shape} ARRIVING while the editor is open`, async () => {
      const session = createSession({
        label: 'People',
        subject: { entity: 'node', type: 'person' },
        prompts: [{ id: 'p1', text: 'Who?' }],
        additionalAttributes: [],
      });
      renderAttributeList(session, []);
      await screen.findByRole('button', {
        name: 'Add new attribute to assign',
      });

      // The other half of the contract, and the harder half: an arrival is
      // written into the controls that are already on screen, and the re-seed
      // that does it reads the value out of the draft by path. Refusing a
      // shape there throws out of an effect the researcher did not cause, and
      // takes the whole stage editor down with it.
      act(() => {
        session.dispatch([
          { op: 'set', key: 'additionalAttributes', value: foreign },
        ]);
      });

      expect(
        await screen.findByRole('button', {
          name: 'Add new attribute to assign',
        }),
      ).toBeInTheDocument();
    });

    it(`adds a row over ${shape} rather than throwing out of the Add button`, async () => {
      const user = userEvent.setup();
      const session = createSession({
        label: 'People',
        subject: { entity: 'node', type: 'person' },
        prompts: [{ id: 'p1', text: 'Who?' }],
        additionalAttributes: foreign,
      } as SectionDoc);
      renderAttributeList(session, []);

      const add = await screen.findByRole('button', {
        name: 'Add new attribute to assign',
      });
      const heldBefore = session.getSnapshot().editedSection.fields
        .additionalAttributes as unknown;
      const rowsBefore = Array.isArray(heldBefore) ? heldBefore.length : 0;
      const pickersBefore = screen.queryAllByRole('combobox').length;
      await user.click(add);

      // Rendering a foreign value as an empty list is only half the contract:
      // the list shows an ENABLED Add, so the write behind it has to reach the
      // list the researcher was looking at. Addressed at the foreign value
      // instead, `insertItem` throws `ApplyError("Field additionalAttributes
      // is not a list")` from the click handler — and the shell's own catch
      // re-throws everything that is not a `SessionReadOnlyError`, so it
      // crashes the editor instead of declining the edit.
      await waitFor(() => {
        const held = session.getSnapshot().editedSection.fields
          .additionalAttributes as unknown;
        expect(Array.isArray(held)).toBe(true);
        // The list the value already WAS, plus the row, LAST. A value that is
        // not a list at all is replaced by the empty list the editor drew and
        // never salvaged for rows; a list holding a hole keeps every entry
        // where it stands, because the position an operation names is a
        // position among the rows DRAWN and the command carries a position in
        // the document. Reading one as the other lands the new row in front of
        // entries the researcher could not see.
        expect(held as unknown[]).toEqual([
          ...(Array.isArray(heldBefore) ? (heldBefore as unknown[]) : []),
          {},
        ]);
        expect(held as unknown[]).toHaveLength(rowsBefore + 1);
      });
      // And the editor is still alive, with a row on screen for the
      // researcher to fill in. How many rows a foreign value rendered as
      // before the click is `ArrayField`'s own tolerance to decide, so what is
      // pinned here is that the list gained one, not what it started from.
      expect(screen.queryAllByRole('combobox').length).toBeGreaterThan(
        pickersBefore,
      );
    });
  }
});

/**
 * Creating a codebook variable is a round trip through the host, and the list
 * carries on moving while it runs. These rows carry no id of their own, so
 * `ArrayField` identifies them by an internal id it REUSES BY POSITION
 * whenever the value is replaced — an insertion above hands a row's update
 * handle to whichever row has taken its place. The deletion path already
 * answers this by re-checking the row it was opened on
 * (`useConfirmRowRemoval`); the creation path is the same window.
 */
describe('a variable created while the list is moving', () => {
  const openList = (
    attributes: readonly AttributeValue[],
    onCreateVariable: (variableName: string) => Promise<string | undefined>,
  ) => {
    const session = createSession({
      label: 'People',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'Who?' }],
      additionalAttributes: attributes,
    });
    renderAttributeList(session, attributes, {
      picker: CreatingVariablePicker as ComponentType<Record<string, unknown>>,
      onCreateVariable,
    });
    return session;
  };

  const attributesOf = (session: ProtocolBuilderSessionStore) =>
    session.getSnapshot().editedSection.fields.additionalAttributes;

  it('assigns the new attribute to the row it was created from', async () => {
    const user = userEvent.setup();
    const session = openList([{ variable: 'helpful', value: true }], () =>
      Promise.resolve('worried'),
    );

    await user.click(
      await screen.findByRole('button', { name: 'Create an attribute' }),
    );

    await waitFor(() =>
      expect(attributesOf(session)).toEqual([
        { variable: 'worried', value: true },
      ]),
    );
  });

  it('refuses to stamp it onto a row that was replaced meanwhile', async () => {
    const user = userEvent.setup();
    let finishCreation: (id: string) => void = () => undefined;
    const created = new Promise<string | undefined>((resolve) => {
      finishCreation = resolve;
    });
    const session = openList(
      [{ variable: 'helpful', value: true }],
      () => created,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Create an attribute' }),
    );

    // A row arrives above the one the creation was started from. Its update
    // handle now names the newcomer, and stamping the new attribute through it
    // would overwrite an assignment the researcher never looked at.
    const arrived: AttributeValue[] = [
      { variable: 'worried', value: false },
      { variable: 'helpful', value: true },
    ];
    act(() => {
      session.dispatch([
        { op: 'set', key: 'additionalAttributes', value: arrived },
      ]);
    });
    await waitFor(() => expect(attributesOf(session)).toEqual(arrived));

    await act(async () => {
      finishCreation('reassuring');
      await created;
    });

    // The attribute itself was created — that is the host's write, and it
    // succeeded — so the researcher is told where it went, not that something
    // failed. Nothing in the list was touched.
    expect(
      await screen.findByText(/was replaced while it was being created/),
    ).toBeInTheDocument();
    expect(attributesOf(session)).toEqual(arrived);
  });
});

describe('committedAttributeVariableIds', () => {
  it('holds only the picks a row has actually made', () => {
    // This set is the cross-class gate's escape hatch, and `has` is the only
    // question ever asked of it. An unfinished row has picked nothing, so it
    // contributes nothing: letting `undefined` or `''` in would make the set
    // answer for a row that has not chosen an attribute at all.
    expect([
      ...committedAttributeVariableIds([
        { value: true },
        { variable: '', value: false },
        { variable: 'helpful', value: true },
      ]),
    ]).toEqual(['helpful']);
  });
});
