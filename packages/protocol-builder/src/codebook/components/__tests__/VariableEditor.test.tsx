import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import type { ProtocolBuilderProtocolContext } from '../../../protocol-context.ts';
import { codebookRefusalMessage } from '../../compoundFailureCopy.ts';
import type { CodebookWriteOutcome } from '../../writes.ts';
import VariableEditor, {
  type VariableEditorProps,
} from '../VariableEditor.tsx';

const SUBJECT = { entity: 'node', type: 'person' } as const;
const PERSON_SECTION = sectionId({ kind: 'codebookNode', typeId: 'person' });
const EMPTY_CONTEXT: ProtocolBuilderProtocolContext = {
  codebook: { node: {}, edge: {} },
  assets: {},
  orderedStages: [],
  issues: [],
};
/**
 * The package's own words for a refused save.
 *
 * Written out here rather than imported: the point of the copy is that it is
 * NOT the message the host sent, and a test that read the same table as the
 * component would still pass if that table were replaced by a passthrough.
 */
const REFUSED = {
  heldByNobodyNamed:
    'A section needed for this change is currently being edited.',
  heldBy: (who: string) =>
    `${who} is currently editing a section needed for this change.`,
  threw:
    'This change could not be saved, and nothing was altered. Wait a moment and try again.',
} as const;

/** What a host says. None of it reaches the researcher. */
const HOST_WORDS =
  'Expected object, received undefined at codebook.node.person';

/**
 * The one thing a thrown refusal says that a researcher can act on.
 *
 * `codebookEditing.duplicateVariableName`, written out here for the reason
 * `REFUSED` is: read from the descriptor it would still pass if the editor
 * stopped decoding it and showed the raw encoded payload instead.
 */
const DUPLICATE_NAME = 'Attribute with name "Age" already exists';

/**
 * What a surface that refused the draft itself says, in the shape
 * `findDraftContradictions` writes. This one DOES reach the researcher.
 */
const CONTRADICTION =
  '“Minimum selected” requires 3 answers, but this attribute has only 2 options to choose from.';

/**
 * The same kind of sentence, written by the codebook schema rather than by a
 * host: `rejectValidationContradictions` refuses an attribute whose committed
 * rules its options can no longer satisfy, and anchors it at the rule.
 *
 * Written out rather than imported, for the reason `REFUSED` is: a test that
 * read the schema's own message would still pass if the editor rendered
 * nothing and the alert kept its generic copy.
 */
const OPTION_COUNT_CONTRADICTION =
  'Attribute "preference": minSelected (3) is greater than the number of options (2)';

const APPLIED: CodebookWriteOutcome = {
  status: 'applied',
  sectionId: PERSON_SECTION,
};

type SubmitDocument = (document: SectionDoc) => Promise<CodebookWriteOutcome>;

const submitting = (
  outcome: CodebookWriteOutcome = APPLIED,
): ReturnType<typeof vi.fn<SubmitDocument>> =>
  vi.fn<SubmitDocument>(async () => outcome);

function personDocument(
  variables: Readonly<Record<string, unknown>> = {},
): SectionDoc {
  return {
    name: 'Person',
    color: 'node-color-seq-1',
    shape: { default: 'circle' },
    variables,
  };
}

/** The attribute map of the section document a save handed over. */
function submittedVariables(
  submit: ReturnType<typeof vi.fn<SubmitDocument>>,
  call = 0,
): Record<string, unknown> {
  const document = submit.mock.calls[call]?.[0];
  if (document === undefined) throw new Error('missing submitted document');
  if (!isRecord(document.variables)) {
    throw new Error('expected the submitted variables map');
  }
  return document.variables;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Every polite or assertive region this element sits inside, itself included.
 *
 * Counted rather than asserted about globally: the editor mounts one live
 * region per field by design (`FieldErrors` does, so an error that arrives
 * later is announced at all), and what must never happen is that one
 * announcement is inside another.
 */
function liveRegionsAround(element: HTMLElement): Element[] {
  const isLive = (node: Element) =>
    node.getAttribute('aria-live') !== null ||
    node.getAttribute('role') === 'status' ||
    node.getAttribute('role') === 'alert';
  const regions: Element[] = [];
  for (
    let node: Element | null = element;
    node !== null;
    node = node.parentElement
  ) {
    if (isLive(node)) regions.push(node);
  }
  return regions;
}

function createProps(
  overrides: Partial<Extract<VariableEditorProps, { mode: 'create' }>> = {},
): Extract<VariableEditorProps, { mode: 'create' }> {
  return {
    openId: 'open-1',
    mode: 'create',
    subject: SUBJECT,
    authoritativeDocument: personDocument(),
    variableId: 'new-variable',
    initialDraft: { name: '', type: 'text' },
    protocolContext: EMPTY_CONTEXT,
    onSubmitDocument: async () => APPLIED,
    onComplete: () => undefined,
    ...overrides,
  };
}

describe('VariableEditor', () => {
  it('creates a categorical variable and returns its stable record id', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const onComplete = vi.fn();

    render(
      <VariableEditor
        {...createProps({
          initialDraft: { name: '', type: 'categorical', options: [] },
          onSubmitDocument,
          onComplete,
        })}
      />,
    );

    const name = screen.getByRole('textbox', { name: /attribute name/i });
    expect(name).toHaveFocus();
    await user.type(name, 'preference');
    await user.click(screen.getByRole('button', { name: 'Add option' }));
    await user.click(screen.getByRole('button', { name: 'Add option' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Option 1 label' }),
      'Yes',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Option 1 value' }),
      'yes',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Option 2 label' }),
      'No',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Option 2 value' }),
      'no',
    );
    await user.click(screen.getByRole('button', { name: 'Create attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    expect(submittedVariables(onSubmitDocument)['new-variable']).toEqual({
      name: 'preference',
      type: 'categorical',
      options: [
        { label: 'Yes', value: 'yes' },
        { label: 'No', value: 'no' },
      ],
    });
    // The name as well as the id: a caller that can no longer use what was
    // created has to be able to say which attribute it was, and the id is a
    // record key the researcher has never seen.
    expect(onComplete).toHaveBeenCalledWith('new-variable', 'preference');
  });

  it('preserves host-supplied properties when creating a new variable', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();

    render(
      <VariableEditor
        {...createProps({
          initialDraft: {
            name: 'comment',
            type: 'text',
            component: 'TextArea',
            validation: { required: true, minLength: 2 },
          },
          onSubmitDocument,
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Create attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    expect(submittedVariables(onSubmitDocument)['new-variable']).toEqual({
      name: 'comment',
      type: 'text',
      component: 'TextArea',
      validation: { required: true, minLength: 2 },
    });
  });

  it('updates an existing variable without losing its options', async () => {
    const user = userEvent.setup();
    const existing = {
      name: 'preference',
      type: 'categorical',
      options: [
        { label: 'Low', value: 1 },
        { label: 'High', value: 2 },
      ],
    } as const;
    const authoritativeDocument = personDocument({ preference: existing });
    const onSubmitDocument = submitting();

    render(
      <VariableEditor
        openId="edit-1"
        mode="update"
        subject={SUBJECT}
        authoritativeDocument={authoritativeDocument}
        variableId="preference"
        initialDraft={existing}
        onSubmitDocument={onSubmitDocument}
        onComplete={() => undefined}
      />,
    );

    const name = screen.getByRole('textbox', { name: /attribute name/i });
    await user.clear(name);
    await user.type(name, 'ranking');
    await user.selectOptions(
      screen.getByRole('combobox', { name: /attribute type/i }),
      'ordinal',
    );
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    expect(submittedVariables(onSubmitDocument).preference).toEqual({
      name: 'ranking',
      type: 'ordinal',
      options: existing.options,
    });
  });

  it('disables and guards an unchanged update whose seed omits unowned fields', () => {
    const existing = {
      name: 'comment',
      type: 'text',
      component: 'TextArea',
      validation: { required: true, minLength: 2 },
    } as const;
    const partialSeed = { name: existing.name, type: existing.type } as const;
    const onSubmitDocument = submitting();
    const { container } = render(
      <VariableEditor
        openId="edit-unchanged"
        mode="update"
        subject={SUBJECT}
        authoritativeDocument={personDocument({ comment: existing })}
        variableId="comment"
        initialDraft={partialSeed}
        onSubmitDocument={onSubmitDocument}
        onComplete={() => undefined}
      />,
    );

    const form = container.querySelector('form');
    if (form === null) throw new Error('expected variable editor form');
    fireEvent.submit(form);

    expect(onSubmitDocument).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Save attribute' }),
    ).toBeDisabled();
  });

  it('migrates compatible validation and clears incompatible metadata on a type change', async () => {
    const user = userEvent.setup();
    const existing = {
      name: 'birthday',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'year', min: '1900' },
      validation: { required: true, lessThanVariable: 'retirement' },
    } as const;
    const onSubmitDocument = submitting();

    render(
      <VariableEditor
        openId="edit-type-change"
        mode="update"
        subject={SUBJECT}
        authoritativeDocument={personDocument({ birthday: existing })}
        variableId="birthday"
        initialDraft={existing}
        onSubmitDocument={onSubmitDocument}
        onComplete={() => undefined}
      />,
    );

    await user.selectOptions(
      screen.getByRole('combobox', { name: /attribute type/i }),
      'text',
    );
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    expect(submittedVariables(onSubmitDocument).birthday).toEqual({
      name: 'birthday',
      type: 'text',
      validation: { required: true },
    });
  });

  it('clears text-only encryption when changing to a non-text type', async () => {
    const user = userEvent.setup();
    const existing = {
      name: 'secret',
      type: 'text',
      encrypted: true,
      component: 'TextArea',
      validation: { required: true, minLength: 3 },
    } as const;
    const onSubmitDocument = submitting();

    render(
      <VariableEditor
        openId="edit-encrypted-type-change"
        mode="update"
        subject={SUBJECT}
        authoritativeDocument={personDocument({ secret: existing })}
        variableId="secret"
        initialDraft={existing}
        onSubmitDocument={onSubmitDocument}
        onComplete={() => undefined}
      />,
    );

    await user.selectOptions(
      screen.getByRole('combobox', { name: /attribute type/i }),
      'number',
    );
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    expect(submittedVariables(onSubmitDocument).secret).toEqual({
      name: 'secret',
      type: 'number',
      validation: { required: true },
    });
  });

  it('applies owned fields onto the latest authoritative variable without clobbering remote properties', async () => {
    const user = userEvent.setup();
    const initialVariable = {
      name: 'comment',
      type: 'text',
      component: 'Text',
      validation: { required: true },
    } as const;
    const remoteVariable = {
      ...initialVariable,
      component: 'TextArea',
      validation: { required: true, minLength: 2 },
    } as const;
    const onSubmitDocument = submitting();
    const onComplete = vi.fn();
    const common = {
      openId: 'edit-live-remote',
      mode: 'update' as const,
      subject: SUBJECT,
      variableId: 'comment',
      onSubmitDocument,
      onComplete,
    };
    const { rerender } = render(
      <VariableEditor
        {...common}
        authoritativeDocument={personDocument({ comment: initialVariable })}
        initialDraft={initialVariable}
      />,
    );

    const name = screen.getByRole('textbox', { name: /attribute name/i });
    await user.clear(name);
    await user.type(name, 'localComment');
    const remoteDocument = personDocument({ comment: remoteVariable });
    rerender(
      <VariableEditor
        {...common}
        authoritativeDocument={remoteDocument}
        initialDraft={initialVariable}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    expect(submittedVariables(onSubmitDocument).comment).toEqual({
      name: 'localComment',
      type: 'text',
      component: 'TextArea',
      validation: { required: true, minLength: 2 },
    });
    // The whole section, so a variable the researcher never opened travels
    // with it rather than being dropped by a save that only named one.
    expect(onSubmitDocument.mock.calls[0]?.[0]).toMatchObject({
      name: remoteDocument.name,
    });
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('shows and persists interface-owned options without editable controls', async () => {
    const user = userEvent.setup();
    const lockedOptions = [
      { label: 'Woman', value: 'woman' },
      { label: 'Man', value: 'man' },
    ] as const;
    const onSubmitDocument = submitting();

    render(
      <VariableEditor
        {...createProps({
          initialDraft: { name: 'sex', type: 'categorical' },
          lockedOptions,
          onSubmitDocument,
        })}
      />,
    );

    expect(
      screen.getByRole('table', {
        name: /managed by the interface and cannot be changed/i,
      }),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Add option' })).toBeNull();
    expect(
      screen.getByRole('combobox', { name: /attribute type/i }),
    ).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Create attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    expect(submittedVariables(onSubmitDocument)['new-variable']).toEqual({
      name: 'sex',
      type: 'categorical',
      options: lockedOptions,
      readOnly: true,
    });
  });

  it('exposes a fully read-only surface without live-looking actions', () => {
    render(
      <VariableEditor
        {...createProps({
          initialDraft: {
            name: 'preference',
            type: 'categorical',
            options: [
              { label: 'Yes', value: 'yes' },
              { label: 'No', value: 'no' },
            ],
          },
          readOnly: true,
        })}
      />,
    );

    expect(
      screen.getByRole('textbox', { name: /attribute name/i }),
    ).toHaveAttribute('readonly');
    expect(
      screen.getByRole('combobox', { name: /attribute type/i }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add option' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Create attribute' }),
    ).toBeDisabled();
  });

  it('keeps a null options draft open when local validation rejects it', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const onComplete = vi.fn();

    render(
      <VariableEditor
        {...createProps({
          initialDraft: {
            name: 'choice',
            type: 'categorical',
            options: null,
          },
          onSubmitDocument,
          onComplete,
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Create attribute' }));

    const alert = await screen.findByRole('alert');
    // The draft never left the editor, so the alert says what happened rather
    // than repeating the schema's account of which path was wrong.
    expect(alert).toHaveTextContent(REFUSED.threw);
    expect(alert).not.toHaveTextContent('the variable draft is invalid');
    expect(alert).toHaveFocus();
    expect(
      screen.getByRole('textbox', { name: /attribute name/i }),
    ).toHaveValue('choice');
    expect(onSubmitDocument).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  /**
   * The name that collided, said where the researcher can change it.
   *
   * `DuplicateVariableNameError` crosses a string-only contract as an
   * `Error.message`, which is why `editing.ts` encodes it with
   * `createMessageError` rather than writing a sentence — the promise being
   * that it is decoded where it is rendered. A reading that answered every
   * throw with the generic "wait a moment and try again" would send the
   * researcher to retry a save that cannot succeed until they rename the
   * attribute, and would never tell them which name they collided with.
   */
  it('names the attribute a duplicate name collides with, and says so at the field', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();

    render(
      <VariableEditor
        {...createProps({
          authoritativeDocument: personDocument({
            age: { name: 'Age', type: 'number' },
          }),
          initialDraft: { name: 'Age', type: 'text' },
          onSubmitDocument,
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Create attribute' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(DUPLICATE_NAME);
    expect(alert).not.toHaveTextContent(REFUSED.threw);
    // And again under the field holding the name that has to change, because
    // the alert is at the top of a form the researcher has to scroll.
    expect(screen.getByTestId('variable-name-field-error')).toHaveTextContent(
      DUPLICATE_NAME,
    );
    expect(onSubmitDocument).not.toHaveBeenCalled();
  });

  /**
   * A write that threw still has to read as a refusal.
   *
   * `useCodebookSectionWrite` promises to ANSWER, but a host is external code
   * and a call site is free to hand this editor a promise that rejects. A
   * rejection escaping the submit handler would lose the whole editor and the
   * unsaved draft it was holding rather than telling the researcher the save
   * was refused.
   */
  it('refuses rather than throwing when the write rejects', async () => {
    const user = userEvent.setup();

    render(
      <VariableEditor
        {...createProps({
          initialDraft: { name: 'quota', type: 'text' },
          onSubmitDocument: () => Promise.reject(new Error(HOST_WORDS)),
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Create attribute' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(REFUSED.threw);
    expect(alert).not.toHaveTextContent(HOST_WORDS);
    expect(
      screen.getByRole('textbox', { name: /attribute name/i }),
    ).toHaveValue('quota');
  });

  /**
   * The rule the researcher has to change, named.
   *
   * Removing an option can leave a committed validation rule unsatisfiable —
   * "answer at least three" with two options left to choose from. The codebook
   * schema refuses that, and the sentence it refuses it with names the rule and
   * both numbers. Reported as a thrown failure it would be replaced by the
   * "wait a moment and try again" copy written for a save that did not reach
   * the host, which is about a transport this draft never entered and asks for
   * a retry that cannot succeed.
   */
  it('names the validation rule an option removal would break', async () => {
    const user = userEvent.setup();
    const existing = {
      name: 'preference',
      type: 'categorical',
      options: [
        { label: 'Low', value: 'low' },
        { label: 'Middle', value: 'middle' },
        { label: 'High', value: 'high' },
      ],
      validation: { minSelected: 3 },
    } as const;
    const onSubmitDocument = submitting();

    render(
      <VariableEditor
        openId="edit-contradiction"
        mode="update"
        subject={SUBJECT}
        authoritativeDocument={personDocument({ preference: existing })}
        variableId="preference"
        initialDraft={existing}
        onSubmitDocument={onSubmitDocument}
        onComplete={() => undefined}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Remove option 3' }));
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(OPTION_COUNT_CONTRADICTION);
    expect(alert).not.toHaveTextContent(REFUSED.threw);
    expect(alert).toHaveFocus();
    // The draft never left the editor, and the researcher can still fix it.
    expect(onSubmitDocument).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Save attribute' }),
    ).toBeEnabled();
  });

  /**
   * A refusal already written for the researcher, shown in the words it
   * arrived in.
   *
   * A contradiction — an attribute whose committed rules could not be
   * satisfied by the options it is being left with — names the rule and the
   * values that cannot both hold, which is more than the package's copy for a
   * save that did not happen could say about it. Replacing it would tell the
   * researcher to wait and try a save that cannot succeed until they change
   * something.
   */
  it('reports a refusal the write wrote for the researcher', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();

    render(
      <VariableEditor
        {...createProps({
          initialDraft: { name: '', type: 'text' },
          onSubmitDocument: async () => ({
            status: 'refused',
            message: CONTRADICTION,
            held: false,
          }),
          onComplete,
        })}
      />,
    );

    const name = screen.getByRole('textbox', { name: /attribute name/i });
    await user.type(name, 'preserved');
    await user.click(screen.getByRole('button', { name: 'Create attribute' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(CONTRADICTION);
    expect(alert).not.toHaveTextContent(REFUSED.threw);
    // Refused either way: the draft stays put and the editor stays open.
    expect(name).toHaveValue('preserved');
    expect(onComplete).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Create attribute' }),
    ).toBeEnabled();
  });

  it('preserves the draft after a refused save', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting({
      status: 'refused',
      message: codebookRefusalMessage({
        kind: 'held',
        holder: {
          sessionId: 'tab-other',
          userId: 'user-other',
          displayName: 'Another researcher',
          sectionId: PERSON_SECTION,
          mode: 'editing',
        },
      }),
      held: true,
    });

    render(
      <VariableEditor
        {...createProps({
          initialDraft: { name: '', type: 'text' },
          onSubmitDocument,
        })}
      />,
    );

    const name = screen.getByRole('textbox', { name: /attribute name/i });
    await user.type(name, 'preserved');
    await user.click(screen.getByRole('button', { name: 'Create attribute' }));

    // A notice rather than an alert: a section somebody else is holding is not
    // a fault, and the change lands once they are finished.
    const report = await screen.findByRole('status');
    expect(report).toHaveTextContent(REFUSED.heldBy('Another researcher'));
    // Never the host's own words, never an internal section address, and never
    // the envelope the refusal travelled in: a researcher is told what happened
    // to their change, not where.
    expect(report).not.toHaveTextContent(HOST_WORDS);
    expect(report).not.toHaveTextContent(PERSON_SECTION);
    expect(report).not.toHaveTextContent('@codaco/app-i18n/error/v1');
    expect(name).toHaveValue('preserved');
    expect(report).toHaveFocus();
    expect(
      screen.getByRole('button', { name: 'Create attribute' }),
    ).toBeEnabled();
  });

  it('starts a fresh draft when a rapid reopen changes openId', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <VariableEditor
        {...createProps({
          openId: 'first-open',
          initialDraft: {
            name: 'first',
            type: 'categorical',
            options: [
              { label: 'Old one', value: 'old-1' },
              { label: 'Old two', value: 'old-2' },
            ],
          },
        })}
      />,
    );
    const name = screen.getByRole('textbox', { name: /attribute name/i });
    await user.clear(name);
    await user.type(name, 'parked value');

    rerender(
      <VariableEditor
        {...createProps({
          openId: 'second-open',
          variableId: 'second-variable',
          initialDraft: { name: 'fresh', type: 'boolean' },
        })}
      />,
    );

    expect(
      screen.getByRole('textbox', { name: /attribute name/i }),
    ).toHaveValue('fresh');
    expect(
      screen.getByRole('combobox', { name: /attribute type/i }),
    ).toHaveValue('boolean');
    expect(screen.queryByText('parked value')).toBeNull();
    expect(screen.queryByText('Old one')).toBeNull();
    expect(screen.queryByRole('group', { name: /allowed values/i })).toBeNull();
  });
});

/**
 * The settings an input control takes, which are the researcher's to author.
 *
 * A date field with no bounds asks the participant for any date in history; a
 * scale with no end labels is a line with nothing at either end of it. Both
 * belong to the codebook variable rather than to the field that renders it —
 * one attribute is collected the same way wherever it is asked for — and until
 * now nothing in this package could write them at all: `parameters` was
 * preserved through every save and rendered by nothing.
 */
describe('the settings the chosen input control takes', () => {
  const parameterProps = (
    variable: Readonly<Record<string, unknown>>,
    onSubmitDocument: VariableEditorProps['onSubmitDocument'],
  ): Extract<VariableEditorProps, { mode: 'update' }> => ({
    openId: 'parameters-open',
    mode: 'update',
    subject: SUBJECT,
    authoritativeDocument: personDocument({ subject: variable }),
    variableId: 'subject',
    initialDraft: variable,
    onSubmitDocument,
    onComplete: () => undefined,
  });

  const savedVariable = (
    onSubmitDocument: ReturnType<typeof vi.fn<SubmitDocument>>,
  ): Record<string, unknown> => {
    const variable = submittedVariables(onSubmitDocument).subject;
    if (!isRecord(variable)) throw new Error('the attribute was not submitted');
    return variable;
  };

  it('saves the resolution and the bounds a date attribute accepts', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const variable = { name: 'met', type: 'datetime', component: 'DatePicker' };
    render(<VariableEditor {...parameterProps(variable, onSubmitDocument)} />);

    // The resolution the interview assumes when the protocol declares none, so
    // the control opens showing what will happen rather than showing nothing.
    expect(
      screen.getByRole('combobox', { name: 'Date resolution' }),
    ).toHaveValue('full');
    fireEvent.change(screen.getByLabelText('Earliest date'), {
      target: { value: '2020-01-01' },
    });
    fireEvent.change(screen.getByLabelText('Latest date'), {
      target: { value: '2024-12-31' },
    });
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    expect(savedVariable(onSubmitDocument)).toEqual({
      name: 'met',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'full', min: '2020-01-01', max: '2024-12-31' },
    });
  });

  /**
   * A coarse bound is WRITTEN, past whatever years an interview would offer.
   *
   * The window a `DatePicker` shows a participant by default is 1920 to today.
   * Those are answers; these are the edges of the list the answers come from,
   * and a researcher who can only pick from the default list cannot author an
   * earliest year of 1900 or a latest of 2030 at all.
   */
  it('takes years a date bound can be authored at, past the window the interview offers by default', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const variable = {
      name: 'met',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'year' },
    };
    render(<VariableEditor {...parameterProps(variable, onSubmitDocument)} />);

    await user.type(screen.getByLabelText('Earliest date'), '1900');
    await user.type(screen.getByLabelText('Latest date'), '2030');
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    expect(savedVariable(onSubmitDocument).parameters).toEqual({
      type: 'year',
      min: '1900',
      max: '2030',
    });
  });

  /**
   * A bound the protocol already holds is on screen, whatever year it names.
   *
   * `datePickerParametersSchema` takes any four-digit year of 1000 or later at
   * the coarse resolutions, so a protocol written elsewhere can arrive holding
   * a latest year of 4500 — a study horizon, or a placeholder somebody used
   * for "no end". Offered as a closed list of years, that bound could only be
   * one the list happened to include: a native select shows its placeholder
   * when its value matches no option, so the field read as empty while the
   * protocol still carried the year, and every save wrote it back unseen.
   *
   * Both halves of that are pinned here — that it is shown, and that a save
   * touching only the name leaves it exactly as it was.
   */
  it('shows a year bound past any list of years, and keeps it through a rename', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const committed = {
      name: 'met',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'year', min: '1900', max: '4500' },
    };
    render(<VariableEditor {...parameterProps(committed, onSubmitDocument)} />);

    expect(screen.getByLabelText('Latest date')).toHaveValue('4500');

    const name = screen.getByRole('textbox', { name: /attribute name/i });
    await user.clear(name);
    await user.type(name, 'firstMet');
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    expect(savedVariable(onSubmitDocument)).toEqual({
      name: 'firstMet',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'year', min: '1900', max: '4500' },
    });
  });

  /**
   * And it can be written over, which is the half a visible-but-frozen field
   * would still have failed: the year is a field the researcher types into,
   * so correcting 4500 is the same gesture as writing it in the first place.
   */
  it('rewrites a year bound past any list of years', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const committed = {
      name: 'met',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'year', max: '4500' },
    };
    render(<VariableEditor {...parameterProps(committed, onSubmitDocument)} />);

    const latest = screen.getByLabelText('Latest date');
    await user.clear(latest);
    await user.type(latest, '9999');
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    expect(savedVariable(onSubmitDocument).parameters).toEqual({
      type: 'year',
      max: '9999',
    });
  });

  /**
   * The month half stays a list, because there are twelve of them and they are
   * named rather than numbered — and the year beside it is still written.
   */
  it('writes the year and picks the month of a bound at month resolution', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const variable = {
      name: 'met',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'month' },
    };
    render(<VariableEditor {...parameterProps(variable, onSubmitDocument)} />);

    await user.type(
      screen.getByRole('textbox', { name: 'Earliest date Year' }),
      '4500',
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Earliest date Month' }),
      '06',
    );
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    expect(savedVariable(onSubmitDocument).parameters).toEqual({
      type: 'month',
      min: '4500-06',
    });
  });

  it('saves the window a relative date attribute offers around its anchor', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const variable = {
      name: 'met',
      type: 'datetime',
      component: 'RelativeDatePicker',
    };
    render(<VariableEditor {...parameterProps(variable, onSubmitDocument)} />);

    await user.type(screen.getByLabelText('Days before'), '30');
    await user.type(screen.getByLabelText('Days after'), '7');
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    // Numbers, not the strings a number input reports: the schema takes
    // integers, and `"30"` would be refused after the dialog had closed.
    expect(savedVariable(onSubmitDocument).parameters).toEqual({
      before: 30,
      after: 7,
    });
  });

  /**
   * A day count that is not a whole number is a refusal, not a clearing.
   *
   * `1.5` is what a researcher reaches by pasting, or by writing a duration
   * the way a duration is written. Dropped on the way into the draft it became
   * an absent setting — a perfectly valid thing for this control to hold — so
   * nothing refused it, the save went through, and the window the attribute
   * HAD went with it: the interview fell back to its own default, and the
   * researcher was told nothing.
   */
  it('refuses a day count that is not whole rather than clearing the window', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const committed = {
      name: 'met',
      type: 'datetime',
      component: 'RelativeDatePicker',
      parameters: { before: 30 },
    };
    render(<VariableEditor {...parameterProps(committed, onSubmitDocument)} />);

    const before = screen.getByLabelText('Days before');
    // The whole value at once, which is what a paste delivers: a number input
    // cannot be driven to a fraction a keystroke at a time, because the
    // half-typed `1.` is not a number and the field reports it as empty.
    fireEvent.change(before, { target: { value: '1.5' } });

    // Still there to be corrected, rather than emptied by the field itself.
    expect(before).toHaveValue(1.5);
    expect(
      await screen.findByText('Write a whole number of days, zero or more.'),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    // And nothing was submitted, so the window the codebook holds is still
    // the one the interview will use — which is the whole difference between
    // a refusal and a silent clearing.
    expect(onSubmitDocument).not.toHaveBeenCalled();
  });

  it('saves a day count corrected after that refusal', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const committed = {
      name: 'met',
      type: 'datetime',
      component: 'RelativeDatePicker',
      parameters: { before: 30 },
    };
    render(<VariableEditor {...parameterProps(committed, onSubmitDocument)} />);

    const before = screen.getByLabelText('Days before');
    fireEvent.change(before, { target: { value: '1.5' } });
    await screen.findByText('Write a whole number of days, zero or more.');

    await user.clear(before);
    await user.type(before, '2');
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    // A number, not the text the field reported: the draft carries the text
    // only while it holds something the schema would refuse.
    expect(savedVariable(onSubmitDocument).parameters).toEqual({ before: 2 });
  });

  it('saves the labels a scale shows at each end', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const variable = {
      name: 'closeness',
      type: 'scalar',
      component: 'VisualAnalogScale',
    };
    render(<VariableEditor {...parameterProps(variable, onSubmitDocument)} />);

    await user.type(
      screen.getByRole('textbox', { name: 'Minimum label' }),
      'Not at all close',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Maximum label' }),
      'Extremely close',
    );
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    expect(savedVariable(onSubmitDocument).parameters).toEqual({
      minLabel: 'Not at all close',
      maxLabel: 'Extremely close',
    });
  });

  /**
   * A label of nothing but spaces is the case the control's own `required`
   * calls answered and a participant would not: the scale is shown with an
   * empty end, and nothing is read out at it.
   */
  it('refuses a scale whose ends are named with nothing but spaces', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const variable = {
      name: 'closeness',
      type: 'scalar',
      component: 'VisualAnalogScale',
    };
    render(<VariableEditor {...parameterProps(variable, onSubmitDocument)} />);

    await user.type(
      screen.getByRole('textbox', { name: 'Minimum label' }),
      'Not at all close',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Maximum label' }),
      '   ',
    );
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    expect(
      await screen.findByText('Write what the high end of the scale means.'),
    ).toBeVisible();
    expect(onSubmitDocument).not.toHaveBeenCalled();
  });

  /**
   * The schema's own refusal, reached before a document is built.
   *
   * The document builder catches this too, but by throwing — which is reported
   * as a generic "attribute not saved" alert telling the researcher to wait a
   * moment and try again. Nothing about a reversed range gets better by
   * waiting. So the same schema runs here first, and the only thing said is
   * the thing they can act on.
   */
  it('refuses a date range that ends before it starts, against the date that ends it', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const variable = { name: 'met', type: 'datetime', component: 'DatePicker' };
    render(<VariableEditor {...parameterProps(variable, onSubmitDocument)} />);

    fireEvent.change(screen.getByLabelText('Earliest date'), {
      target: { value: '2024-01-01' },
    });
    fireEvent.change(screen.getByLabelText('Latest date'), {
      target: { value: '2020-01-01' },
    });
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    expect(
      await screen.findByText(
        'The latest date cannot be earlier than the earliest date.',
      ),
    ).toBeVisible();
    // In this package's own words, not the protocol schema's. Zod's sentence
    // names a control and two keys — neither of which is on screen — and is
    // hard-coded English, so a Spanish researcher would read it as it stands.
    expect(
      screen.queryByText('DatePicker "min" must not be after "max"'),
    ).toBeNull();
    expect(onSubmitDocument).not.toHaveBeenCalled();
    expect(screen.queryByText('Attribute not saved')).toBeNull();
  });

  /**
   * A refusal that belongs to no one control still has somewhere to be read,
   * and the fieldset says where.
   *
   * The authored refusals above cover what this editor knows to ask about; the
   * protocol's own parameter schema is asked afterwards, and anything it still
   * refuses — a year the interview's own date control could never select, say
   * — is reported against the block rather than in the schema's words. A
   * screen reader landing on the controls hears it only if the fieldset points
   * at it, which is what the options fieldset thirty lines above already does.
   */
  it('associates a refusal about the whole settings block with the fieldset', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();

    render(
      <VariableEditor
        {...createProps({
          variableId: 'met',
          initialDraft: {
            name: 'met',
            type: 'datetime',
            component: 'DatePicker',
            // A real month at a resolution the interview renders unpadded, so
            // the schema refuses it and the editor's own checks do not.
            parameters: { type: 'month', min: '0099-01' },
          },
          onSubmitDocument,
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Create attribute' }));

    const fieldset = await screen.findByRole('group', {
      name: 'What this control accepts',
    });
    expect(fieldset).toHaveAttribute('aria-invalid', 'true');
    const describedBy = fieldset.getAttribute('aria-describedby') ?? '';
    const described = document.getElementById(describedBy);
    expect(described).not.toBeNull();
    expect(described).toHaveTextContent(
      'These settings cannot be saved as they are written.',
    );
    // Never the schema's own account of the path it refused.
    expect(fieldset).not.toHaveTextContent('DatePicker "min"');
    expect(onSubmitDocument).not.toHaveBeenCalled();
  });

  /**
   * A control change makes the old control's settings meaningless rather than
   * portable — the schema splits datetime into two strict variable schemas
   * keyed on `component`, so a `min` written beside `RelativeDatePicker` is a
   * variable it refuses outright.
   *
   * The host opens this editor on the control the researcher has just chosen,
   * which is not yet the one the codebook records. So the pair has to be
   * written together, and the settings of the control being left behind have
   * to go.
   */
  it('swaps the fields and drops the old settings when the control changes', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const committed = {
      name: 'met',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'full', min: '2020-01-01' },
    };
    render(
      <VariableEditor
        {...parameterProps(committed, onSubmitDocument)}
        initialDraft={{ ...committed, component: 'RelativeDatePicker' }}
      />,
    );

    expect(
      screen.queryByRole('combobox', { name: 'Date resolution' }),
    ).toBeNull();
    expect(screen.queryByLabelText('Earliest date')).toBeNull();
    await user.type(screen.getByLabelText('Days before'), '30');
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    expect(savedVariable(onSubmitDocument)).toEqual({
      name: 'met',
      type: 'datetime',
      component: 'RelativeDatePicker',
      parameters: { before: 30 },
    });
  });

  it('clears the bounds when the resolution they were chosen under changes', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const committed = {
      name: 'met',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'full', min: '2020-01-01', max: '2024-12-31' },
    };
    render(<VariableEditor {...parameterProps(committed, onSubmitDocument)} />);

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Date resolution' }),
      'year',
    );

    // A full date is not a year, and re-deriving one would quietly widen a
    // window the researcher chose. So they go — and are said to have gone.
    const notice = await screen.findByText(
      'The earliest and latest dates were cleared, because they were set at the previous resolution. Set them again if you still need them.',
    );
    expect(notice).toBeVisible();
    // Said ONCE. The region is mounted before the notice arrives, because a
    // screen reader only announces changes to a region it was already
    // watching — and a live region inside that one is the double (or, on some
    // assistive technology, dropped) announcement the wrapper exists to avoid.
    expect(liveRegionsAround(notice)).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    expect(savedVariable(onSubmitDocument).parameters).toEqual({
      type: 'year',
    });
  });

  /**
   * Clearing every setting is an answer: the attribute accepts whatever its
   * control accepts by default.
   *
   * The document builder lays the draft OVER the variable the codebook holds,
   * so a `parameters` key the draft no longer carries survives unless this
   * editor says it is replacing the block — and the researcher who emptied
   * the field would find the old window still there.
   */
  it('removes the settings block when every setting is cleared', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const committed = {
      name: 'met',
      type: 'datetime',
      component: 'RelativeDatePicker',
      parameters: { before: 30 },
    };
    render(<VariableEditor {...parameterProps(committed, onSubmitDocument)} />);

    await user.clear(screen.getByLabelText('Days before'));
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    const saved = savedVariable(onSubmitDocument);
    expect(Object.hasOwn(saved, 'parameters')).toBe(false);
    expect(saved).toEqual({
      name: 'met',
      type: 'datetime',
      component: 'RelativeDatePicker',
    });
  });

  it('creates an attribute together with the settings its control takes', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    render(
      <VariableEditor
        {...createProps({
          variableId: 'closeness',
          initialDraft: {
            name: '',
            type: 'scalar',
            component: 'VisualAnalogScale',
          },
          onSubmitDocument,
        })}
      />,
    );

    await user.type(
      screen.getByRole('textbox', { name: /attribute name/i }),
      'closeness',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Minimum label' }),
      'Not at all close',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Maximum label' }),
      'Extremely close',
    );
    await user.click(screen.getByRole('button', { name: 'Create attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    expect(submittedVariables(onSubmitDocument).closeness).toEqual({
      name: 'closeness',
      type: 'scalar',
      component: 'VisualAnalogScale',
      parameters: {
        minLabel: 'Not at all close',
        maxLabel: 'Extremely close',
      },
    });
  });

  it('leaves an attribute whose control takes no settings alone', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const variable = {
      name: 'comment',
      type: 'text',
      component: 'Text',
      validation: { required: true },
    };
    render(<VariableEditor {...parameterProps(variable, onSubmitDocument)} />);

    expect(screen.queryByText('What this control accepts')).toBeNull();
    const name = screen.getByRole('textbox', { name: /attribute name/i });
    await user.clear(name);
    await user.type(name, 'note');
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    // The control and the rules are still preserved rather than replaced: this
    // editor writes `component` only where it writes the settings that depend
    // on it.
    expect(savedVariable(onSubmitDocument)).toEqual({
      name: 'note',
      type: 'text',
      component: 'Text',
      validation: { required: true },
    });
  });
});

/**
 * The two answers a boolean puts in front of a participant.
 *
 * A boolean records true or false, and the `Boolean` control is the one that
 * makes the participant choose between them by name — so the words on those
 * two answers are the researcher's, and the schema holds them under `options`
 * in a shape of their own (`booleanOptionsSchema`: a label, the boolean it
 * records, and whether it is shown as the negative choice). Architect has
 * authored them since it had a form editor at all; until now this package's
 * options editor was reached by type alone, so a boolean's labels could not be
 * written here.
 *
 * The other control a boolean can be collected with, `Toggle`, is a switch
 * that is on or off: its variable schema is strict and has no `options` key at
 * all, so a pair written beside it is a variable the codebook refuses outright.
 */
describe('the two answers a boolean offers', () => {
  const booleanProps = (
    variable: Readonly<Record<string, unknown>>,
    onSubmitDocument: VariableEditorProps['onSubmitDocument'],
  ): Extract<VariableEditorProps, { mode: 'update' }> => ({
    openId: 'boolean-open',
    mode: 'update',
    subject: SUBJECT,
    authoritativeDocument: personDocument({ flagged: variable }),
    variableId: 'flagged',
    initialDraft: variable,
    onSubmitDocument,
    onComplete: () => undefined,
  });

  const savedVariable = (
    onSubmitDocument: ReturnType<typeof vi.fn<SubmitDocument>>,
  ): Record<string, unknown> => {
    const variable = submittedVariables(onSubmitDocument).flagged;
    if (!isRecord(variable)) throw new Error('the attribute was not submitted');
    return variable;
  };

  it('names the two answers a boolean choice shows, and marks one as negative', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const variable = { name: 'flagged', type: 'boolean', component: 'Boolean' };
    render(<VariableEditor {...booleanProps(variable, onSubmitDocument)} />);

    await user.type(
      screen.getByRole('textbox', { name: 'Label for “true”' }),
      'Yes, always',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Label for “false”' }),
      'No, never',
    );
    await user.click(
      screen.getByRole('switch', { name: 'Style “false” as negative' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    // The schema's own shape for a boolean's answers: the label is authored,
    // the value is the boolean it records, and `negative` is carried only
    // where it was switched on.
    expect(savedVariable(onSubmitDocument)).toEqual({
      name: 'flagged',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: 'Yes, always', value: true },
        { label: 'No, never', value: false, negative: true },
      ],
    });
  });

  it('keeps the answers of a boolean that holds more than two, through an edit that only renames it', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const committed = {
      name: 'flagged',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
        { label: 'Prefer not to say', value: false, negative: true },
      ],
    };
    render(<VariableEditor {...booleanProps(committed, onSubmitDocument)} />);

    const name = screen.getByRole('textbox', { name: /attribute name/i });
    await user.clear(name);
    await user.type(name, 'starred');
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    expect(savedVariable(onSubmitDocument)).toEqual({
      ...committed,
      name: 'starred',
    });
  });

  it('shows the answers of a boolean it cannot edit rather than two of them', () => {
    const committed = {
      name: 'flagged',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
        { label: 'Prefer not to say', value: false, negative: true },
      ],
    };
    render(<VariableEditor {...booleanProps(committed, vi.fn())} />);

    // The fieldset writes two answers. Shown as the pair, this attribute would
    // lose the third the moment it was saved.
    expect(
      screen.queryByRole('textbox', { name: 'Label for “true”' }),
    ).toBeNull();
    expect(
      screen.getByText(
        'A yes/no attribute is written here as two answers, and this one offers a different number of them. They are shown as they are, and saving leaves them unchanged.',
      ),
    ).toBeVisible();
    // All three, with the boolean each one records — which is what the
    // researcher needs to see, since it is what the participant meets.
    const answers = within(screen.getByRole('table'));
    expect(answers.getByRole('cell', { name: 'Yes' })).toBeVisible();
    expect(answers.getByRole('cell', { name: 'No' })).toBeVisible();
    expect(
      answers.getByRole('cell', { name: 'Prefer not to say' }),
    ).toBeVisible();
    expect(answers.getAllByRole('cell', { name: 'false' })).toHaveLength(2);
  });

  /**
   * The other end of the same rule. A single answer is valid — the schema
   * takes an `options` array exposing only one of the two booleans — and
   * showing it as the pair would put a second, blank answer beside it: one the
   * researcher never wrote, and one the pair's own rule then refuses to save
   * until they name it. An attribute they can no longer rename.
   */
  it('keeps a boolean that offers a single answer, and asks for no second one', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const committed = {
      name: 'flagged',
      type: 'boolean',
      component: 'Boolean',
      options: [{ label: 'Agreed', value: true }],
    };
    render(<VariableEditor {...booleanProps(committed, onSubmitDocument)} />);

    expect(
      screen.queryByRole('textbox', { name: 'Label for “false”' }),
    ).toBeNull();

    const name = screen.getByRole('textbox', { name: /attribute name/i });
    await user.clear(name);
    await user.type(name, 'starred');
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    expect(savedVariable(onSubmitDocument)).toEqual({
      ...committed,
      name: 'starred',
    });
  });

  /**
   * The same rule reached by the other route. A pair recording the SAME
   * boolean twice is one `booleanOptionsSchema` takes — it constrains neither
   * value against the other — and one this fieldset cannot show: its two
   * fields are keyed and labelled by the boolean each answer records, so a
   * pair recording one of them twice arrives as two answers it cannot tell
   * apart.
   *
   * Read as the pair, `true` and `false` were imposed on it to tell them
   * apart, and the save that followed wrote that back. An attribute renamed
   * and nothing else came out recording a boolean it had never recorded, and
   * every answer a participant had already given to its second button changed
   * what it meant.
   */
  it('keeps both stored booleans of a pair that records one of them twice, through an edit that only renames it', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const committed = {
      name: 'flagged',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: 'Agreed', value: true },
        { label: 'Agreed, with conditions', value: true },
      ],
    };
    render(<VariableEditor {...booleanProps(committed, onSubmitDocument)} />);

    const name = screen.getByRole('textbox', { name: /attribute name/i });
    await user.clear(name);
    await user.type(name, 'starred');
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    expect(savedVariable(onSubmitDocument)).toEqual({
      ...committed,
      name: 'starred',
    });
  });

  it('shows a pair that does not record both booleans as answers it holds', () => {
    const committed = {
      name: 'flagged',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: 'Agreed', value: true },
        { label: 'Agreed, with conditions', value: true },
      ],
    };
    render(<VariableEditor {...booleanProps(committed, vi.fn())} />);

    expect(
      screen.queryByRole('textbox', { name: 'Label for “true”' }),
    ).toBeNull();
    // Its own reason: this pair is two answers, so the count is not what puts
    // it here, and a researcher told it offers "a different number of them"
    // would be looking for an answer that is not on the screen.
    expect(
      screen.getByText(
        'A yes/no attribute is written here as two answers, one recording “true” and the other “false”. This one’s answers record something else, so they are shown as they are, and saving leaves them unchanged.',
      ),
    ).toBeVisible();
    const answers = within(screen.getByRole('table'));
    expect(answers.getByRole('cell', { name: 'Agreed' })).toBeVisible();
    expect(
      answers.getByRole('cell', { name: 'Agreed, with conditions' }),
    ).toBeVisible();
    // What the participant meets, which is the pair's whole problem: two
    // buttons recording the same thing.
    expect(answers.getAllByRole('cell', { name: 'true' })).toHaveLength(2);
  });

  /**
   * The other side of the same question: a pair that DOES record one of each
   * is the fieldset's own, and stays editable answer by answer.
   */
  it('writes an answer edited on a pair that records both booleans', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const committed = {
      name: 'flagged',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ],
    };
    render(<VariableEditor {...booleanProps(committed, onSubmitDocument)} />);

    const negative = screen.getByRole('textbox', {
      name: 'Label for “false”',
    });
    await user.clear(negative);
    await user.type(negative, 'Never');
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    expect(savedVariable(onSubmitDocument).options).toEqual([
      { label: 'Yes', value: true },
      { label: 'Never', value: false },
    ]);
  });

  it('offers no answers to name for a boolean collected with a toggle', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const variable = { name: 'flagged', type: 'boolean', component: 'Toggle' };
    render(<VariableEditor {...booleanProps(variable, onSubmitDocument)} />);

    expect(screen.queryByText('The two answers')).toBeNull();
    expect(
      screen.queryByRole('textbox', { name: 'Label for “true”' }),
    ).toBeNull();

    const name = screen.getByRole('textbox', { name: /attribute name/i });
    await user.clear(name);
    await user.type(name, 'starred');
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    expect(savedVariable(onSubmitDocument)).toEqual({
      name: 'starred',
      type: 'boolean',
      component: 'Toggle',
    });
  });

  /**
   * The host opens this editor on the control the researcher has just chosen,
   * which may not be the one the codebook still records — so a boolean whose
   * field has moved to a toggle arrives here with answers the control it is
   * moving to cannot show, and a variable carrying both is one the schema will
   * not take.
   */
  it('drops the answers and records the control that cannot show them', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const committed = {
      name: 'flagged',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false, negative: true },
      ],
    };
    render(
      <VariableEditor
        {...booleanProps(committed, onSubmitDocument)}
        initialDraft={{ ...committed, component: 'Toggle' }}
      />,
    );

    expect(
      screen.queryByRole('textbox', { name: 'Label for “true”' }),
    ).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    const saved = savedVariable(onSubmitDocument);
    expect(Object.hasOwn(saved, 'options')).toBe(false);
    // Both, or neither. The words the researcher wrote are removed because the
    // control they were written for is being left behind, so that control has
    // to be left behind in the same save — a variable still recording
    // `Boolean` with its two answers deleted is one the participant meets as
    // an unlabelled Yes/No question.
    expect(saved).toEqual({
      name: 'flagged',
      type: 'boolean',
      component: 'Toggle',
    });
  });

  /**
   * The control the answers were authored FOR is written with them.
   *
   * A field moved from a toggle to a choice reaches this editor naming the
   * control the row has just chosen, which the codebook does not record yet —
   * and a pair written beside the toggle the codebook still holds is a
   * variable the schema refuses outright, so the two have to land together.
   */
  it('writes the control the answers were authored for, not the one the codebook holds', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const committed = {
      name: 'flagged',
      type: 'boolean',
      component: 'Toggle',
    };
    render(
      <VariableEditor
        {...booleanProps(committed, onSubmitDocument)}
        initialDraft={{ ...committed, component: 'Boolean' }}
      />,
    );

    await user.type(
      screen.getByRole('textbox', { name: 'Label for “true”' }),
      'Yes',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Label for “false”' }),
      'No',
    );
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    expect(savedVariable(onSubmitDocument)).toEqual({
      name: 'flagged',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ],
    });
  });

  it('shows a spectator both answers without letting them be rewritten', () => {
    render(
      <VariableEditor
        {...booleanProps(
          {
            name: 'flagged',
            type: 'boolean',
            component: 'Boolean',
            options: [
              { label: 'Yes', value: true },
              { label: 'No', value: false },
            ],
          },
          async () => APPLIED,
        )}
        readOnly
      />,
    );

    expect(
      screen.getByRole('textbox', { name: 'Label for “false”' }),
    ).toHaveAttribute('readonly');
  });

  it('leaves a pair of answers nobody touched exactly as it was', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const committed = {
      name: 'flagged',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false, negative: true },
      ],
    };
    render(<VariableEditor {...booleanProps(committed, onSubmitDocument)} />);

    expect(
      screen.getByRole('textbox', { name: 'Label for “true”' }),
    ).toHaveValue('Yes');
    expect(
      screen.getByRole('switch', { name: 'Style “false” as negative' }),
    ).toBeChecked();
    // Nothing was changed, so there is nothing to save.
    expect(
      screen.getByRole('button', { name: 'Save attribute' }),
    ).toBeDisabled();

    const name = screen.getByRole('textbox', { name: /attribute name/i });
    await user.clear(name);
    await user.type(name, 'starred');
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    expect(savedVariable(onSubmitDocument).options).toEqual(committed.options);
  });

  /**
   * Which answer records which boolean is the protocol's, not this editor's.
   *
   * The schema constrains neither the order of the two answers nor which
   * boolean each carries, and answers already collected mean whatever the pair
   * said when they were given — so a protocol that stores the false answer
   * first keeps storing it first, and each field says which value it is
   * labelling rather than assuming.
   */
  it('keeps which answer records which value when a protocol stores false first', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const committed = {
      name: 'flagged',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: 'Never', value: false, negative: true },
        { label: 'Always', value: true },
      ],
    };
    render(<VariableEditor {...booleanProps(committed, onSubmitDocument)} />);

    expect(
      screen.getByRole('textbox', { name: 'Label for “false”' }),
    ).toHaveValue('Never');
    expect(
      screen.getByRole('textbox', { name: 'Label for “true”' }),
    ).toHaveValue('Always');

    const name = screen.getByRole('textbox', { name: /attribute name/i });
    await user.clear(name);
    await user.type(name, 'starred');
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    expect(savedVariable(onSubmitDocument).options).toEqual(committed.options);
  });

  /**
   * One answer named and the other blank is a control with a button nobody can
   * read — the case the schema accepts (`label` is any string) and a
   * participant cannot answer.
   */
  it('refuses a pair with only one of its answers named', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const variable = { name: 'flagged', type: 'boolean', component: 'Boolean' };
    render(<VariableEditor {...booleanProps(variable, onSubmitDocument)} />);

    await user.type(
      screen.getByRole('textbox', { name: 'Label for “true”' }),
      'Yes, always',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Label for “false”' }),
      '   ',
    );
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    expect(
      await screen.findByText(
        'Write what this answer says, or clear both to offer Yes and No.',
      ),
    ).toBeVisible();
    expect(onSubmitDocument).not.toHaveBeenCalled();
  });

  /**
   * Both answers named the same words is the same failure by the other route,
   * and the schema accepts it for the same reason: `booleanOptionsSchema.label`
   * is a bare `z.string()` and nothing downstream compares the two. Two buttons
   * a participant cannot tell apart is not an answerable question.
   */
  it('refuses a pair whose two answers say the same thing', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const committed = {
      name: 'agrees',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ],
    };
    render(<VariableEditor {...booleanProps(committed, onSubmitDocument)} />);

    const negative = screen.getByRole('textbox', { name: 'Label for “false”' });
    await user.clear(negative);
    // Trailing space and all: what is on the button is what was typed minus
    // the whitespace either side of it, so this IS the same button twice.
    await user.type(negative, 'Yes ');
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    expect(
      await screen.findByText(
        'Give this answer different words: two buttons saying the same thing cannot be told apart.',
      ),
    ).toBeVisible();
    expect(onSubmitDocument).not.toHaveBeenCalled();
  });

  /**
   * The control, and the reason the comparison is case-sensitive where a
   * categorical option's is not: these two labels are rendered exactly as they
   * were typed, so a participant CAN tell them apart. A categorical option's
   * value becomes a key, which is why that rule folds case.
   */
  it('takes two answers that differ only in case', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const committed = {
      name: 'agrees',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: 'YES', value: true },
        { label: 'No', value: false },
      ],
    };
    render(<VariableEditor {...booleanProps(committed, onSubmitDocument)} />);

    const negative = screen.getByRole('textbox', { name: 'Label for “false”' });
    await user.clear(negative);
    await user.type(negative, 'yes');
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    expect(savedVariable(onSubmitDocument).options).toEqual([
      { label: 'YES', value: true },
      { label: 'yes', value: false },
    ]);
  });

  /**
   * Clearing both answers is an answer of its own: the interview offers Yes
   * and No when the protocol names no options at all, and offers nothing at
   * all when it names an empty list — which is why the key goes rather than
   * being written empty.
   */
  it('takes the answers away again when both are cleared', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const committed = {
      name: 'flagged',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ],
    };
    render(<VariableEditor {...booleanProps(committed, onSubmitDocument)} />);

    await user.clear(screen.getByRole('textbox', { name: 'Label for “true”' }));
    await user.clear(
      screen.getByRole('textbox', { name: 'Label for “false”' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    const saved = savedVariable(onSubmitDocument);
    expect(Object.hasOwn(saved, 'options')).toBe(false);
    expect(saved).toEqual({
      name: 'flagged',
      type: 'boolean',
      component: 'Boolean',
    });
  });

  /**
   * A stored pair with nothing written on either answer is not the same
   * protocol as an attribute holding no `options` key at all. `BooleanField`
   * renders every entry it is given, and falls back to Yes and No only where
   * the key is absent — so the pair is two blank buttons and the absent key is
   * Yes and No, and which of the two a participant meets is the researcher's
   * to settle by clearing the fields. An edit that only renamed the attribute
   * never asked that question, so the pair is written back as it was found.
   */
  it('keeps a stored pair whose two answers are blank, through an edit that only renames it', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const committed = {
      name: 'flagged',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: '', value: true },
        // Whitespace and all: an answer nobody touched is written back as it
        // was authored, and trimming decides only whether it has been named.
        { label: ' ', value: false },
      ],
    };
    render(<VariableEditor {...booleanProps(committed, onSubmitDocument)} />);

    const name = screen.getByRole('textbox', { name: /attribute name/i });
    await user.clear(name);
    await user.type(name, 'starred');
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    expect(savedVariable(onSubmitDocument)).toEqual({
      ...committed,
      name: 'starred',
    });
  });

  /**
   * The other side of it: those two blank fields are still the editor for that
   * pair, and naming both of them writes what was named.
   */
  it('writes the answers a researcher names onto a stored pair that was blank', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    const committed = {
      name: 'flagged',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: '', value: true },
        { label: '', value: false },
      ],
    };
    render(<VariableEditor {...booleanProps(committed, onSubmitDocument)} />);

    await user.type(
      screen.getByRole('textbox', { name: 'Label for “true”' }),
      'Always',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Label for “false”' }),
      'Never',
    );
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    expect(savedVariable(onSubmitDocument).options).toEqual([
      { label: 'Always', value: true },
      { label: 'Never', value: false },
    ]);
  });

  it('creates a boolean together with the answers it offers', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    render(
      <VariableEditor
        {...createProps({
          variableId: 'flagged',
          initialDraft: { name: '', type: 'boolean', component: 'Boolean' },
          onSubmitDocument,
        })}
      />,
    );

    await user.type(
      screen.getByRole('textbox', { name: /attribute name/i }),
      'flagged',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Label for “true”' }),
      'Yes',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Label for “false”' }),
      'No',
    );
    await user.click(screen.getByRole('button', { name: 'Create attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    expect(submittedVariables(onSubmitDocument).flagged).toEqual({
      name: 'flagged',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ],
    });
  });

  /**
   * The same drop the update path makes, on the way in.
   *
   * A create draft reaches this editor from the row that authored it, so a
   * researcher who names two answers beside `Boolean` and then moves the
   * control to `Toggle` arrives here carrying a pair the toggle's strict
   * schema has no key for. The toggle renders no answer fields, so there is
   * nothing to clear them with — a draft that submitted them as authored
   * would be refused with no way out of the refusal, and the attribute could
   * never be created at all.
   */
  it('drops the answers a create draft carried to a toggle', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    render(
      <VariableEditor
        {...createProps({
          variableId: 'flagged',
          initialDraft: {
            name: 'flagged',
            type: 'boolean',
            component: 'Toggle',
            options: [
              { label: 'Yes', value: true },
              { label: 'No', value: false, negative: true },
            ],
          },
          onSubmitDocument,
        })}
      />,
    );

    expect(
      screen.queryByRole('textbox', { name: 'Label for “true”' }),
    ).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Create attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    const created = submittedVariables(onSubmitDocument).flagged;
    if (!isRecord(created)) throw new Error('the attribute was not submitted');
    expect(Object.hasOwn(created, 'options')).toBe(false);
    expect(created).toEqual({
      name: 'flagged',
      type: 'boolean',
      component: 'Toggle',
    });
  });

  /**
   * And only where the control cannot show them: a create draft that reaches
   * this editor already holding the pair `Boolean` renders keeps it, whether
   * or not the researcher touches the fields.
   */
  it('creates a boolean with the answers its draft already carried', async () => {
    const user = userEvent.setup();
    const onSubmitDocument = submitting();
    render(
      <VariableEditor
        {...createProps({
          variableId: 'flagged',
          initialDraft: {
            name: 'flagged',
            type: 'boolean',
            component: 'Boolean',
            options: [
              { label: 'Yes', value: true },
              { label: 'No', value: false, negative: true },
            ],
          },
          onSubmitDocument,
        })}
      />,
    );

    expect(
      screen.getByRole('textbox', { name: 'Label for “true”' }),
    ).toHaveValue('Yes');
    await user.click(screen.getByRole('button', { name: 'Create attribute' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
    expect(submittedVariables(onSubmitDocument).flagged).toEqual({
      name: 'flagged',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false, negative: true },
      ],
    });
  });
});

/**
 * Where the strong destructive ink is opted into, and where it must not be.
 *
 * `--destructive` is an ink AND a fill: a field's error text is drawn with it,
 * and so is the BACKGROUND of a destructive button, whose icon is drawn with
 * `--destructive-contrast`. The tinted option and answer rows redeclare
 * `--destructive` as the stronger mixture so an error on them stays legible —
 * and a redeclaration is inherited by everything below the element carrying
 * it. Put on the row's own surface it therefore repaints the remove button's
 * fill while leaving the icon on top of it where it was: 2.85:1 on the default
 * dark theme, where the untouched pair reaches 3.85:1 and the WCAG threshold
 * for a control is 3:1.
 *
 * Asserted on class placement rather than on colour because these are custom
 * properties resolved by a stylesheet jsdom does not load; what the component
 * decides, and all it decides, is which subtree inherits the override. The
 * measured ratios live in `Colors.stories.tsx`, which reads them in a browser.
 */
describe('the strong destructive ink a tinted row opts into', () => {
  const STRONG_INK = '[--destructive:var(--destructive-strong)]';
  /** What `Surface` puts on the element whose background it tints. */
  const TINTED_SURFACE = 'bg-surface-accent';

  const elementsClassed = (token: string): HTMLElement[] =>
    Array.from(document.querySelectorAll<HTMLElement>('*')).filter((element) =>
      element.classList.contains(token),
    );

  /**
   * The live region `FieldErrors` mounts for a field, error or no error — the
   * content the strong ink exists for.
   */
  const errorRegionOf = (fieldName: string): HTMLElement => {
    const region = document.querySelector<HTMLElement>(
      `[data-field-name="${fieldName}"] [aria-live]`,
    );
    if (region === null) {
      throw new Error(`no error region for the field "${fieldName}"`);
    }
    return region;
  };

  /**
   * The rule both rows follow: the override sits INSIDE the surface it tints,
   * on the field content, never on the surface itself.
   */
  const expectScopedToFieldContent = (fieldNames: readonly string[]) => {
    const owners = elementsClassed(STRONG_INK);
    expect(owners.length).toBeGreaterThan(0);
    const surfaces = elementsClassed(TINTED_SURFACE);
    expect(surfaces.length).toBeGreaterThan(0);
    for (const owner of owners) {
      expect(owner.classList.contains(TINTED_SURFACE)).toBe(false);
    }
    for (const fieldName of fieldNames) {
      const region = errorRegionOf(fieldName);
      expect(owners.some((owner) => owner.contains(region))).toBe(true);
    }
  };

  it('reaches every option field of a choice, and not the button that removes the option', () => {
    const existing = {
      name: 'preference',
      type: 'categorical',
      options: [
        { label: 'Low', value: 'low' },
        { label: 'High', value: 'high' },
      ],
    } as const;

    render(
      <VariableEditor
        openId="edit-strong-ink"
        mode="update"
        subject={SUBJECT}
        authoritativeDocument={personDocument({ preference: existing })}
        variableId="preference"
        initialDraft={existing}
        onSubmitDocument={async () => APPLIED}
        onComplete={() => undefined}
      />,
    );

    // Asserted before the placement rule below, so this test fails on the
    // harm itself rather than on the shape the fix happens to take.
    const removeButtons = screen.getAllByRole('button', {
      name: /^Remove option \d+$/,
    });
    expect(removeButtons).toHaveLength(2);
    for (const button of removeButtons) {
      expect(
        elementsClassed(STRONG_INK).some((owner) => owner.contains(button)),
      ).toBe(false);
    }

    expectScopedToFieldContent([
      'option-1-label',
      'option-1-value',
      'option-2-label',
      'option-2-value',
    ]);
  });

  it('reaches the answer fields of a boolean without being put on the row itself', () => {
    const variable = {
      name: 'flagged',
      type: 'boolean',
      component: 'Boolean',
    } as const;

    render(
      <VariableEditor
        openId="boolean-strong-ink"
        mode="update"
        subject={SUBJECT}
        authoritativeDocument={personDocument({ flagged: variable })}
        variableId="flagged"
        initialDraft={variable}
        onSubmitDocument={async () => APPLIED}
        onComplete={() => undefined}
      />,
    );

    expectScopedToFieldContent([
      'boolean-answer-true-label',
      'boolean-answer-false-label',
    ]);
  });
});
