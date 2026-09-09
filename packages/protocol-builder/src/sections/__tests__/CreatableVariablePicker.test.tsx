import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
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
import AssignAttributes from '../../form/arrayFields/AssignAttributes.tsx';
import { protocolBuilderCatalogs } from '../../locales/catalogs.ts';
import {
  type CodebookSubject,
  variablesForSubject,
} from '../../protocol-context.ts';
import { useProtocolContext } from '../../state/protocolContext.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import {
  CreatableVariablePickerControl,
  type CreateOptionOutcome,
} from '../CreatableVariablePicker.tsx';

const SUBJECT: CodebookSubject = { entity: 'node', type: 'person' };

const NO_VARIABLES: ReadonlySet<string> = new Set();

// Rows know nothing about what any control takes, so the picker reaches them
// as an open-record renderer — adapted once, exactly as a section does it.
const VariablePicker = CreatableVariablePickerControl as ComponentType<
  Record<string, unknown>
>;

/**
 * What the HOST decides about an attribute created from a row: which codebook
 * section it lands in, and what it is created as.
 *
 * The researcher is only ever asked for a name — see
 * `CreatableVariablePickerProps.onCreateOption` — so these two are the host's
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

  // Answered as a variable id or as nothing at all: the row commits its own
  // cell only when the codebook write landed, so a refusal leaves it naming
  // nothing rather than an attribute that does not exist.
  const onCreateVariable = useCallback(
    async (variableName: string) => {
      const outcome = await createVariable({ name: variableName, ...draft });
      if (outcome.status === 'refused') {
        setProblem(outcome.message);
        return undefined;
      }
      setProblem(undefined);
      return outcome.variableId;
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

const renderRows = (sections: ReactNode) =>
  renderStageEditor({ stageId: 'name-generator-1', sections });

const addRow = async (harness: ReturnType<typeof renderRows>) => {
  await harness.user.click(
    await screen.findByRole('button', { name: 'Add new attribute to assign' }),
  );
};

const picker = () =>
  screen.getByRole('combobox', {
    name: 'Create or select an attribute',
  }) as HTMLSelectElement;

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

describe('the creatable attribute picker', () => {
  /**
   * The attribute a researcher wants is often the one they have only just
   * thought of, and a picker that could only choose would send them to the
   * codebook and back to finish a single thought.
   *
   * The codebook write goes through the harness's in-memory host under the
   * codebook section's own lock, so this also proves the attribute actually
   * lands in the protocol — not just that a callback was called.
   */
  it('creates the attribute a row asks for, and selects it', async () => {
    const harness = renderRows(<StampedAttributes />);
    await addRow(harness);

    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Create a new attribute' }),
      'nominated_early',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Create the attribute' }),
    );

    await waitFor(() =>
      expect(
        within(picker()).getByRole('option', { name: 'nominated_early' }),
      ).toBeInTheDocument(),
    );
    const created = picker().value;
    expect(created).not.toBe('');

    expect(personVariables(harness)[created]).toMatchObject({
      name: 'nominated_early',
      type: 'boolean',
    });

    // The name box is emptied, so the button cannot create the same attribute
    // a second time by being pressed again.
    expect(
      screen.getByRole('textbox', { name: 'Create a new attribute' }),
    ).toHaveValue('');
  });

  /**
   * A row is handed a variable id or nothing, so it cannot carry a refusal —
   * and a create that quietly did nothing leaves the researcher pressing the
   * button again. The codebook refuses a name it cannot store (a space, here),
   * and what appears is the rule said in the words every other surface says it
   * in — not the schema's own complaint about a path, and not the request
   * builder's internal "the variable draft is invalid".
   */
  it('says why an attribute it could not create was not created', async () => {
    const harness = renderRows(<StampedAttributes />);
    await addRow(harness);

    const box = await screen.findByRole('textbox', {
      name: 'Create a new attribute',
    });
    await harness.user.type(box, 'nominated early');
    await harness.user.click(
      screen.getByRole('button', { name: 'Create the attribute' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Not a valid attribute name. Only letters, numbers and the symbols ._-: are supported',
    );
    // The refusal is about the name they typed, so the name is still there to
    // be corrected.
    expect(box).toHaveValue('nominated early');
    // Nothing was written, so the row still names nothing.
    expect(picker().value).toBe('');
    expect(
      Object.values(personVariables(harness)).map((variable) => variable.name),
    ).not.toContain('nominated early');
  });

  /**
   * The refusal the row cannot carry, and only the host can give.
   *
   * The attribute is written to the codebook section under that section's own
   * lock, so a collaborator editing the person type refuses this create outright
   * — before the draft is ever judged, and for a reason no row can see. A row is
   * handed a variable id or nothing at all, so a refusal said by nobody leaves a
   * researcher who pressed Create looking at a row exactly as it was, with no
   * way to tell a write that did nothing from one that has not happened yet.
   */
  it('says nothing was created when the host refuses the write outright', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: <StampedAttributes />,
      heldSections: [{ sectionId: PERSON_SECTION, displayName: 'Robin' }],
    });
    await addRow(harness);

    const box = await screen.findByRole('textbox', {
      name: 'Create a new attribute',
    });
    await harness.user.type(box, 'nominated_early');
    await harness.user.click(
      screen.getByRole('button', { name: 'Create the attribute' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Robin is currently editing a section needed for this change.',
    );

    // And nothing was written, which is what makes the sentence true, so the
    // row still names nothing.
    expect(picker().value).toBe('');
    expect(
      Object.values(personVariables(harness)).map((variable) => variable.name),
    ).not.toContain('nominated_early');
  });

  /**
   * The other half a host supplies, refused: a control that cannot collect the
   * kind of answer the host asks the attribute to be created as.
   *
   * The schema says so as one `invalid_union` at the empty path — every branch
   * it could have been fails somewhere — so there is nothing in the issue to
   * anchor a sentence to, and what the researcher is told has to be read from
   * the draft that was refused rather than from the refusal.
   */
  it('says why an attribute its control cannot collect was not created', async () => {
    const harness = renderRows(
      <StampedAttributes
        createAs={{
          into: SUBJECT,
          draft: { type: 'text', component: 'DatePicker' },
        }}
      />,
    );
    await addRow(harness);

    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Create a new attribute' }),
      'nominated_early',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Create the attribute' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This attribute cannot be collected with that input control.',
    );
  });

  /**
   * The name box sits inside the stage's own `<form>`, whose default button is
   * the host's Save — associated by `form=`, which makes it the form's default
   * button wherever the host renders it. So Enter, which is what anyone typing
   * a name into a box beside a Create button presses, ran the browser's
   * implicit submission: on a stage that was already valid the editor saved
   * and closed, no attribute was created, and the typed name went with it.
   *
   * The premise is asserted rather than assumed — the box's enclosing form is
   * this harness's stage form, and that form has a submit control attached to
   * it by `form=`.
   *
   * Driven as a real key press rather than through `userEvent`, which looks
   * for a submit button INSIDE the form and so never performs the submission
   * this is about: what is asserted is that the event is answered here and
   * does not go on to the form, and that the attribute lands.
   */
  it('creates the attribute when Enter is pressed in the name box', async () => {
    const harness = renderRows(<StampedAttributes />);
    await addRow(harness);

    const box = await screen.findByRole('textbox', {
      name: 'Create a new attribute',
    });
    expect(box.closest('form')?.id).toBe(harness.formId);
    expect(
      document.querySelector(`button[type="submit"][form="${harness.formId}"]`),
    ).not.toBeNull();

    await harness.user.type(box, 'nominated_early');
    const enter = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      box.dispatchEvent(enter);
    });

    expect(enter.defaultPrevented).toBe(true);
    await waitFor(() =>
      expect(
        within(picker()).getByRole('option', { name: 'nominated_early' }),
      ).toBeInTheDocument(),
    );
    expect(picker().value).not.toBe('');
    // Emptied on the answer, exactly as the button's own create empties it.
    expect(box).toHaveValue('');
  });

  /**
   * Choosing from what exists is the right answer wherever inventing an
   * attribute would be a decision the researcher has not been asked to make,
   * so the control offers nothing to create when nothing can be created — and
   * the list itself is still there.
   */
  it('is the plain picker where nothing may be created', async () => {
    const harness = renderRows(<SelectableAttributes />);
    await addRow(harness);

    expect(picker()).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Create a new attribute' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Create the attribute' }),
    ).toBeNull();
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
    <CreatableVariablePickerControl
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

describe('the create control while the codebook write is in flight', () => {
  const nameBox = () =>
    screen.getByRole('textbox', { name: 'Create a new attribute' });
  const createButton = () =>
    screen.getByRole('button', { name: 'Create the attribute' });

  /**
   * Pressing it twice would ask the codebook for the same attribute twice, and
   * the second write is the one that gets refused for a duplicate name — a
   * refusal about something the researcher did not do.
   */
  it('holds the create button until the codebook has answered', async () => {
    const { user, answerWith } = mountControl();

    await user.type(nameBox(), 'nominated_early');
    expect(createButton()).toBeEnabled();
    await user.click(createButton());

    expect(createButton()).toBeDisabled();
    // Still the name they typed: nothing has been written yet.
    expect(nameBox()).toHaveValue('nominated_early');

    // Emptied only now — which is also why the button stays disabled after a
    // create that landed: there is no longer a name to create.
    answerWith({ status: 'created' });
    await waitFor(() => expect(nameBox()).toHaveValue(''));
  });

  /**
   * A caller that REJECTS rather than answering — a host that throws out of its
   * own commit — is not an answer the control can act on, but it is still the
   * end of the write. Without the button coming back the researcher is left
   * looking at a control that never recovers, with the name they typed still in
   * the box and no way to try again.
   */
  it('gives the button back when the create fails outright', async () => {
    const { user, throwFrom } = mountControl();

    await user.type(nameBox(), 'nominated_early');
    await user.click(createButton());
    expect(createButton()).toBeDisabled();

    throwFrom(new Error('the host refused the commit'));

    await waitFor(() => expect(createButton()).toBeEnabled());
    expect(nameBox()).toHaveValue('nominated_early');
  });

  /**
   * And says so. The button coming back is not an answer: a create that ended
   * in a throw looks exactly like one that has not been pressed, and the
   * researcher's next move is to press it again — which is the same failing
   * write, or, if that first one did land somewhere this control never heard
   * about, a duplicate name they never asked for twice.
   *
   * There is nothing more specific to say — no host answered — so what is said
   * is the package's own sentence for a codebook write refused for a reason
   * with no explanation of its own, the same one `useCreateCodebookVariable`
   * answers with.
   */
  it('says the create failed when the caller throws instead of answering', async () => {
    const { user, throwFrom } = mountControl();

    await user.type(nameBox(), 'nominated_early');
    await user.click(createButton());
    throwFrom(new Error('the host refused the commit'));

    await waitFor(() =>
      expect(notice()).toHaveTextContent(
        'This attribute could not be created, so nothing was changed. Try again.',
      ),
    );
    // Said about a write that did not happen, so the name is still theirs.
    expect(nameBox()).toHaveValue('nominated_early');
  });

  /** The sentence is about the create that just failed, not about the next name. */
  it('takes the failure notice down as soon as another name is typed', async () => {
    const { user, throwFrom } = mountControl();

    await user.type(nameBox(), 'nominated_early');
    await user.click(createButton());
    throwFrom(new Error('the host refused the commit'));
    await waitFor(() => expect(notice()).not.toBeEmptyDOMElement());

    await user.type(nameBox(), '_again');
    expect(notice()).toBeEmptyDOMElement();
  });

  /**
   * And the box with it, for the same reason and one more.
   *
   * A name typed while the write was in flight was erased by the answer: the
   * create captured the name it submitted and the success emptied the box
   * whatever was in it by then. The refusal was worse — it is written about
   * the name that was SUBMITTED, and it arrived beside a box showing a
   * different one. Held, the box says exactly what the answer will be about.
   */
  it('holds the name box too, so the answer is about what is in it', async () => {
    const { user, answerWith } = mountControl();

    await user.type(nameBox(), 'nominated_early');
    await user.click(createButton());

    expect(nameBox()).toBeDisabled();
    expect(nameBox()).toHaveValue('nominated_early');

    answerWith({ status: 'created' });
    await waitFor(() => expect(nameBox()).toHaveValue(''));
    expect(nameBox()).toBeEnabled();
  });

  it('control: gives the box back when the create was refused', async () => {
    const { user, answerWith } = mountControl();

    await user.type(nameBox(), 'nominated early');
    await user.click(createButton());
    answerWith({ status: 'refused' });

    await waitFor(() => expect(nameBox()).toBeEnabled());
    await user.type(nameBox(), '_enough');
    expect(nameBox()).toHaveValue('nominated early_enough');
  });

  /** The refusal is about that name, so the box is what they correct. */
  it('gives the button back with the refused name still in the box', async () => {
    const { user, answerWith } = mountControl();

    await user.type(nameBox(), 'nominated early');
    await user.click(createButton());
    answerWith({ status: 'refused' });

    // Enabled again, because pressing it once more is the whole point of a
    // refusal the researcher can correct.
    await waitFor(() => expect(createButton()).toBeEnabled());
    expect(nameBox()).toHaveValue('nominated early');
    // Nothing was created, so there is nowhere for it to have gone.
    expect(notice()).toBeEmptyDOMElement();
  });

  /**
   * The third answer, and the reason there is one: a boolean called this a
   * refusal, and a refusal is the one answer that KEEPS the name. The
   * attribute exists by now, so keeping it is a create button that asks the
   * codebook for a name it already stores — and the researcher, who pressed
   * Create once, reads a duplicate-name complaint about a second attempt they
   * never made.
   */
  it('empties the box when the attribute was created and nothing took it', async () => {
    const { user, answerWith } = mountControl();

    await user.type(nameBox(), 'nominated_early');
    await user.click(createButton());
    answerWith({ status: 'unassigned' });

    await waitFor(() => expect(nameBox()).toHaveValue(''));
    expect(createButton()).toBeDisabled();
  });

  /**
   * And says so, because an emptied box beside an unchanged selection is what
   * a create that quietly did nothing looks like. The attribute exists — that
   * write succeeded — so what is left to say is that nothing here was given
   * it.
   */
  it('says the created attribute was not the one it now names', async () => {
    const { user, answerWith } = mountControl();

    await user.type(nameBox(), 'nominated_early');
    await user.click(createButton());
    answerWith({ status: 'unassigned' });

    await waitFor(() =>
      expect(notice()).toHaveTextContent(
        '“nominated_early” was added to the codebook, but it has not been selected here.',
      ),
    );
  });

  /** A create that landed where it was meant to has nothing to explain. */
  it('says nothing when the attribute was created and taken', async () => {
    const { user, answerWith } = mountControl();

    await user.type(nameBox(), 'nominated_early');
    await user.click(createButton());
    answerWith({ status: 'created' });

    await waitFor(() => expect(nameBox()).toHaveValue(''));
    expect(notice()).toBeEmptyDOMElement();
  });

  /**
   * The notice is about the create that has just happened. Naming another
   * attribute is the start of a different one, and leaving the old sentence
   * under the box would have it read as being about the name now in it.
   */
  it('takes the notice down as soon as another name is typed', async () => {
    const { user, answerWith } = mountControl();

    await user.type(nameBox(), 'nominated_early');
    await user.click(createButton());
    answerWith({ status: 'unassigned' });
    await waitFor(() => expect(notice()).not.toBeEmptyDOMElement());

    await user.type(nameBox(), 'nominated_late');
    expect(notice()).toBeEmptyDOMElement();
  });
});

/**
 * The same control, and the same codebook writes, read in Spanish.
 *
 * This file is the only place `CreatableVariablePickerControl` is mounted —
 * no section renders it yet — so it is also the only place its own copy can be
 * read in any language at all, and the only place the
 * refusals `useCreateCodebookVariable` answers with can be provoked one at a
 * time: what the codebook refuses is decided by the pair of answers the HOST
 * gives (`CreateAs`), and a form field's dialog can only ever give it a name,
 * a collectable type and a control that type allows.
 *
 * Every sentence is asserted as a literal rather than by re-formatting the
 * descriptor the code read: `intl.formatMessage(messages.x)` would pass
 * whatever the catalog said, including nothing at all.
 */
describe('the creatable attribute picker, read in Spanish', () => {
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

  const nameBox = async (harness: ReturnType<typeof renderInSpanish>) => {
    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Añadir un nuevo atributo para asignar',
      }),
    );
    return screen.findByRole('textbox', { name: 'Crear un atributo nuevo' });
  };

  /** Asks the codebook for an attribute, and answers with what it said. */
  const askFor = async (
    harness: ReturnType<typeof renderInSpanish>,
    attributeName: string,
  ) => {
    await harness.user.type(await nameBox(harness), attributeName);
    await harness.user.click(
      screen.getByRole('button', { name: 'Crear el atributo' }),
    );
    return screen.findByRole('alert');
  };

  it('names the box, its guidance and its button in Spanish', async () => {
    const harness = renderInSpanish();

    const box = await nameBox(harness);
    // The example is a name the codebook would actually take, so it is
    // translated to an equally valid one rather than left in English.
    expect(box).toHaveAttribute('placeholder', 'nominado_pronto');
    expect(
      screen.getByText(
        'Lo añade al libro de códigos de este tipo y lo selecciona arriba.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Crear el atributo' }),
    ).toBeInTheDocument();
  });

  /**
   * The one sentence here that no codebook refusal can produce: the write
   * SUCCEEDED and the caller could not take what it made, which is an answer
   * only the seam can give. Mounted directly for that reason — the same
   * provider over the same catalog, with the answer held in the test's hand.
   */
  it('says in Spanish that the attribute it created was not selected', async () => {
    const { user, answerWith } = mountControl('es');

    await user.type(
      screen.getByRole('textbox', { name: 'Crear un atributo nuevo' }),
      'nominado_pronto',
    );
    await user.click(screen.getByRole('button', { name: 'Crear el atributo' }));
    answerWith({ status: 'unassigned' });

    await waitFor(() =>
      expect(notice()).toHaveTextContent(
        'Se ha añadido «nominado_pronto» al libro de códigos, pero no se ha seleccionado aquí.',
      ),
    );
  });

  /**
   * The other sentence only the seam can produce: a caller that throws instead
   * of answering. It is the package's shared wording for a codebook write
   * refused with no explanation of its own, so this also reads that one on this
   * surface, in this language.
   */
  it('says in Spanish that a create which never answered created nothing', async () => {
    const { user, throwFrom } = mountControl('es');

    await user.type(
      screen.getByRole('textbox', { name: 'Crear un atributo nuevo' }),
      'nominado_pronto',
    );
    await user.click(screen.getByRole('button', { name: 'Crear el atributo' }));
    throwFrom(new Error('the host refused the commit'));

    await waitFor(() =>
      expect(notice()).toHaveTextContent(
        'No se ha podido crear este atributo, así que no se ha cambiado nada. Inténtalo de nuevo.',
      ),
    );
  });

  /**
   * The name is the one thing the researcher supplies here, so its two
   * refusals are the two they can act on — and both are said in this package's
   * own words rather than in the schema's or the builder's.
   */
  it('says in Spanish that a name the codebook cannot store was refused', async () => {
    const harness = renderInSpanish();

    expect(await askFor(harness, 'nominado pronto')).toHaveTextContent(
      'No es un nombre de atributo válido. Solo se admiten letras, números y los símbolos ._-:',
    );
  });

  it('says in Spanish that another attribute is already called that', async () => {
    const harness = renderInSpanish();

    // `name` is what the fixture's person type already calls one of its own.
    expect(await askFor(harness, 'name')).toHaveTextContent(
      'Ya existe aquí un atributo con este nombre. Elige otro nombre.',
    );
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
   * The sentence is the HOST's refusal now, not a check this control makes for
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
   * left with when the codebook refuses something they were never asked
   * about: a categorical attribute IS its list of answers, and a name and a
   * type cannot make one.
   *
   * A control the attribute's type cannot take arrives in the SAME shape —
   * `VariableSchema` is a plain union, and zod hoists an issue to its own path
   * only when every branch reports it there, which happens for `name` (every
   * variable has one) and never for `component`: a text variable collected
   * with a date picker fails the text branch at `component` and every other
   * branch at `type`, so one `invalid_union` at the empty path is all that
   * comes back. It is told apart from this one by the draft rather than by the
   * refusal — see `controlIsNotOffered`, and the test above that reads it.
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
});
