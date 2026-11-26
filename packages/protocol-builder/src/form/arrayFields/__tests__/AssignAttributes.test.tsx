import { act, screen, waitFor, within } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { type ComponentType, useLayoutEffect, useMemo, useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import { isProtocolObjectId } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import VariablePickerField, {
  type CreateOptionOutcome,
} from '../../../fields/VariablePickerField.tsx';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import { useProtocolContext } from '../../../state/protocolContext.ts';
import {
  chooseAttributeById,
  offeredAttributes,
  unavailableAttributes,
  unavailableReason,
} from '../../../testing/attributePicker.ts';
import {
  fixtureTypeId,
  fixtureVariableId,
} from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { testVariableId } from '../../../testing/testId.ts';
import { createStageDraftProbe } from '../../__tests__/stageDraftProbe.tsx';
import AssignAttributes, {
  committedAttributeVariableIds,
  makeAssignAttributesValidation,
  type AttributeValue,
  type CreateAttributeOutcome,
  type CreateAttributeVariable,
} from '../AssignAttributes.tsx';

const INVENTED = testVariableId('invented');
const HELPFUL = testVariableId('helpful');
const PERSON = fixtureTypeId('node', 'person');
const FLAGGED = fixtureVariableId(
  { entity: 'node', typeName: 'person' },
  'flagged',
);
const HIGHLIGHTED = fixtureVariableId(
  { entity: 'node', typeName: 'person' },
  'highlighted',
);

type HarnessUser = ReturnType<typeof userEvent.setup>;

const NO_DRAFT_VARIABLES: ReadonlySet<string> = new Set();

/** A row just added: nothing chosen yet, and an id of its own. */
const NEW_ROW = { id: expect.any(String) };

const SUBJECT = { entity: 'node', type: PERSON } as const;

/**
 * A stand-in for the host's variable picker. Everything this list needs from a
 * picker is a control that reports a variable id; how a host lists, groups and
 * creates them is the host's business, which is why the real one is injected.
 */
const VariablePicker = NativeSelectField as ComponentType<
  Record<string, unknown>
>;

/**
 * The stage under test: a second name generator over the shared protocol's
 * `person` type.
 *
 * The protocol already collects `flagged` in an alter form, so assigning it
 * from an unvalidated stamp would bypass that form's validation — which is the
 * contradiction the cross-class gate names. `highlighted` is collected by
 * nothing, so it is the attribute a stamp may take. Only booleans are
 * offered at all, which is what a stamp writes.
 */
const STAGE_FIELDS: SectionDoc = {
  label: 'People',
  subject: { entity: 'node', types: [PERSON] },
  prompts: [{ id: 'p1', text: 'Who?' }],
  additionalAttributes: [],
};

const VARIABLE_OPTIONS = [
  { label: 'Flagged', value: FLAGGED, type: 'boolean' as const },
  { label: 'Highlighted', value: HIGHLIGHTED, type: 'boolean' as const },
];

/** The picker every host actually injects. */
const RealVariablePicker = VariablePickerField as ComponentType<
  Record<string, unknown>
>;

/** One row's attribute field, by the row's position in the list. */
const rowAttributeField = (index: number): HTMLElement => {
  const field = document.querySelector<HTMLElement>(
    `[data-field-name="additionalAttributes[${index}].variable"]`,
  );
  if (field === null) {
    throw new Error(`row ${index} has no attribute field`);
  }
  return field;
};

/**
 * What the row answered the picker with, newest last.
 *
 * The answer IS the contract — a picker keeps the name it submitted on a
 * refusal and empties the box on every answer that means the attribute exists
 * — so a create whose outcome nothing reads is a create only half tested.
 * Emptied per test by the suite that presses the button.
 */
const answered: CreateOptionOutcome[] = [];

/**
 * A picker that can CREATE. The real one is a host surface — it knows how that
 * host lists, groups and creates variables — so all this stands in for is the
 * one affordance that asks for a new attribute by name, and the one thing
 * every picker does with the answer: read it.
 */
function CreatingVariablePicker({
  onCreateOption,
}: {
  onCreateOption?: (variableName: string) => Promise<CreateOptionOutcome>;
}) {
  return (
    <button
      type="button"
      onClick={() =>
        void onCreateOption?.('Brand new').then((outcome) =>
          answered.push(outcome),
        )
      }
    >
      Create an attribute
    </button>
  );
}

function renderAttributeList(
  attributes: unknown,
  // Whatever the stage document holds at the array's key — the same value the
  // list itself is handed, and no more vetted here than it is there.
  committed: unknown,
  extra?: Readonly<{
    picker?: ComponentType<Record<string, unknown>>;
    onCreateVariable?: CreateAttributeVariable;
  }>,
) {
  const controls: { setDisabled: (value: boolean) => void } = {
    setDisabled: () => undefined,
  };
  const { probe, draft } = createStageDraftProbe();

  function List() {
    const [disabled, setDisabled] = useState(false);
    useLayoutEffect(() => {
      controls.setDisabled = setDisabled;
    }, [setDisabled]);
    const protocolContext = useProtocolContext();
    const committedVariableIds = useMemo(
      () => committedAttributeVariableIds(committed),
      [],
    );
    const validation = useMemo(
      () =>
        makeAssignAttributesValidation({
          allVariables:
            protocolContext.codebook.node?.[PERSON]?.variables ?? {},
          committedVariableIds,
          draftValidatedVariables: NO_DRAFT_VARIABLES,
          hasValidatedUseElsewhere: () => false,
        }),
      [committedVariableIds, protocolContext],
    );

    return (
      <BuilderSection sectionKey="form-fields" title="Additional attributes">
        {probe}
        <Field
          name="additionalAttributes"
          label="Additional attributes"
          component={AssignAttributes}
          subject={SUBJECT}
          variableOptions={VARIABLE_OPTIONS}
          variablePickerComponent={extra?.picker ?? VariablePicker}
          draftValidatedVariables={NO_DRAFT_VARIABLES}
          committedVariableIds={committedAttributeVariableIds(committed)}
          disabled={disabled}
          {...(extra?.onCreateVariable === undefined
            ? {}
            : { onCreateVariable: extra.onCreateVariable })}
          {...validation}
        />
      </BuilderSection>
    );
  }

  const harness = renderStageEditor({
    stage: {
      type: 'NameGenerator',
      fields: { ...STAGE_FIELDS, additionalAttributes: attributes },
    },
    sections: <List />,
  });

  return {
    harness,
    user: harness.user,
    attributes: (): unknown => draft().additionalAttributes,
    stopAcceptingChanges: () => {
      act(() => {
        controls.setDisabled(true);
      });
    },
  };
}

describe('AssignAttributes', () => {
  const addRow = async (user: HarnessUser) => {
    await user.click(
      await screen.findByRole('button', {
        name: 'Add new attribute to assign',
      }),
    );
    const pickers = await screen.findAllByRole('combobox', {
      name: 'Create or select an attribute',
    });
    return pickers.at(-1)!;
  };

  it('reads the codebook role a variable already plays from the protocol', async () => {
    const { user } = renderAttributeList([], []);

    await user.selectOptions(await addRow(user), FLAGGED);

    // `name` is collected by another stage's form, which the package's own
    // protocol context is the only source for here. Choosing it must be
    // refused, in the words that say why — and named by its CODEBOOK name,
    // which the pool the picker was handed does not carry.
    expect(
      await screen.findByText(
        /"flagged" is collected by a form elsewhere in this protocol/,
      ),
    ).toBeInTheDocument();
  });

  it('lets a stamp keep a variable that nothing else validates', async () => {
    const { user, attributes } = renderAttributeList([], []);

    await user.selectOptions(await addRow(user), HIGHLIGHTED);

    // The second cell only appears once an attribute is chosen, which is also
    // the proof that the pick was accepted.
    await screen.findByText('Value to assign');
    expect(screen.queryByText(/is collected by a form elsewhere/)).toBeNull();
    await waitFor(() =>
      expect(attributes()).toEqual([
        { id: expect.any(String), variable: HIGHLIGHTED },
      ]),
    );
  });

  it('keeps each row’s id through an add, an edit and a delete', async () => {
    const STORED = '3f2a7c10-5e4b-4d8a-9b6c-1a2b3c4d5e6f';
    const { user, attributes } = renderAttributeList(
      [{ id: STORED, variable: HIGHLIGHTED, value: true }],
      [{ id: STORED, variable: HIGHLIGHTED, value: true }],
    );
    const idsNow = (): unknown[] => {
      const rows = attributes();
      return Array.isArray(rows)
        ? rows.map((row: unknown) =>
            typeof row === 'object' && row !== null
              ? Reflect.get(row, 'id')
              : undefined,
          )
        : [];
    };

    await addRow(user);
    await waitFor(() => expect(idsNow()).toHaveLength(2));
    const [first, added] = idsNow();
    expect(first).toBe(STORED);
    expect(isProtocolObjectId(added)).toBe(true);
    expect(added).not.toBe(STORED);

    const pickers = await screen.findAllByRole('combobox', {
      name: 'Create or select an attribute',
    });
    await user.selectOptions(pickers[0]!, FLAGGED);
    await waitFor(() =>
      expect(attributes()).toEqual([
        expect.objectContaining({ id: STORED, variable: FLAGGED }),
        expect.objectContaining({ id: added }),
      ]),
    );

    const [deleteFirst] = screen.getAllByRole('button', {
      name: 'Delete attribute',
    });
    await user.click(deleteFirst!);
    await waitFor(() => expect(idsNow()).toEqual([added]));
  });

  it('stops a second row claiming an attribute the first already stamps', async () => {
    // Through the picker every host injects: an attribute another row stamps
    // has to reach it as one that cannot be chosen, with the reason.
    const { user, attributes } = renderAttributeList([], [], {
      picker: RealVariablePicker,
    });
    const add = () =>
      user.click(
        screen.getByRole('button', { name: 'Add new attribute to assign' }),
      );

    await add();
    await chooseAttributeById(user, rowAttributeField(0), HIGHLIGHTED);
    await screen.findByText('Value to assign');
    await add();
    await waitFor(() => rowAttributeField(1));
    const secondRow = rowAttributeField(1);

    // One variable holds one value per node, so a second row stamping the same
    // attribute is not a second stamp — it silently overwrites the first.
    expect(await unavailableAttributes(user, secondRow)).toEqual([HIGHLIGHTED]);
    // Everything else the pool offers is still open, so this is the used
    // attribute being withdrawn rather than the list being closed.
    expect(await offeredAttributes(user, secondRow)).toEqual([FLAGGED]);
    // Choosing it explains rather than chooses.
    expect(await unavailableReason(user, secondRow, HIGHLIGHTED)).toBe(
      'Another row in this list already assigns a value to this attribute.',
    );
    await waitFor(() =>
      expect(attributes()).toEqual([
        { id: expect.any(String), variable: HIGHLIGHTED },
        NEW_ROW,
      ]),
    );
    // The row that stamps it keeps it.
    expect(await offeredAttributes(user, rowAttributeField(0))).toContain(
      HIGHLIGHTED,
    );
  });

  it('shows which row is incomplete when the save is refused', async () => {
    const { harness, user } = renderAttributeList([], []);

    await addRow(user);
    // A row that has only just been added has nothing to answer for yet.
    // Asked of this section rather than of the page: the stage's NAME is a
    // required field too, drawn by the host wherever its own chrome puts it.
    const section = screen.getByRole('region', {
      name: 'Additional attributes',
    });
    expect(within(section).queryByText('Required')).toBeNull();

    expect(await harness.submit()).toBeNull();

    // The array's refusal names no row — these rows are always open, so there
    // is no "finish editing" step to reveal the one that is incomplete, and
    // without the row's own error the researcher is told to fix something with
    // no way to see where it is.
    await screen.findByText(
      'Every additional attribute needs both an attribute and a value.',
    );
    await within(section).findByText('Required');
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
 * `additionalAttributes` — an imported protocol or a migration can put
 * anything there.
 */
describe('a stage document holding something that is not a list', () => {
  /**
   * Each shape, and the list the editor holds after one row is added over it.
   *
   * Every one of them is the list the researcher was LOOKING at plus the row
   * they added, which for a value the list could not draw rows out of is a
   * list of one. A hole makes the value one `ArrayField` renders as no rows at
   * all, so nothing beside the hole is on screen to be kept either: writing
   * back a row the researcher never saw would be the editor authoring it for
   * them.
   */
  const foreignValues = {
    'a bare string': [HIGHLIGHTED, [NEW_ROW]],
    'a single record': [{ variable: HIGHLIGHTED, value: true }, [NEW_ROW]],
    'a list with a hole in it': [
      [null, { variable: HIGHLIGHTED, value: true }],
      [NEW_ROW],
    ],
  } as const satisfies Record<string, readonly [unknown, unknown[]]>;

  for (const [shape, [foreign, added]] of Object.entries(foreignValues)) {
    it(`renders rather than crashing on ${shape}`, async () => {
      // The host builds the cross-class gate's escape set from this same
      // value, in its own render path and with no more vetting than the list
      // gets — so a shape that throws while it is read takes the editor down
      // before the render-tolerant list below ever draws.
      renderAttributeList(foreign, foreign);

      // The editor is on screen, so the render committed and whatever comes
      // next — a cascade, the researcher's own edit — can still run.
      expect(
        await screen.findByRole('button', {
          name: 'Add new attribute to assign',
        }),
      ).toBeInTheDocument();
    });

    it(`adds a row over ${shape} rather than throwing out of the Add button`, async () => {
      const { user, attributes } = renderAttributeList(foreign, foreign);

      const add = await screen.findByRole('button', {
        name: 'Add new attribute to assign',
      });
      const pickersBefore = screen.queryAllByRole('combobox').length;
      await user.click(add);

      // Rendering a foreign value as an empty list is only half the contract:
      // the list shows an ENABLED Add, so the write behind it has to reach the
      // list the researcher was looking at — which is the rows on screen plus
      // the new one, and never an entry the foreign value was carrying where
      // they could not see it.
      await waitFor(() => expect(attributes()).toEqual(added));
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
 * carries on moving while it runs. A row's update handle follows its id, so it
 * holds however the list moves around it, and the creation still has to notice
 * when the row's own content is what changed, or when the row has gone.
 */
describe('a variable created while the list is moving', () => {
  const openList = (
    attributes: readonly AttributeValue[],
    onCreateVariable: CreateAttributeVariable,
  ) =>
    renderAttributeList(attributes, attributes, {
      picker: CreatingVariablePicker as ComponentType<Record<string, unknown>>,
      onCreateVariable,
    });

  /**
   * Dismisses the notice, which is what the row is waiting on before it
   * answers the picker: the researcher has to have READ where the attribute
   * went before the box it was named in empties under them.
   */
  const acknowledge = async (user: HarnessUser) => {
    await user.click(screen.getByRole('button', { name: 'Continue' }));
  };

  const startCreating = async (user: HarnessUser) => {
    await user.click(
      await screen.findByRole('button', { name: 'Create an attribute' }),
    );
  };

  beforeEach(() => {
    answered.length = 0;
  });

  it('assigns the new attribute to the row it was created from', async () => {
    const { user, attributes } = openList(
      [{ variable: HIGHLIGHTED, value: true }],
      () => Promise.resolve({ status: 'created', variableId: INVENTED }),
    );

    await startCreating(user);

    await waitFor(() =>
      expect(attributes()).toEqual([{ variable: INVENTED, value: true }]),
    );
    // Which is what the picker is told, so it empties the name box.
    await waitFor(() => expect(answered).toEqual([{ status: 'created' }]));
  });

  /**
   * The other thing the round trip can outlive: not which row this control
   * names, but whether the list will take a write to it at all. `ArrayField`
   * withdraws a row's update handler while its list is not accepting changes,
   * and says nothing else about it — so the assignment simply does not happen,
   * and the attribute the host created is left in the codebook unmentioned.
   */
  it('says where the attribute went when the list stops accepting changes', async () => {
    let finishCreation: (id: string) => void = () => undefined;
    const created = new Promise<CreateAttributeOutcome>((resolve) => {
      finishCreation = (variableId: string) =>
        resolve({ status: 'created', variableId });
    });
    const held = [{ variable: HIGHLIGHTED, value: true }];
    const { user, attributes, stopAcceptingChanges } = openList(
      held,
      () => created,
    );

    await startCreating(user);

    // The list stops accepting changes while the creation is still running.
    // The row is untouched — only what may be written to it has changed.
    stopAcceptingChanges();

    await act(async () => {
      finishCreation(INVENTED);
      await created;
    });

    expect(
      await screen.findByText(
        /this list stopped accepting changes while it was being created/,
      ),
    ).toBeInTheDocument();
    expect(attributes()).toEqual(held);
    await acknowledge(user);
    await waitFor(() => expect(answered).toEqual([{ status: 'unassigned' }]));
  });

  /**
   * The third thing the round trip can outlive, and the one neither guard
   * above can see: the row leaving the list altogether. Both of them re-read
   * values this control is handed on every render — and a row that has gone
   * stops being rendered, so the last values it saw stand for good. The row
   * reads as unchanged, the handler as live, and the assignment lands on
   * nothing. Only the write itself can answer for that.
   */
  it('says where the attribute went when the row it was created from has gone', async () => {
    let finishCreation: (id: string) => void = () => undefined;
    const created = new Promise<CreateAttributeOutcome>((resolve) => {
      finishCreation = (variableId: string) =>
        resolve({ status: 'created', variableId });
    });
    const { user, attributes } = openList(
      [{ variable: HIGHLIGHTED, value: true }],
      () => created,
    );

    await startCreating(user);

    // The researcher deletes the row while the host is still creating the
    // variable. These rows delete without a confirmation, so the click is the
    // whole of it.
    await user.click(screen.getByRole('button', { name: 'Delete attribute' }));
    await waitFor(() => expect(attributes()).toEqual([]));

    await act(async () => {
      finishCreation(INVENTED);
      await created;
    });

    expect(
      await screen.findByText(/no longer in this list/),
    ).toBeInTheDocument();
    expect(attributes()).toEqual([]);
    await acknowledge(user);
    await waitFor(() => expect(answered).toEqual([{ status: 'unassigned' }]));
  });

  /**
   * The only answer that is a refusal, and the only one that leaves the name
   * in the box: the host wrote nothing, so there is no attribute anywhere and
   * nothing to say about where it went.
   */
  it('answers a create the host refused with a refusal', async () => {
    const held = [{ variable: HIGHLIGHTED, value: true }];
    const { user, attributes } = openList(held, () =>
      Promise.resolve({ status: 'refused' }),
    );

    await startCreating(user);

    await waitFor(() => expect(answered).toEqual([{ status: 'refused' }]));
    expect(attributes()).toEqual(held);
    expect(screen.queryByText(/was created but not assigned/)).toBeNull();
  });
});

describe('committedAttributeVariableIds', () => {
  it('reads past an entry that is not a row at all', () => {
    // The hole an import, a migration or a mid-cascade reseed leaves in a
    // list — the shape every other reader in this package is written to
    // tolerate. A host builds this set inside its own `useMemo`, during
    // render, so destructuring one takes the editor down before the list that
    // could repair it is drawn.
    expect([
      ...committedAttributeVariableIds([
        null,
        'worried',
        { variable: HELPFUL, value: true },
      ]),
    ]).toEqual([HELPFUL]);
  });

  it('answers with nothing for a value that is not a list', () => {
    // Not a list, so it holds no committed pick to escape the cross-class
    // gate with. Erring towards the gate FIRING is the safe direction: the
    // escape only ever excuses a contradiction the protocol already saved.
    expect([
      ...committedAttributeVariableIds({ variable: HELPFUL, value: true }),
    ]).toEqual([]);
  });

  it('holds only the picks a row has actually made', () => {
    // This set is the cross-class gate's escape hatch, and `has` is the only
    // question ever asked of it. An unfinished row has picked nothing, so it
    // contributes nothing: letting `undefined` or `''` in would make the set
    // answer for a row that has not chosen an attribute at all.
    expect([
      ...committedAttributeVariableIds([
        { value: true },
        { variable: '', value: false },
        { variable: HELPFUL, value: true },
      ]),
    ]).toEqual([HELPFUL]);
  });
});
