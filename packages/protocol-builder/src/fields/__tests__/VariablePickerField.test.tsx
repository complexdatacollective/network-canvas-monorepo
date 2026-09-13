import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { describe, expect, it } from 'vitest';

import { ecosystemLocales } from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Field from '@codaco/fresco-ui/form/Field/Field';
import Section from '@codaco/fresco-ui/Section';
import type { VariableType } from '@codaco/protocol-validation';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { useCreateCodebookVariable } from '../../codebook/useCodebookVariableEdits.ts';
import AssignAttributes, {
  type CreateAttributeOutcome,
} from '../../form/arrayFields/AssignAttributes.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { protocolBuilderCatalogs } from '../../locales/catalogs.ts';
import {
  type CodebookSubject,
  variablesForSubject,
} from '../../protocol-context.ts';
import { useProtocolContext } from '../../state/protocolContext.ts';
import {
  attributeField,
  chooseAttribute,
  openAttributePicker,
} from '../../testing/attributePicker.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import {
  default as VariablePickerField,
  type CreateOptionOutcome,
} from '../VariablePickerField.tsx';

const SUBJECT: CodebookSubject = { entity: 'node', type: 'person' };

const NO_VARIABLES: ReadonlySet<string> = new Set();

/** The label the row gives the control that picks its attribute. */
const ROW_PICKER = 'Create or select an attribute';

// Rows know nothing about what any control takes, so the picker reaches them
// as an open-record renderer — adapted once, exactly as a section does it.
const VariablePicker = VariablePickerField as ComponentType<
  Record<string, unknown>
>;

/**
 * What the HOST decides about an attribute created from a row: which codebook
 * section it lands in, and what it is created as.
 *
 * The researcher is only ever asked for a name — see
 * `VariablePickerFieldProps.onCreateOption` — so these two are the host's
 * to give, and they are the whole of what one host differs from another by.
 * `undefined` for the subject is a real answer: a stage that has not been told
 * which node type it is about yet has no codebook section to add anything to.
 */
type CreateAs = Readonly<{
  into: CodebookSubject | undefined;
  draft: Readonly<{ type: VariableType; component?: string }>;
}>;

/** What a section that offers stamps asks for: a flag, shown as a switch. */
const STAMPED: CreateAs = {
  into: SUBJECT,
  draft: { type: 'boolean', component: 'Toggle' },
};

/**
 * The host half of the seam, as a section that offers stamps supplies it.
 *
 * The picker is injected as `variablePickerComponent` and reaches the rows'
 * `onCreateOption` through `AssignAttributes`' `onCreateVariable`; the codebook
 * write commits immediately through the contract, under the codebook section's
 * own lock, served by the harness's in-memory host. Nothing here is a stand-in
 * — what this supplies is what a host supplies: which type a created attribute
 * is, and where a refusal is shown.
 *
 * The two host answers arrive as one `createAs` prop rather than being written
 * into the body, because what the codebook refuses is a fact about them: it
 * refuses an attribute added to a type that is not there, one added to no type
 * at all, and one whose kind cannot be made from a name. Each is an answer a
 * host can give, and the Spanish suite at the bottom of this file is where they
 * are given. One object rather than two props, so `into: undefined` can mean
 * "this stage is about nothing yet" instead of falling back to a default.
 */
function StampedAttributes({
  createAs = STAMPED,
}: Readonly<{ createAs?: CreateAs }>) {
  const { into, draft } = createAs;
  const protocolContext = useProtocolContext();
  const createVariable = useCreateCodebookVariable(into);
  const [problem, setProblem] = useState<string | undefined>(undefined);

  const variableOptions = useMemo(
    () =>
      Object.entries(variablesForSubject(protocolContext, SUBJECT)).map(
        ([id, variable]) => ({
          value: id,
          label: variable.name,
          type: variable.type,
        }),
      ),
    [protocolContext],
  );

  // Answered as a variable id or as the reason there is none: the row commits
  // its own cell only when the codebook write landed, and the reason travels
  // back to the window the researcher typed the name into.
  const onCreateVariable = useCallback(
    async (variableName: string): Promise<CreateAttributeOutcome> => {
      const outcome = await createVariable({ name: variableName, ...draft });
      if (outcome.status === 'refused') {
        setProblem(outcome.message);
        return { status: 'refused', message: outcome.message };
      }
      setProblem(undefined);
      return { status: 'created', variableId: outcome.variableId };
    },
    [createVariable, draft],
  );

  return (
    <Section title="Additional attributes">
      <Field
        name="additionalAttributes"
        label="Additional attributes"
        component={AssignAttributes}
        subject={SUBJECT}
        variableOptions={variableOptions}
        variablePickerComponent={VariablePicker}
        onCreateVariable={onCreateVariable}
        draftValidatedVariables={NO_VARIABLES}
        committedVariableIds={NO_VARIABLES}
      />
      {problem !== undefined && (
        <Alert variant="destructive">
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      )}
    </Section>
  );
}

/** The same list, with nothing offering to create anything. */
function SelectableAttributes() {
  const protocolContext = useProtocolContext();
  const variableOptions = useMemo(
    () =>
      Object.entries(variablesForSubject(protocolContext, SUBJECT)).map(
        ([id, variable]) => ({
          value: id,
          label: variable.name,
          type: variable.type,
        }),
      ),
    [protocolContext],
  );

  return (
    <Section title="Additional attributes">
      <Field
        name="additionalAttributes"
        label="Additional attributes"
        component={AssignAttributes}
        subject={SUBJECT}
        variableOptions={variableOptions}
        variablePickerComponent={VariablePicker}
        draftValidatedVariables={NO_VARIABLES}
        committedVariableIds={NO_VARIABLES}
      />
    </Section>
  );
}

/** The label a picker mounted on its own gives its own control. */
const DIRECT_PICKER = 'Attribute this question records';

/**
 * One picker over three attributes, handed over in an order no researcher
 * would scan in.
 *
 * Mounted directly rather than through a row, because what is being read is
 * the window's own ordering: a row's pool is already sorted by the section
 * that narrowed it, so a list that came back in order would prove nothing.
 */
function UnsortedPicker() {
  return (
    <Section title="What this question records">
      <Field<typeof VariablePickerField>
        name="nodeConfig.egoVariable"
        component={VariablePickerField}
        label={DIRECT_PICKER}
        options={[
          { value: 'name', label: 'name', type: 'text' },
          { value: 'flagged', label: 'flagged', type: 'boolean' },
          { value: 'age', label: 'age', type: 'number' },
        ]}
      />
    </Section>
  );
}

/**
 * One picker over an attribute the protocol filed under an id that reads
 * exactly like a row this window makes up for itself.
 *
 * An id is minted rather than typed, so no researcher authored this one — but
 * ids travel between protocols and hosts, and the schema puts nothing in the
 * way of a colon. Mounted directly, because what is being read is the window's
 * own key space rather than anything a row does with it.
 */
function CollidingIds() {
  return (
    <Section title="What this question records">
      <Field<typeof VariablePickerField>
        name="nodeConfig.egoVariable"
        component={VariablePickerField}
        label={DIRECT_PICKER}
        options={[{ value: 'create:nick', label: 'nickname', type: 'text' }]}
        onCreateOption={async (): Promise<CreateOptionOutcome> =>
          Promise.resolve({ status: 'refused' })
        }
      />
    </Section>
  );
}

const renderRows = (sections: ReactNode) =>
  renderStageEditor({ stageId: 'name-generator-1', sections });

const addRow = async (harness: ReturnType<typeof renderRows>) => {
  await harness.user.click(
    await screen.findByRole('button', { name: 'Add new attribute to assign' }),
  );
};

/** The one row's picker, as a scope for everything it renders. */
const picker = () => attributeField(ROW_PICKER);

/** The control that opens the window, which says which of the two it is. */
const trigger = (name: 'Select attribute' | 'Change attribute') =>
  within(picker()).getByRole('button', { name });

/**
 * Types a name into the open window's search box.
 *
 * `paste` rather than `type`: what is asserted below is the list the term
 * produces, not the keystrokes, and a search box that filters with no debounce
 * answers a paste exactly as it answers the last keystroke of the same word.
 */
const search = async (
  harness: ReturnType<typeof renderRows>,
  dialog: HTMLElement,
  term: string,
) => {
  const box = within(dialog).getByRole('searchbox', {
    name: 'Find or create an attribute',
  });
  await harness.user.clear(box);
  await harness.user.type(box, term);
  return box;
};

const createRow = (dialog: HTMLElement, name: string) =>
  within(dialog).getByRole('option', {
    name: `Create new attribute called “${name}”.`,
  });

const PERSON_SECTION = sectionId({ kind: 'codebookNode', typeId: 'person' });

/**
 * The person type's attributes as the PROTOCOL holds them, which is the only
 * way to prove a create landed there or that nothing did.
 *
 * A person with no attributes at all is thrown on rather than answered as an
 * empty record: every claim below is that one name is or is not among them, and
 * an empty record satisfies "is not" without anything having been read.
 */
const personVariables = (harness: ReturnType<typeof renderStageEditor>) => {
  const variables = harness.hostCodebook().node?.person?.variables;
  if (variables === undefined) {
    throw new Error('the person type is gone, so it has no attributes to read');
  }
  return variables;
};

/** The attribute the row now names, as the picker states it. */
const heldVariableName = () =>
  picker().querySelector('[data-attribute-type]')?.textContent ?? undefined;

describe('the attribute picker', () => {
  /**
   * A trigger and a window, never a select. The codebooks this searches run to
   * dozens of attributes of one kind, and a list rendered in place buried
   * whatever the researcher was reading underneath it.
   */
  it('is a button that opens a window, not a list in place', async () => {
    const harness = renderRows(<SelectableAttributes />);
    await addRow(harness);

    expect(trigger('Select attribute')).toBeInTheDocument();
    expect(within(picker()).queryByRole('combobox')).toBeNull();
    expect(within(picker()).getByText('No attribute selected')).toBeVisible();
  });

  /**
   * Architect's window has no accessible name at all, so a screen reader
   * announces "dialog" and nothing else. It is named after the field it
   * answers, which is the only thing that distinguishes one picker's window
   * from another's.
   */
  it('opens a named window with the search box already focused', async () => {
    const harness = renderRows(<SelectableAttributes />);
    await addRow(harness);

    const dialog = await openAttributePicker(harness.user, picker());

    expect(dialog).toHaveAccessibleName(ROW_PICKER);
    expect(
      within(dialog).getByRole('searchbox', {
        name: 'Find or create an attribute',
      }),
    ).toHaveFocus();
  });

  /**
   * Alphabetical rather than in whatever order the codebook holds them: a
   * researcher looking for an attribute they authored months ago scans a list
   * by name.
   */
  it('lists every attribute by name, with the kind of answer it holds', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: <UnsortedPicker />,
    });
    await harness.opened();
    const dialog = await openAttributePicker(
      harness.user,
      attributeField(DIRECT_PICKER),
    );

    // Alphabetical, not the order the caller handed them over in: a
    // researcher looking for an attribute they authored months ago scans by
    // name.
    const rows = within(dialog).getAllByRole('option');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveAccessibleName('age');
    expect(rows[1]).toHaveAccessibleName('flagged');
    expect(rows[2]).toHaveAccessibleName('name');

    const age = within(dialog).getByRole('option', { name: 'age' });
    expect(age).toHaveAttribute('data-attribute-type', 'number');
    // Announced as a description rather than as part of the name, so the row
    // is still found by the researcher's own word for it.
    expect(age).toHaveAccessibleDescription('Attribute type: number');
  });

  it('narrows the list to what was typed, and restores it when cleared', async () => {
    const harness = renderRows(<SelectableAttributes />);
    await addRow(harness);
    const dialog = await openAttributePicker(harness.user, picker());
    const all = within(dialog).getAllByRole('option').length;

    const box = await search(harness, dialog, 'AG');
    const narrowed = within(dialog).getAllByRole('option');
    expect(narrowed.length).toBeLessThan(all);
    for (const row of narrowed) {
      expect(row.textContent?.toLowerCase()).toContain('ag');
    }

    await harness.user.clear(box);
    expect(within(dialog).getAllByRole('option')).toHaveLength(all);
  });

  /**
   * The search is this window's, not the field's. A term left behind reopened
   * the list filtered to something the researcher typed a decision ago, and
   * with no visible reason for the attributes that were missing from it.
   */
  it('opens on an empty search box every time', async () => {
    const harness = renderRows(<SelectableAttributes />);
    await addRow(harness);

    const dialog = await openAttributePicker(harness.user, picker());
    await search(harness, dialog, 'flagged');
    await harness.user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const reopened = await openAttributePicker(harness.user, picker());
    expect(
      within(reopened).getByRole('searchbox', {
        name: 'Find or create an attribute',
      }),
    ).toHaveValue('');
  });

  /**
   * The search box hands the list over, and the list takes every arrow after
   * that. Without the handoff a researcher typing a name has to reach for the
   * mouse to take the one result it left.
   */
  it('hands the arrow keys to the list, and answers Enter with the focused row', async () => {
    const harness = renderRows(<StampedAttributes />);
    await addRow(harness);
    const dialog = await openAttributePicker(harness.user, picker());
    const listbox = within(dialog).getByRole('listbox', {
      name: 'Attribute results',
    });

    await harness.user.keyboard('{ArrowDown}');
    expect(listbox.contains(document.activeElement)).toBe(true);
    const first = listbox.getAttribute('aria-activedescendant');
    expect(first).not.toBeNull();

    await harness.user.keyboard('{ArrowDown}');
    const second = listbox.getAttribute('aria-activedescendant');
    expect(second).not.toEqual(first);

    const chosen = document.getElementById(second ?? '');
    const chosenName = chosen?.querySelector(
      '[data-attribute-type]',
    )?.textContent;
    await harness.user.keyboard('{Enter}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(heldVariableName()).toBe(chosenName);
  });

  /**
   * With one result left there is nothing to arrow through, and pressing Enter
   * on a name already typed in full is what anyone does next.
   */
  it('takes the only remaining result on Enter in the search box', async () => {
    const harness = renderRows(<SelectableAttributes />);
    await addRow(harness);
    const dialog = await openAttributePicker(harness.user, picker());

    await search(harness, dialog, 'flagged');
    expect(within(dialog).getAllByRole('option')).toHaveLength(1);
    await harness.user.keyboard('{Enter}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(heldVariableName()).toBe('flagged');
  });

  /**
   * Focus goes back to the trigger on a DISMISSAL, and deliberately not on an
   * answer: a picker that has been answered changes the field underneath it —
   * a new pill, and at stage level a whole section that mounts below — and
   * focus belongs with that new content. Parking it on the trigger also puts
   * it inside the field's wrapper, whose blur then fires on the researcher's
   * next click anywhere in the form and swallows it.
   */
  it('returns focus to the trigger when dismissed, and not when answered', async () => {
    const harness = renderRows(<SelectableAttributes />);
    await addRow(harness);

    await openAttributePicker(harness.user, picker());
    await harness.user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger('Select attribute')).toHaveFocus();

    await chooseAttribute(harness.user, picker(), 'flagged');
    expect(trigger('Change attribute')).not.toHaveFocus();
  });

  /**
   * A researcher who answered from the keyboard has no next click to swallow,
   * and everything to lose by being left on `<body>`: this window is opened
   * from inside another dialog, and a Tab from nowhere restarts a document
   * walk that steps straight out of it. So the trigger — which now names the
   * attribute they chose — takes focus back.
   */
  it('returns focus to the trigger when the pick was made from the keyboard', async () => {
    const harness = renderRows(<SelectableAttributes />);
    await addRow(harness);

    // Enter on the row the arrows walked to.
    await openAttributePicker(harness.user, picker());
    await harness.user.keyboard('{ArrowDown}');
    await harness.user.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger('Change attribute')).toHaveFocus();

    // Enter in the search box, on the one result left.
    const reopened = await openAttributePicker(harness.user, picker());
    await search(harness, reopened, 'flagged');
    await harness.user.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(heldVariableName()).toBe('flagged');
    expect(trigger('Change attribute')).toHaveFocus();
  });

  /** The trigger says which act pressing it is. */
  it('says it changes the attribute once one is held', async () => {
    const harness = renderRows(<SelectableAttributes />);
    await addRow(harness);

    await chooseAttribute(harness.user, picker(), 'flagged');

    expect(trigger('Change attribute')).toBeInTheDocument();
    expect(heldVariableName()).toBe('flagged');
  });
});

describe('inventing an attribute from the picker', () => {
  /**
   * The attribute a researcher wants is often the one they have only just
   * thought of, and a picker that could only choose would send them to the
   * codebook and back to finish a single thought. Asking for it from the
   * search box is what makes looking for it and finding it does not exist one
   * act.
   *
   * The codebook write goes through the harness's in-memory host under the
   * codebook section's own lock, so this also proves the attribute actually
   * lands in the protocol — not just that a callback was called.
   */
  it('creates the attribute the search box names, and selects it', async () => {
    const harness = renderRows(<StampedAttributes />);
    await addRow(harness);
    const dialog = await openAttributePicker(harness.user, picker());

    // First, over a term that ALSO matches an attribute that exists: the
    // researcher who typed a name nothing carries is asking for that name, and
    // a create row buried under the near-misses is one they have to hunt for.
    await search(harness, dialog, 'flagge');
    const withMatches = within(dialog).getAllByRole('option');
    expect(withMatches[0]).toBe(createRow(dialog, 'flagge'));
    expect(withMatches[1]).toHaveAccessibleName('flagged');

    await search(harness, dialog, 'nominated_early');
    expect(within(dialog).getAllByRole('option')[0]).toBe(
      createRow(dialog, 'nominated_early'),
    );
    await harness.user.click(createRow(dialog, 'nominated_early'));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(heldVariableName()).toBe('nominated_early');
    expect(trigger('Change attribute')).toBeInTheDocument();
    expect(
      Object.values(personVariables(harness)).map((variable) => variable.name),
    ).toContain('nominated_early');
  });

  /** Enter takes the create row, so a name typed in full needs no pointer. */
  it('creates on Enter in the search box', async () => {
    const harness = renderRows(<StampedAttributes />);
    await addRow(harness);
    const dialog = await openAttributePicker(harness.user, picker());

    await search(harness, dialog, 'nominated_early');
    await harness.user.keyboard('{Enter}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(heldVariableName()).toBe('nominated_early');
  });

  /**
   * A name the type already holds is refused by the codebook, so it is refused
   * here first: asking would spend a round trip to come back with a
   * duplicate-name complaint about the name still on screen.
   */
  it('switches off the create row for a name the type already has', async () => {
    const harness = renderRows(<StampedAttributes />);
    await addRow(harness);
    const dialog = await openAttributePicker(harness.user, picker());

    await search(harness, dialog, 'flagged');
    // An exact match is not a new name at all, so there is nothing to create.
    expect(
      within(dialog).queryByRole('option', {
        name: /^Create new attribute called/u,
      }),
    ).toBeNull();

    // Held by an attribute of a kind this picker never offers, and taken all
    // the same: the codebook refuses a duplicate whatever it records.
    await search(harness, dialog, 'age');
    expect(
      within(dialog).getByRole('option', {
        name: 'Cannot create attribute named “age”: this type already has an attribute called that',
      }),
    ).toHaveAttribute('aria-disabled', 'true');

    await search(harness, dialog, 'age_');
    // Not a duplicate, so the offer is back — the guard is about the name, not
    // about having typed anything at all.
    expect(createRow(dialog, 'age_')).not.toHaveAttribute('aria-disabled');
  });

  /**
   * The codebook asks whether a name is free through `normalizeForComparison`
   * — case-folded and Unicode-canonical — so this row has to ask it the same
   * way. Asked case-sensitively it offered `AGE` as a name nobody held, and
   * the codebook answered the press with a duplicate-name refusal about a name
   * the researcher had just been told was free.
   */
  it('reads a case variant as the name the type already has', async () => {
    const harness = renderRows(<StampedAttributes />);
    await addRow(harness);
    const dialog = await openAttributePicker(harness.user, picker());

    await search(harness, dialog, 'AGE');
    expect(
      within(dialog).getByRole('option', {
        name: 'Cannot create attribute named “AGE”: this type already has an attribute called that',
      }),
    ).toHaveAttribute('aria-disabled', 'true');

    // One this picker DOES offer: a name already in the list is not a new name
    // whichever case it was typed in, so the list says what it says for the
    // name typed exactly — the attribute, and nothing above it. Not even the
    // refused row: there is nothing to refuse, because nothing was offered.
    await search(harness, dialog, 'Flagged');
    const offered = within(dialog).getAllByRole('option');
    expect(offered).toHaveLength(1);
    expect(offered[0]).toHaveAccessibleName('flagged');
  });

  it('switches off the create row for a name the codebook cannot store', async () => {
    const harness = renderRows(<StampedAttributes />);
    await addRow(harness);
    const dialog = await openAttributePicker(harness.user, picker());

    await search(harness, dialog, 'nominated early');
    const refused = within(dialog).getByRole('option', {
      name: 'Cannot create attribute named “nominated early”: only letters, numbers and the symbols ._-: can be used in a name',
    });
    expect(refused).toHaveAttribute('aria-disabled', 'true');

    await harness.user.click(refused);
    await harness.user.keyboard('{Enter}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      Object.values(personVariables(harness)).map((variable) => variable.name),
    ).not.toContain('nominated early');
  });

  /**
   * The type this would be created on, not the kinds of answer this control
   * can use: a name is taken by a date attribute just as firmly as by a text
   * one, and the codebook refuses it either way.
   */
  it('counts a name held by an attribute this picker never offers', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: (
        <Section title="Only booleans">
          <Field<typeof VariablePickerField>
            name="mark"
            component={VariablePickerField}
            label="Attribute the tap marks"
            options={[]}
            namesInUse={['age']}
            onCreateOption={async () => ({ status: 'created' })}
          />
        </Section>
      ),
    });
    await harness.opened();

    const dialog = await openAttributePicker(
      harness.user,
      attributeField('Attribute the tap marks'),
    );
    await search(harness, dialog, 'age');

    expect(
      within(dialog).getByRole('option', {
        name: 'Cannot create attribute named “age”: this type already has an attribute called that',
      }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  /**
   * Choosing from what exists is the right answer wherever inventing an
   * attribute would be a decision the researcher has not been asked to make,
   * so a picker with no create verb offers no create row for any term at all.
   */
  it('offers nothing to create where nothing may be created', async () => {
    const harness = renderRows(<SelectableAttributes />);
    await addRow(harness);
    const dialog = await openAttributePicker(harness.user, picker());

    await search(harness, dialog, 'nominated_early');

    expect(
      within(dialog).queryByRole('option', {
        name: /^Create new attribute called/u,
      }),
    ).toBeNull();
    expect(
      within(dialog).getByText(
        'No attribute matches what you typed, and one cannot be created from this window. Create one elsewhere in your protocol and come back to choose it.',
      ),
    ).toBeVisible();
  });

  /**
   * A refusal is ABOUT the name that was typed, so the window stays open on it
   * — and the reason has to be inside the window, because the section that
   * refused it is behind a modal while the window is open.
   */
  /**
   * The rows a search produces are keyed for a collection that keeps only the
   * first of two rows sharing a key — so the offer to create `nick` and an
   * attribute the protocol filed under the id `create:nick` were one key, and
   * the attribute silently left the list a researcher was searching it in.
   */
  it('offers an attribute whose id reads like the row it invents', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: <CollidingIds />,
    });
    await harness.opened();
    const dialog = await openAttributePicker(
      harness.user,
      attributeField(DIRECT_PICKER),
    );

    await search(harness, dialog, 'nick');
    expect(createRow(dialog, 'nick')).toBeVisible();
    expect(
      within(dialog).getByRole('option', { name: 'nickname' }),
    ).toBeVisible();
  });

  it('keeps the window open on a name the codebook refused, and says why', async () => {
    const harness = renderRows(
      <StampedAttributes
        createAs={{
          into: SUBJECT,
          draft: { type: 'text', component: 'DatePicker' },
        }}
      />,
    );
    await addRow(harness);
    const dialog = await openAttributePicker(harness.user, picker());

    await search(harness, dialog, 'nominated_early');
    await harness.user.click(createRow(dialog, 'nominated_early'));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'This attribute cannot be collected with that input control.',
    );
    expect(
      within(dialog).getByRole('searchbox', {
        name: 'Find or create an attribute',
      }),
    ).toHaveValue('nominated_early');
    expect(heldVariableName()).toBeUndefined();
  });

  /**
   * The refusal the row cannot carry, and only the host can give.
   *
   * The attribute is written to the codebook section under that section's own
   * lock, so a collaborator editing the person type refuses this create
   * outright — before the draft is ever judged, and for a reason no row can
   * see.
   */
  it('says in the window when the host refuses the write outright', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: <StampedAttributes />,
      heldSections: [{ sectionId: PERSON_SECTION, displayName: 'Robin' }],
    });
    await addRow(harness);
    const dialog = await openAttributePicker(harness.user, picker());

    await search(harness, dialog, 'nominated_early');
    await harness.user.click(createRow(dialog, 'nominated_early'));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Robin is currently editing a section needed for this change.',
    );
    expect(
      Object.values(personVariables(harness)).map((variable) => variable.name),
    ).not.toContain('nominated_early');
  });

  /** The sentence is about the name that was refused, not about the next one. */
  it('takes the refusal down as soon as the name changes', async () => {
    const harness = renderRows(
      <StampedAttributes
        createAs={{
          into: SUBJECT,
          draft: { type: 'text', component: 'DatePicker' },
        }}
      />,
    );
    await addRow(harness);
    const dialog = await openAttributePicker(harness.user, picker());

    await search(harness, dialog, 'nominated_early');
    await harness.user.click(createRow(dialog, 'nominated_early'));
    await within(dialog).findByRole('alert');

    await harness.user.type(
      within(dialog).getByRole('searchbox', {
        name: 'Find or create an attribute',
      }),
      '_again',
    );
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });
});

/**
 * The control, with the answer to its create held in the test's own hand.
 *
 * The window between the click and the codebook's answer is one no test going
 * through the harness's host can hold open: the write commits before the
 * click's own act() has settled, so the busy state is over by the time anything
 * could look at it. Nothing is stubbed that the control depends on —
 * `onCreateOption` IS the seam, and a caller answering it slowly is exactly
 * what a real codebook round trip is.
 *
 * A locale mounts the same provider a host does, over this package's own
 * catalog; without one the control renders its descriptors, which is what
 * makes the English literals below real assertions.
 */
const mountControl = (locale?: string) => {
  let answer: ((outcome: CreateOptionOutcome) => void) | undefined;
  let refuse: ((reason: Error) => void) | undefined;
  const onCreateOption = () =>
    new Promise<CreateOptionOutcome>((resolve, reject) => {
      answer = resolve;
      refuse = reject;
    });
  const control = (
    <VariablePickerField
      name="variable"
      options={[]}
      emptyMessage="Nothing to choose from yet."
      onCreateOption={onCreateOption}
    />
  );
  render(
    locale === undefined ? (
      control
    ) : (
      <AppI18nProvider
        locale={locale}
        locales={ecosystemLocales}
        messages={protocolBuilderCatalogs[locale] ?? {}}
      >
        {control}
      </AppI18nProvider>
    ),
  );
  return {
    user: userEvent.setup(),
    /** Answers the create that is waiting, as the codebook would. */
    answerWith: (outcome: CreateOptionOutcome) => {
      if (answer === undefined) throw new Error('Nothing is waiting.');
      answer(outcome);
    },
    /** Fails it instead, the way a host that throws out of its own commit does. */
    throwFrom: (reason: Error) => {
      if (refuse === undefined) throw new Error('Nothing is waiting.');
      refuse(reason);
    },
  };
};

/**
 * The region the control keeps mounted for what it has to say about a create
 * that landed somewhere the caller could not use. Empty the rest of the time.
 */
const notice = () => screen.getByRole('status');

describe('the create row while the codebook write is in flight', () => {
  const askFor = async (
    control: ReturnType<typeof mountControl>,
    name: string,
  ) => {
    await control.user.click(
      screen.getByRole('button', { name: 'Select attribute' }),
    );
    const dialog = await screen.findByRole('dialog');
    await control.user.type(
      within(dialog).getByRole('searchbox', {
        name: 'Find or create an attribute',
      }),
      name,
    );
    await control.user.click(createRow(dialog, name));
    return dialog;
  };

  /**
   * Asking twice would ask the codebook for the same attribute twice, and the
   * second write is the one refused for a duplicate name — a refusal about
   * something the researcher did not do.
   */
  it('holds every row until the codebook has answered', async () => {
    const control = mountControl();
    const dialog = await askFor(control, 'nominated_early');

    expect(
      within(dialog).getByRole('option', {
        name: 'Creating the attribute “nominated_early”…',
      }),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(
      within(dialog).getByRole('searchbox', {
        name: 'Find or create an attribute',
      }),
    ).toBeDisabled();

    control.answerWith({ status: 'created' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  /** And says which name it is holding for. */
  it('says which attribute it is creating while it waits', async () => {
    const control = mountControl();
    const dialog = await askFor(control, 'nominated_early');

    expect(
      within(dialog).getByRole('option', {
        name: 'Creating the attribute “nominated_early”…',
      }),
    ).toBeInTheDocument();

    control.answerWith({ status: 'created' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  /**
   * The third answer, and the reason there is one: "it does not exist" and "it
   * exists, and nothing here was given it" are opposite instructions. The
   * attribute exists by now, so the window closes — reopening it on the same
   * name would ask the codebook for a name it already stores, and the
   * researcher, who asked once, reads a duplicate complaint about a second
   * attempt they never made.
   */
  it('closes and says so when the attribute was created and nothing took it', async () => {
    const control = mountControl();
    await askFor(control, 'nominated_early');
    control.answerWith({ status: 'unassigned' });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(notice()).toHaveTextContent(
      '“nominated_early” was added to the codebook, but it has not been selected here.',
    );
  });

  /** A create that landed where it was meant to has nothing to explain. */
  it('says nothing when the attribute was created and taken', async () => {
    const control = mountControl();
    await askFor(control, 'nominated_early');
    control.answerWith({ status: 'created' });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(notice()).toBeEmptyDOMElement();
  });

  /**
   * A caller that REJECTS rather than answering — a host that throws out of
   * its own commit — is not an answer the control can act on, but it is still
   * the end of the write. Nobody has said anything, so the button coming back
   * beside an unchanged field is all the researcher gets, and it is
   * indistinguishable from a press that never happened.
   *
   * Said on the FIELD and the window closed, because a window left open holds
   * the one sentence they need behind a search box they have no reason to look
   * at again.
   */
  it('says the create failed when the caller throws instead of answering', async () => {
    const control = mountControl();
    await askFor(control, 'nominated_early');
    control.throwFrom(new Error('the host refused the commit'));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(notice()).toHaveTextContent(
      'This attribute could not be created, so nothing was changed. Try again.',
    );
  });

  /**
   * The refusal with no words of its own: the window stays open on the name,
   * because that is the one thing the researcher can still change.
   */
  it('keeps the window open on a bare refusal', async () => {
    const control = mountControl();
    const dialog = await askFor(control, 'nominated_early');
    control.answerWith({ status: 'refused' });

    await waitFor(() =>
      expect(createRow(dialog, 'nominated_early')).not.toHaveAttribute(
        'aria-disabled',
      ),
    );
    expect(
      within(dialog).getByRole('searchbox', {
        name: 'Find or create an attribute',
      }),
    ).toHaveValue('nominated_early');
    expect(notice()).toBeEmptyDOMElement();
  });

  /** The notice is about the create that has just happened, not the next one. */
  it('takes the notice down as soon as the picker is opened again', async () => {
    const control = mountControl();
    await askFor(control, 'nominated_early');
    control.answerWith({ status: 'unassigned' });
    await waitFor(() => expect(notice()).not.toBeEmptyDOMElement());

    await control.user.click(
      screen.getByRole('button', { name: 'Select attribute' }),
    );
    const dialog = await screen.findByRole('dialog');
    await control.user.type(
      within(dialog).getByRole('searchbox', {
        name: 'Find or create an attribute',
      }),
      'nominated_late',
    );
    await control.user.click(createRow(dialog, 'nominated_late'));

    expect(notice()).toBeEmptyDOMElement();
    control.answerWith({ status: 'created' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  /**
   * The window is dismissible while the write is out — Architect's create
   * never held the researcher there either — so a refusal can arrive about a
   * name they have already walked away from. There is no window left to say it
   * in, and the next one they open is about a different name: a refusal kept
   * across the close would stand over whatever they type there, which is the
   * "sentence the researcher cannot read about the name it was written for"
   * the reason was moved into the window to prevent, one step later.
   */
  it('drops a refusal that lands after the window was dismissed', async () => {
    const control = mountControl();
    await askFor(control, 'nominated_early');

    await control.user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    control.answerWith({
      status: 'refused',
      message: 'Robin is currently editing a section needed for this change.',
    });

    await control.user.click(
      screen.getByRole('button', { name: 'Select attribute' }),
    );
    const reopened = await screen.findByRole('dialog');
    const searchBox = within(reopened).getByRole('searchbox', {
      name: 'Find or create an attribute',
    });
    expect(within(reopened).queryByRole('alert')).toBeNull();
    expect(searchBox).toHaveValue('');
    expect(searchBox).toBeEnabled();
  });
});

/**
 * A field can turn read-only underneath its own open window: the shell keeps
 * the form mounted when a save is answered `notLockHolder` and closes
 * `FieldsDisabled` over every field in it, and a researcher who pressed Save
 * and opened this picker before the answer landed is standing in that window
 * when it does. `Modal` has made the page behind it inert, so the window is
 * the only thing left on screen that answers a press — and everything it
 * offers is now refused.
 */
describe('the window when the field turns read-only under it', () => {
  const OPTIONS = [
    { value: 'flagged', label: 'flagged', type: 'boolean' as const },
  ];

  const openOver = async () => {
    const user = userEvent.setup();
    const view = render(
      <VariablePickerField name="variable" options={OPTIONS} />,
    );
    await user.click(screen.getByRole('button', { name: 'Select attribute' }));
    await screen.findByRole('dialog');
    return { user, view };
  };

  /** Escape is the way out, and it is honoured whatever the field has become. */
  it('closes on Escape after the stage lock is lost', async () => {
    const { user, view } = await openOver();

    view.rerender(
      <VariablePickerField name="variable" options={OPTIONS} readOnly />,
    );
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      screen.getByRole('button', { name: 'Select attribute' }),
    ).toBeDisabled();
  });

  /** And so is a press outside it, which is the other way a window is let go. */
  it('closes on a press outside it after the field is disabled', async () => {
    const { user, view } = await openOver();

    view.rerender(
      <VariablePickerField name="variable" options={OPTIONS} disabled />,
    );
    await user.click(document.body);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

/**
 * The same control, and the same codebook writes, read in Spanish.
 *
 * Every sentence is asserted as a literal rather than by re-formatting the
 * descriptor the code read: `intl.formatMessage(messages.x)` would pass
 * whatever the catalog said, including nothing at all.
 */
describe('the attribute picker, read in Spanish', () => {
  const renderInSpanish = (createAs?: CreateAs) =>
    renderStageEditor({
      stageId: 'name-generator-1',
      locale: 'es',
      sections:
        createAs === undefined ? (
          <StampedAttributes />
        ) : (
          <StampedAttributes createAs={createAs} />
        ),
    });

  /** Opens the window on the one row, in Spanish. */
  const openInSpanish = async (harness: ReturnType<typeof renderInSpanish>) => {
    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Añadir un nuevo atributo para asignar',
      }),
    );
    const field = attributeField('Crear o seleccionar un atributo');
    await harness.user.click(
      within(field).getByRole('button', { name: 'Seleccionar atributo' }),
    );
    return screen.findByRole('dialog');
  };

  /** Asks the codebook for an attribute, and answers with what it said. */
  const askFor = async (
    harness: ReturnType<typeof renderInSpanish>,
    attributeName: string,
  ) => {
    const dialog = await openInSpanish(harness);
    await harness.user.type(
      within(dialog).getByRole('searchbox', {
        name: 'Busca o crea un atributo',
      }),
      attributeName,
    );
    await harness.user.click(
      within(dialog).getByRole('option', {
        name: `Crear un atributo nuevo llamado “${attributeName}”.`,
      }),
    );
    return within(dialog).findByRole('alert');
  };

  it('names the window, its search box and its list in Spanish', async () => {
    const harness = renderInSpanish();

    const dialog = await openInSpanish(harness);

    expect(dialog).toHaveAccessibleName('Crear o seleccionar un atributo');
    const box = within(dialog).getByRole('searchbox', {
      name: 'Busca o crea un atributo',
    });
    expect(box).toHaveAttribute('placeholder', 'Busca o crea un atributo…');
    expect(
      within(dialog).getByRole('listbox', { name: 'Resultados de atributos' }),
    ).toBeInTheDocument();
  });

  it('offers to create the typed name in Spanish', async () => {
    const harness = renderInSpanish();
    const dialog = await openInSpanish(harness);

    await harness.user.type(
      within(dialog).getByRole('searchbox', {
        name: 'Busca o crea un atributo',
      }),
      'nominado_pronto',
    );

    expect(
      within(dialog).getByRole('option', {
        name: 'Crear un atributo nuevo llamado “nominado_pronto”.',
      }),
    ).toBeInTheDocument();
  });

  /**
   * The name is the one thing the researcher supplies here, so its two
   * refusals are the two they can act on — and both are said in this package's
   * own words rather than in the schema's or the builder's.
   */
  it('says in Spanish why a name cannot be used, before asking', async () => {
    const harness = renderInSpanish();
    const dialog = await openInSpanish(harness);

    await harness.user.type(
      within(dialog).getByRole('searchbox', {
        name: 'Busca o crea un atributo',
      }),
      'nominado pronto',
    );

    expect(
      within(dialog).getByRole('option', {
        name: 'No se puede crear un atributo llamado “nominado pronto”: solo se pueden usar letras, números y los símbolos ._-: en un nombre',
      }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('says in Spanish that the stage is about nothing yet', async () => {
    const harness = renderInSpanish({
      into: undefined,
      draft: { type: 'boolean', component: 'Toggle' },
    });

    expect(await askFor(harness, 'nominado_pronto')).toHaveTextContent(
      'Elige con qué trabaja esta etapa antes de crear un atributo.',
    );
  });

  /**
   * The sentence is the HOST's refusal, not a check this control makes for
   * itself: the write is attempted, the protocol has no such section, and the
   * refusal comes back from there.
   *
   * Said in the words a stage ROW needs. The codebook's own editors answer the
   * same refusal by telling the researcher to close the editor and start
   * again, and there is no codebook editor open here: what they have to do on
   * a row is choose what the stage works with.
   */
  it('says in Spanish that the type it would be added to has gone', async () => {
    const harness = renderInSpanish({
      into: { entity: 'node', type: 'un-tipo-que-no-existe' },
      draft: { type: 'boolean', component: 'Toggle' },
    });

    expect(await askFor(harness, 'nominado_pronto')).toHaveTextContent(
      'Esta etapa trabaja con algo que el libro de códigos ya no contiene, así que no se ha guardado nada. Elige de nuevo con qué trabaja.',
    );
  });

  /**
   * The refusal with no explanation of its own, which is what a researcher is
   * left with when the codebook refuses something they were never asked about:
   * a categorical attribute IS its list of answers, and a name and a type
   * cannot make one.
   */
  it('says in Spanish that nothing was created, when there is nothing else to say', async () => {
    const harness = renderInSpanish({
      into: SUBJECT,
      draft: { type: 'categorical', component: 'CheckboxGroup' },
    });

    expect(await askFor(harness, 'nominado_pronto')).toHaveTextContent(
      'No se ha podido crear este atributo, así que no se ha cambiado nada. Inténtalo de nuevo.',
    );
  });

  it('says in Spanish that the control cannot collect this kind of answer', async () => {
    const harness = renderInSpanish({
      into: SUBJECT,
      draft: { type: 'text', component: 'DatePicker' },
    });

    expect(await askFor(harness, 'nominado_pronto')).toHaveTextContent(
      'Este atributo no se puede recoger con ese control de entrada.',
    );
  });

  /**
   * The one sentence here that no codebook refusal can produce: the write
   * SUCCEEDED and the caller could not take what it made, which is an answer
   * only the seam can give. Mounted directly for that reason — the same
   * provider over the same catalog, with the answer held in the test's hand.
   */
  it('says in Spanish that the attribute it created was not selected', async () => {
    const control = mountControl('es');

    await control.user.click(
      screen.getByRole('button', { name: 'Seleccionar atributo' }),
    );
    const dialog = await screen.findByRole('dialog');
    await control.user.type(
      within(dialog).getByRole('searchbox', {
        name: 'Busca o crea un atributo',
      }),
      'nominado_pronto',
    );
    await control.user.click(
      within(dialog).getByRole('option', {
        name: 'Crear un atributo nuevo llamado “nominado_pronto”.',
      }),
    );
    control.answerWith({ status: 'unassigned' });

    await waitFor(() =>
      expect(notice()).toHaveTextContent(
        'Se ha añadido «nominado_pronto» al libro de códigos, pero no se ha seleccionado aquí.',
      ),
    );
  });
});

/**
 * What the codebook write is: a section edit of its own, taken under that
 * section's lock, committed the moment the researcher asks for it.
 *
 * An attribute in the codebook is valid on its own, while the stage pointing
 * at it may not be finished — so the two are not one edit, and abandoning the
 * stage cannot take the attribute with it.
 */
describe('where an invented attribute is written', () => {
  it('commits under the codebook section’s lock, and survives cancelling the stage', async () => {
    const harness = renderRows(<StampedAttributes />);
    await addRow(harness);
    const dialog = await openAttributePicker(harness.user, picker());

    await search(harness, dialog, 'nominated_early');
    await harness.user.click(createRow(dialog, 'nominated_early'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // In the PROTOCOL, not merely in the form: read back through the host.
    const created = Object.entries(personVariables(harness)).find(
      ([, variable]) => variable.name === 'nominated_early',
    );
    expect(created?.[1]).toMatchObject({ name: 'nominated_early' });
    // And it landed in the person type's own section, which is what having
    // taken that section's lock to write it means.
    expect(
      Object.keys(
        harness.host.store.read(PERSON_SECTION).document.variables ?? {},
      ),
    ).toContain(created?.[0]);

    await harness.cancel();

    expect(
      Object.values(
        harness.host.store.read(PERSON_SECTION).document.variables ?? {},
      ).map((variable) =>
        typeof variable === 'object' && variable !== null
          ? Reflect.get(variable, 'name')
          : undefined,
      ),
    ).toContain('nominated_early');
  });
});

/**
 * The window is portalled out of the field, but its React events still bubble
 * through the owner tree.
 *
 * Without the boundary, the search box taking focus reads as the researcher
 * leaving the field: a picker with a required rule raises its error under an
 * open window, and the re-render that follows lands under their first click.
 * A finished pick is the one focus change that IS the field's answer.
 */
describe('the picker’s blur boundary', () => {
  const REQUIRED = 'Choose an attribute.';
  const FIELD_NAME = 'nodeConfig.egoVariable';

  /**
   * Whether the form thinks the researcher has LEFT this field.
   *
   * Read from the store rather than from the error on screen, because the
   * error is not the same question: a field that validates on change clears
   * and raises it without anybody ever leaving, so a picker that never marked
   * itself blurred would still look right. Being blurred is what the form
   * carries into its next save.
   */
  function BlurredProbe() {
    const { storeApi } = useStageEditorForm();
    const blurred = useSyncExternalStore(
      useCallback(
        (onStoreChange: () => void) => storeApi.subscribe(onStoreChange),
        [storeApi],
      ),
      useCallback(
        () =>
          storeApi.getState().getFieldState(FIELD_NAME)?.meta.isBlurred ===
          true,
        [storeApi],
      ),
    );
    return (
      <p
        role="status"
        aria-label="Left the attribute field"
        data-blurred={blurred}
      >
        {blurred ? 'left' : 'in it'}
      </p>
    );
  }

  /**
   * The probe element, held rather than re-queried.
   *
   * While the window is open everything behind it is `inert`, so a role query
   * cannot reach the probe at all — which is the state this most needs to read
   * it in.
   */
  const blurredProbe = () =>
    screen.getByRole('status', { name: 'Left the attribute field' });

  function RequiredPicker() {
    return (
      <Section title="What this question records">
        <Field<typeof VariablePickerField>
          name={FIELD_NAME}
          component={VariablePickerField}
          label={DIRECT_PICKER}
          options={[{ value: 'flagged', label: 'flagged', type: 'boolean' }]}
          required={REQUIRED}
        />
        <BlurredProbe />
      </Section>
    );
  }

  it('does not raise the field’s required error while the window is open', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: <RequiredPicker />,
    });
    await harness.opened();
    const field = attributeField(DIRECT_PICKER);

    const probe = blurredProbe();
    within(field).getByRole('button', { name: 'Select attribute' }).focus();
    await openAttributePicker(harness.user, field);

    // Not blurred — the researcher is in the middle of answering this field —
    // and so nothing has been refused under the open window.
    expect(probe).toHaveAttribute('data-blurred', 'false');
    expect(screen.queryByText(REQUIRED)).toBeNull();
  });

  /**
   * And does raise it once the field has been answered and left: the pick is
   * the field's final blur, which is what clears a refused save's error
   * without a second save.
   */
  it('marks the field blurred once the pick is made', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: <RequiredPicker />,
    });
    await harness.opened();
    const field = attributeField(DIRECT_PICKER);

    // Refused first, so the field is carrying the error the pick has to clear.
    expect(await harness.submit()).toBeNull();
    expect(await screen.findByText(REQUIRED)).toBeVisible();
    // And the refusal sends the researcher to the control that resolves it —
    // the trigger, which is not the first focusable thing in this field once
    // an attribute has been chosen. See `data-field-focus-target`.
    await waitFor(() =>
      expect(
        within(field).getByRole('button', { name: 'Select attribute' }),
      ).toHaveFocus(),
    );

    await chooseAttribute(harness.user, field, 'flagged');

    await waitFor(() =>
      expect(blurredProbe()).toHaveAttribute('data-blurred', 'true'),
    );
    expect(screen.queryByText(REQUIRED)).toBeNull();
  });

  /**
   * A picker inside a row is different: its nearest field is unconnected,
   * while the next connected ancestor owns the whole list. Propagating there
   * would reject a row the researcher has not finished filling in.
   */
  it('does not blur the owning list when a row’s picker is answered', async () => {
    const harness = renderRows(<StampedAttributes />);
    await addRow(harness);

    await chooseAttribute(harness.user, picker(), 'flagged');

    // The row names its attribute and still has no value, which is exactly
    // what a half-finished row is — and nothing has refused it.
    expect(heldVariableName()).toBe('flagged');
    expect(
      screen.queryByText('Choose what this attribute is set to.'),
    ).toBeNull();
  });
});
