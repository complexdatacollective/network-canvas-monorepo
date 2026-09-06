import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { contentHash, type SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import type { ProtocolBuilderProtocolContext } from '../../../protocol-context.ts';
import type {
  CompoundEditRequest,
  CompoundEditResult,
} from '../../../session.ts';
import type { AuxiliaryCodebookSubmitResult } from '../../editing.ts';
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
 * The package's own words for a refused save, from `compoundFailureCopy`.
 *
 * Written out here rather than imported: the point of the copy is that it is
 * NOT the message the host sent, and a test that read the same table as the
 * component would still pass if that table were replaced by a passthrough.
 */
const REFUSED = {
  'heldByNobodyNamed':
    'A section needed for this change is currently being edited.',
  'heldBy': (who: string) =>
    `${who} is currently editing a section needed for this change.`,
  'stale-epoch':
    'Editing access changed while this was being saved, so nothing was saved. Try again.',
  'lease-lost':
    'You are no longer the editor of this stage, so nothing was saved. Take over editing and try again.',
  'stale-base':
    'Someone else changed this while you were editing it, so nothing was saved. Close and reopen this editor to load their version, then make your change again.',
  'host-error':
    'The protocol would not be valid with this change, so nothing was saved.',
  'threw':
    'This change could not be saved, and nothing was altered. Wait a moment and try again.',
  'invalid-request':
    'This change could not be sent, and nothing was saved. Close this editor and try again.',
} as const;

/** What a host says. None of it reaches the researcher. */
const HOST_WORDS =
  'Expected object, received undefined at codebook.node.person';

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

const APPLIED: CompoundEditResult = {
  status: 'applied',
  update: {
    protocolSections: {},
    manifestRevision: { sequence: 2n, hash: 'revision-2' },
  },
};

const deferred = <Value,>() => {
  let resolvePromise: ((value: Value) => void) | undefined;
  const promise = new Promise<Value>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value: Value) {
      if (resolvePromise === undefined)
        throw new Error('deferred is not ready');
      resolvePromise(value);
    },
  };
};

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

function submittedVariables(
  request: CompoundEditRequest,
): Record<string, unknown> {
  const edit = request.edits[0];
  if (edit?.kind !== 'update') {
    throw new Error('expected a codebook section update');
  }
  const command = edit.commands.find(
    (candidate) => candidate.op === 'set' && candidate.key === 'variables',
  );
  if (command?.op !== 'set' || !isRecord(command.value)) {
    throw new Error('expected the variables command');
  }
  return command.value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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
    description: 'Create attribute',
    createRequestId: () => 'request-1',
    onSubmitRequest: () => APPLIED,
    onComplete: () => undefined,
    ...overrides,
  };
}

describe('VariableEditor', () => {
  it('creates a categorical variable and returns its stable record id', async () => {
    const user = userEvent.setup();
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );
    const onComplete = vi.fn();

    render(
      <VariableEditor
        {...createProps({
          initialDraft: { name: '', type: 'categorical', options: [] },
          onSubmitRequest,
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

    await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledTimes(1));
    const request = onSubmitRequest.mock.calls[0]?.[0];
    if (request === undefined) throw new Error('missing submitted request');
    expect(submittedVariables(request)['new-variable']).toEqual({
      name: 'preference',
      type: 'categorical',
      options: [
        { label: 'Yes', value: 'yes' },
        { label: 'No', value: 'no' },
      ],
    });
    expect(onComplete).toHaveBeenCalledWith('new-variable');
  });

  it('preserves host-supplied properties when creating a new variable', async () => {
    const user = userEvent.setup();
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );

    render(
      <VariableEditor
        {...createProps({
          initialDraft: {
            name: 'comment',
            type: 'text',
            component: 'TextArea',
            validation: { required: true, minLength: 2 },
          },
          onSubmitRequest,
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Create attribute' }));

    await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledTimes(1));
    const request = onSubmitRequest.mock.calls[0]?.[0];
    if (request === undefined) throw new Error('missing submitted request');
    expect(submittedVariables(request)['new-variable']).toEqual({
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
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );

    render(
      <VariableEditor
        openId="edit-1"
        mode="update"
        subject={SUBJECT}
        authoritativeDocument={authoritativeDocument}
        variableId="preference"
        initialDraft={existing}
        description="Update attribute"
        createRequestId={() => 'request-update'}
        onSubmitRequest={onSubmitRequest}
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

    await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledTimes(1));
    const request = onSubmitRequest.mock.calls[0]?.[0];
    if (request === undefined) throw new Error('missing submitted request');
    expect(submittedVariables(request).preference).toEqual({
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
    const createRequestId = vi.fn(() => 'request-unchanged');
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );
    const { container } = render(
      <VariableEditor
        openId="edit-unchanged"
        mode="update"
        subject={SUBJECT}
        authoritativeDocument={personDocument({ comment: existing })}
        variableId="comment"
        initialDraft={partialSeed}
        description="Update comment"
        createRequestId={createRequestId}
        onSubmitRequest={onSubmitRequest}
        onComplete={() => undefined}
      />,
    );

    const form = container.querySelector('form');
    if (form === null) throw new Error('expected variable editor form');
    fireEvent.submit(form);

    expect(createRequestId).not.toHaveBeenCalled();
    expect(onSubmitRequest).not.toHaveBeenCalled();
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
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );

    render(
      <VariableEditor
        openId="edit-type-change"
        mode="update"
        subject={SUBJECT}
        authoritativeDocument={personDocument({ birthday: existing })}
        variableId="birthday"
        initialDraft={existing}
        description="Update birthday"
        createRequestId={() => 'request-type-change'}
        onSubmitRequest={onSubmitRequest}
        onComplete={() => undefined}
      />,
    );

    await user.selectOptions(
      screen.getByRole('combobox', { name: /attribute type/i }),
      'text',
    );
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledTimes(1));
    const request = onSubmitRequest.mock.calls[0]?.[0];
    if (request === undefined) throw new Error('missing submitted request');
    expect(submittedVariables(request).birthday).toEqual({
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
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );

    render(
      <VariableEditor
        openId="edit-encrypted-type-change"
        mode="update"
        subject={SUBJECT}
        authoritativeDocument={personDocument({ secret: existing })}
        variableId="secret"
        initialDraft={existing}
        description="Update secret"
        createRequestId={() => 'request-encrypted-type-change'}
        onSubmitRequest={onSubmitRequest}
        onComplete={() => undefined}
      />,
    );

    await user.selectOptions(
      screen.getByRole('combobox', { name: /attribute type/i }),
      'number',
    );
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledTimes(1));
    const request = onSubmitRequest.mock.calls[0]?.[0];
    if (request === undefined) throw new Error('missing submitted request');
    expect(submittedVariables(request).secret).toEqual({
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
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );
    const onComplete = vi.fn();
    const common = {
      openId: 'edit-live-remote',
      mode: 'update' as const,
      subject: SUBJECT,
      variableId: 'comment',
      description: 'Update comment',
      createRequestId: () => 'request-live-remote',
      onSubmitRequest,
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
    expect(await screen.findByText('The codebook changed')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledTimes(1));
    const request = onSubmitRequest.mock.calls[0]?.[0];
    if (request === undefined) throw new Error('missing submitted request');
    expect(submittedVariables(request).comment).toEqual({
      name: 'localComment',
      type: 'text',
      component: 'TextArea',
      validation: { required: true, minLength: 2 },
    });
    expect(request.edits[0]).toMatchObject({
      expectedContentHash: contentHash(remoteDocument),
    });
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('does not complete an applied submit that settles with an authoritative conflict', async () => {
    const user = userEvent.setup();
    const initialVariable = {
      name: 'comment',
      type: 'text',
      component: 'Text',
    } as const;
    const pending = deferred<CompoundEditResult>();
    const onSubmitRequest = vi.fn(() => pending.promise);
    const onComplete = vi.fn();
    const common = {
      openId: 'edit-pending-authority',
      mode: 'update' as const,
      subject: SUBJECT,
      variableId: 'comment',
      initialDraft: initialVariable,
      description: 'Update comment',
      createRequestId: () => 'request-pending-authority',
      onSubmitRequest,
      onComplete,
    };
    const { rerender } = render(
      <VariableEditor
        {...common}
        authoritativeDocument={personDocument({ comment: initialVariable })}
      />,
    );

    const name = screen.getByRole('textbox', { name: /attribute name/i });
    await user.clear(name);
    await user.type(name, 'localComment');
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));
    expect(onSubmitRequest).toHaveBeenCalledOnce();

    const remoteVariable = { ...initialVariable, component: 'TextArea' };
    rerender(
      <VariableEditor
        {...common}
        authoritativeDocument={personDocument({ comment: remoteVariable })}
      />,
    );
    await act(async () => pending.resolve(APPLIED));

    expect(await screen.findByText('The codebook changed')).toBeVisible();
    expect(name).toHaveValue('localComment');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('uses a new intent id when authoritative data changes after a blocked submit', async () => {
    const user = userEvent.setup();
    const initialVariable = {
      name: 'comment',
      type: 'text',
      component: 'Text',
    } as const;
    const remoteVariable = {
      ...initialVariable,
      component: 'TextArea',
    } as const;
    const createRequestId = vi
      .fn<() => string>()
      .mockReturnValueOnce('blocked-variable-intent')
      .mockReturnValueOnce('rebased-variable-intent');
    const onSubmitRequest = vi
      .fn<(request: CompoundEditRequest) => CompoundEditResult>()
      .mockReturnValueOnce({
        status: 'blocked',
        blockedSections: [{ sectionId: PERSON_SECTION }],
      })
      .mockReturnValueOnce(APPLIED);
    const common = {
      openId: 'edit-rebased-request',
      mode: 'update' as const,
      subject: SUBJECT,
      variableId: 'comment',
      description: 'Update comment',
      createRequestId,
      onSubmitRequest,
      onComplete: () => undefined,
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
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));
    await screen.findByText(REFUSED.heldByNobodyNamed);

    const remoteDocument = personDocument({ comment: remoteVariable });
    rerender(
      <VariableEditor
        {...common}
        authoritativeDocument={remoteDocument}
        initialDraft={initialVariable}
      />,
    );
    expect(await screen.findByText('The codebook changed')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledTimes(2));
    expect(onSubmitRequest.mock.calls.map(([request]) => request.id)).toEqual([
      'blocked-variable-intent',
      'rebased-variable-intent',
    ]);
    expect(onSubmitRequest.mock.calls[1]?.[0].edits[0]).toMatchObject({
      expectedContentHash: contentHash(remoteDocument),
    });
  });

  it('preserves an uncertain retry id across a content-identical authority re-emission', async () => {
    const user = userEvent.setup();
    const initialVariable = {
      name: 'comment',
      type: 'text',
      component: 'Text',
    } as const;
    const initialDocument = personDocument({ comment: initialVariable });
    const createRequestId = vi
      .fn<() => string>()
      .mockReturnValueOnce('uncertain-variable-intent')
      .mockReturnValueOnce('duplicate-variable-intent');
    const onSubmitRequest = vi
      .fn<(request: CompoundEditRequest) => Promise<CompoundEditResult>>()
      .mockRejectedValueOnce(new Error('Connection dropped.'))
      .mockResolvedValueOnce(APPLIED);
    const commonProps = {
      openId: 'uncertain-variable-retry',
      mode: 'update' as const,
      subject: SUBJECT,
      variableId: 'comment',
      initialDraft: initialVariable,
      description: 'Update comment',
      createRequestId,
      onSubmitRequest,
      onComplete: () => undefined,
    };
    const { rerender } = render(
      <VariableEditor
        {...commonProps}
        authoritativeDocument={initialDocument}
      />,
    );

    const name = screen.getByRole('textbox', { name: /attribute name/i });
    await user.clear(name);
    await user.type(name, 'localComment');
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));
    await screen.findByText(REFUSED.threw);

    rerender(
      <VariableEditor
        {...commonProps}
        authoritativeDocument={structuredClone(initialDocument)}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledTimes(2));
    expect(onSubmitRequest.mock.calls.map(([request]) => request.id)).toEqual([
      'uncertain-variable-intent',
      'uncertain-variable-intent',
    ]);
    expect(createRequestId).toHaveBeenCalledOnce();
  });

  it('uses a new retry id when another variable changes the parent content base', async () => {
    const user = userEvent.setup();
    const initialVariable = {
      name: 'comment',
      type: 'text',
      component: 'Text',
    } as const;
    const initialDocument = personDocument({ comment: initialVariable });
    const createRequestId = vi
      .fn<() => string>()
      .mockReturnValueOnce('initial-parent-intent')
      .mockReturnValueOnce('changed-parent-intent');
    const onSubmitRequest = vi
      .fn<(request: CompoundEditRequest) => Promise<CompoundEditResult>>()
      .mockRejectedValueOnce(new Error('Connection dropped.'))
      .mockResolvedValueOnce(APPLIED);
    const commonProps = {
      openId: 'changed-parent-retry',
      mode: 'update' as const,
      subject: SUBJECT,
      variableId: 'comment',
      initialDraft: initialVariable,
      description: 'Update comment',
      createRequestId,
      onSubmitRequest,
      onComplete: () => undefined,
    };
    const { rerender } = render(
      <VariableEditor
        {...commonProps}
        authoritativeDocument={initialDocument}
      />,
    );

    const name = screen.getByRole('textbox', { name: /attribute name/i });
    await user.clear(name);
    await user.type(name, 'localComment');
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));
    await screen.findByText(REFUSED.threw);

    const changedParentDocument = personDocument({
      comment: initialVariable,
      weight: { name: 'Weight', type: 'number', component: 'Number' },
    });
    rerender(
      <VariableEditor
        {...commonProps}
        authoritativeDocument={changedParentDocument}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledTimes(2));
    expect(onSubmitRequest.mock.calls.map(([request]) => request.id)).toEqual([
      'initial-parent-intent',
      'changed-parent-intent',
    ]);
    expect(onSubmitRequest.mock.calls[1]?.[0].edits[0]).toMatchObject({
      expectedContentHash: contentHash(changedParentDocument),
    });
  });

  it('blocks a dirty draft when the authoritative variable type changes remotely', async () => {
    const user = userEvent.setup();
    const initialVariable = {
      name: 'comment',
      type: 'text',
      component: 'Text',
    } as const;
    const remoteVariable = {
      name: 'comment',
      type: 'number',
      component: 'NumberInput',
      validation: { minValue: 0 },
    } as const;
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );
    const common = {
      openId: 'edit-remote-type',
      mode: 'update' as const,
      subject: SUBJECT,
      variableId: 'comment',
      description: 'Update comment',
      createRequestId: () => 'request-remote-type',
      onSubmitRequest,
      onComplete: () => undefined,
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
    rerender(
      <VariableEditor
        {...common}
        authoritativeDocument={personDocument({ comment: remoteVariable })}
        initialDraft={initialVariable}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    expect(
      await screen.findByText(
        'The attribute type changed elsewhere. Close and reopen this editor before saving.',
      ),
    ).toBeVisible();
    expect(onSubmitRequest).not.toHaveBeenCalled();
  });

  it('shows and persists interface-owned options without editable controls', async () => {
    const user = userEvent.setup();
    const lockedOptions = [
      { label: 'Woman', value: 'woman' },
      { label: 'Man', value: 'man' },
    ] as const;
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );

    render(
      <VariableEditor
        {...createProps({
          initialDraft: { name: 'sex', type: 'categorical' },
          lockedOptions,
          onSubmitRequest,
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

    await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledTimes(1));
    const request = onSubmitRequest.mock.calls[0]?.[0];
    if (request === undefined) throw new Error('missing submitted request');
    expect(submittedVariables(request)['new-variable']).toEqual({
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
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );
    const onComplete = vi.fn();

    render(
      <VariableEditor
        {...createProps({
          initialDraft: {
            name: 'choice',
            type: 'categorical',
            options: null,
          },
          onSubmitRequest,
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
    expect(onSubmitRequest).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
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
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );

    render(
      <VariableEditor
        openId="edit-contradiction"
        mode="update"
        subject={SUBJECT}
        authoritativeDocument={personDocument({ preference: existing })}
        variableId="preference"
        initialDraft={existing}
        description="Update attribute"
        createRequestId={() => 'request-contradiction'}
        onSubmitRequest={onSubmitRequest}
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
    expect(onSubmitRequest).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Save attribute' }),
    ).toBeEnabled();
  });

  /**
   * The one refusal shown in the words it arrived in.
   *
   * A contradiction — an attribute whose committed rules could not be
   * satisfied by the options it is being left with — is legal to the codebook
   * schema and to the host, so nothing downstream refuses it. The surface that
   * detects it says so, and what it says names the rule and the values that
   * cannot both hold, which is more than `compoundFailureCopy` could write
   * about it.
   *
   * The control is the second case: the SAME sentence, reported the way it was
   * before this channel existed, is discarded and the researcher gets the copy
   * for a request that could not be sent. That is the bug the status exists to
   * fix, so the test would pass on the old code for the wrong reason without
   * it.
   */
  it.each([
    {
      caseName: 'a contradiction the surface refused itself',
      result: {
        status: 'contradiction',
        message: CONTRADICTION,
      } satisfies AuxiliaryCodebookSubmitResult,
      shown: CONTRADICTION,
      hidden: REFUSED['invalid-request'],
    },
    {
      caseName: 'the same sentence sent as a failed result',
      result: {
        status: 'failed',
        reason: 'invalid-request',
        message: CONTRADICTION,
      } satisfies AuxiliaryCodebookSubmitResult,
      shown: REFUSED['invalid-request'],
      hidden: CONTRADICTION,
    },
  ])('reports $caseName', async ({ result, shown, hidden }) => {
    const user = userEvent.setup();
    const onComplete = vi.fn();

    render(
      <VariableEditor
        {...createProps({
          initialDraft: { name: '', type: 'text' },
          onSubmitRequest: () => result,
          onComplete,
        })}
      />,
    );

    const name = screen.getByRole('textbox', { name: /attribute name/i });
    await user.type(name, 'preserved');
    await user.click(screen.getByRole('button', { name: 'Create attribute' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(shown);
    expect(alert).not.toHaveTextContent(hidden);
    // Refused either way: the draft stays put and the editor stays open.
    expect(name).toHaveValue('preserved');
    expect(onComplete).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Create attribute' }),
    ).toBeEnabled();
  });

  it.each([
    {
      caseName: 'blocked',
      result: {
        status: 'blocked',
        blockedSections: [
          {
            sectionId: PERSON_SECTION,
            holder: {
              sessionId: 'tab-other',
              userId: 'user-other',
              displayName: 'Another researcher',
              sectionId: PERSON_SECTION,
              mode: 'editing',
            },
          },
        ],
      } satisfies CompoundEditResult,
      message: REFUSED.heldBy('Another researcher'),
    },
    {
      caseName: 'stale',
      result: {
        status: 'failed',
        reason: 'stale-epoch',
        message: HOST_WORDS,
      } satisfies CompoundEditResult,
      message: REFUSED['stale-epoch'],
    },
  ])(
    'preserves the draft after a $caseName result',
    async ({ result, message }) => {
      const user = userEvent.setup();
      const onSubmitRequest = vi.fn(
        (_request: CompoundEditRequest): CompoundEditResult => result,
      );

      render(
        <VariableEditor
          {...createProps({
            initialDraft: { name: '', type: 'text' },
            onSubmitRequest,
          })}
        />,
      );

      const name = screen.getByRole('textbox', { name: /attribute name/i });
      await user.type(name, 'preserved');
      await user.click(
        screen.getByRole('button', { name: 'Create attribute' }),
      );

      await screen.findByText(message);
      const report = screen.getByRole(
        result.status === 'blocked' ? 'status' : 'alert',
      );
      // Never the host's own words, and never an internal section address: a
      // researcher is told what happened to their change, not where.
      expect(report).not.toHaveTextContent(HOST_WORDS);
      expect(report).not.toHaveTextContent(PERSON_SECTION);
      expect(name).toHaveValue('preserved');
      expect(report).toHaveFocus();
      expect(
        screen.getByRole('button', { name: 'Create attribute' }),
      ).toBeEnabled();
    },
  );

  it.each(['stale-epoch', 'lease-lost', 'stale-base'] as const)(
    'uses a new intent id after the retry-invalidating %s failure',
    async (reason) => {
      const user = userEvent.setup();
      const createRequestId = vi
        .fn<() => string>()
        .mockReturnValueOnce('stale-variable-intent')
        .mockReturnValueOnce('refreshed-variable-intent');
      const onSubmitRequest = vi
        .fn<(request: CompoundEditRequest) => CompoundEditResult>()
        .mockReturnValueOnce({
          status: 'failed',
          reason,
          message: HOST_WORDS,
        })
        .mockReturnValueOnce(APPLIED);

      render(
        <VariableEditor
          {...createProps({
            initialDraft: { name: 'retriable', type: 'text' },
            createRequestId,
            onSubmitRequest,
          })}
        />,
      );

      await user.click(
        screen.getByRole('button', { name: 'Create attribute' }),
      );
      await screen.findByText(REFUSED[reason]);
      await user.click(
        screen.getByRole('button', { name: 'Create attribute' }),
      );

      await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledTimes(2));
      expect(onSubmitRequest.mock.calls.map(([request]) => request.id)).toEqual(
        ['stale-variable-intent', 'refreshed-variable-intent'],
      );
    },
  );

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
    onSubmitRequest: VariableEditorProps['onSubmitRequest'],
  ): Extract<VariableEditorProps, { mode: 'update' }> => ({
    openId: 'parameters-open',
    mode: 'update',
    subject: SUBJECT,
    authoritativeDocument: personDocument({ subject: variable }),
    variableId: 'subject',
    initialDraft: variable,
    description: 'Update the attribute',
    createRequestId: () => 'request-parameters',
    onSubmitRequest,
    onComplete: () => undefined,
  });

  const savedVariable = (
    onSubmitRequest: ReturnType<typeof vi.fn>,
  ): Record<string, unknown> => {
    const request = onSubmitRequest.mock.calls[0]?.[0] as
      | CompoundEditRequest
      | undefined;
    if (request === undefined) throw new Error('nothing was submitted');
    const variable = submittedVariables(request).subject;
    if (!isRecord(variable)) throw new Error('the attribute was not submitted');
    return variable;
  };

  it('saves the resolution and the bounds a date attribute accepts', async () => {
    const user = userEvent.setup();
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );
    const variable = { name: 'met', type: 'datetime', component: 'DatePicker' };
    render(<VariableEditor {...parameterProps(variable, onSubmitRequest)} />);

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

    await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledTimes(1));
    expect(savedVariable(onSubmitRequest)).toEqual({
      name: 'met',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'full', min: '2020-01-01', max: '2024-12-31' },
    });
  });

  it('saves the window a relative date attribute offers around its anchor', async () => {
    const user = userEvent.setup();
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );
    const variable = {
      name: 'met',
      type: 'datetime',
      component: 'RelativeDatePicker',
    };
    render(<VariableEditor {...parameterProps(variable, onSubmitRequest)} />);

    await user.type(screen.getByLabelText('Days before'), '30');
    await user.type(screen.getByLabelText('Days after'), '7');
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledTimes(1));
    // Numbers, not the strings a number input reports: the schema takes
    // integers, and `"30"` would be refused after the dialog had closed.
    expect(savedVariable(onSubmitRequest).parameters).toEqual({
      before: 30,
      after: 7,
    });
  });

  it('saves the labels a scale shows at each end', async () => {
    const user = userEvent.setup();
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );
    const variable = {
      name: 'closeness',
      type: 'scalar',
      component: 'VisualAnalogScale',
    };
    render(<VariableEditor {...parameterProps(variable, onSubmitRequest)} />);

    await user.type(
      screen.getByRole('textbox', { name: 'Minimum label' }),
      'Not at all close',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Maximum label' }),
      'Extremely close',
    );
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledTimes(1));
    expect(savedVariable(onSubmitRequest).parameters).toEqual({
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
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );
    const variable = {
      name: 'closeness',
      type: 'scalar',
      component: 'VisualAnalogScale',
    };
    render(<VariableEditor {...parameterProps(variable, onSubmitRequest)} />);

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
    expect(onSubmitRequest).not.toHaveBeenCalled();
  });

  /**
   * The schema's own refusal, reached before a request is built.
   *
   * The request builder catches this too, but by throwing — which the draft
   * session records as a failed submission, so the researcher is handed a
   * second, generic "attribute not saved" alert telling them to wait a moment
   * and try again. Nothing about a reversed range gets better by waiting. So
   * the same schema runs here first, and the only thing said is the thing
   * they can act on.
   */
  it('refuses a date range that ends before it starts, against the date that ends it', async () => {
    const user = userEvent.setup();
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );
    const variable = { name: 'met', type: 'datetime', component: 'DatePicker' };
    render(<VariableEditor {...parameterProps(variable, onSubmitRequest)} />);

    fireEvent.change(screen.getByLabelText('Earliest date'), {
      target: { value: '2024-01-01' },
    });
    fireEvent.change(screen.getByLabelText('Latest date'), {
      target: { value: '2020-01-01' },
    });
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    expect(
      await screen.findByText('DatePicker "min" must not be after "max"'),
    ).toBeVisible();
    expect(onSubmitRequest).not.toHaveBeenCalled();
    expect(screen.queryByText('Attribute not saved')).toBeNull();
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
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );
    const committed = {
      name: 'met',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'full', min: '2020-01-01' },
    };
    render(
      <VariableEditor
        {...parameterProps(committed, onSubmitRequest)}
        initialDraft={{ ...committed, component: 'RelativeDatePicker' }}
      />,
    );

    expect(
      screen.queryByRole('combobox', { name: 'Date resolution' }),
    ).toBeNull();
    expect(screen.queryByLabelText('Earliest date')).toBeNull();
    await user.type(screen.getByLabelText('Days before'), '30');
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledTimes(1));
    expect(savedVariable(onSubmitRequest)).toEqual({
      name: 'met',
      type: 'datetime',
      component: 'RelativeDatePicker',
      parameters: { before: 30 },
    });
  });

  it('clears the bounds when the resolution they were chosen under changes', async () => {
    const user = userEvent.setup();
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );
    const committed = {
      name: 'met',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'full', min: '2020-01-01', max: '2024-12-31' },
    };
    render(<VariableEditor {...parameterProps(committed, onSubmitRequest)} />);

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Date resolution' }),
      'year',
    );

    // A full date is not a year, and re-deriving one would quietly widen a
    // window the researcher chose. So they go — and are said to have gone.
    expect(
      await screen.findByText(
        'The earliest and latest dates were cleared, because they were set at the previous resolution. Set them again if you still need them.',
      ),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledTimes(1));
    expect(savedVariable(onSubmitRequest).parameters).toEqual({
      type: 'year',
    });
  });

  /**
   * Clearing every setting is an answer: the attribute accepts whatever its
   * control accepts by default.
   *
   * The request builder lays the draft OVER the variable the codebook holds,
   * so a `parameters` key the draft no longer carries survives unless this
   * editor says it is replacing the block — and the researcher who emptied
   * the field would find the old window still there.
   */
  it('removes the settings block when every setting is cleared', async () => {
    const user = userEvent.setup();
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );
    const committed = {
      name: 'met',
      type: 'datetime',
      component: 'RelativeDatePicker',
      parameters: { before: 30 },
    };
    render(<VariableEditor {...parameterProps(committed, onSubmitRequest)} />);

    await user.clear(screen.getByLabelText('Days before'));
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledTimes(1));
    const saved = savedVariable(onSubmitRequest);
    expect(Object.hasOwn(saved, 'parameters')).toBe(false);
    expect(saved).toEqual({
      name: 'met',
      type: 'datetime',
      component: 'RelativeDatePicker',
    });
  });

  it('creates an attribute together with the settings its control takes', async () => {
    const user = userEvent.setup();
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );
    render(
      <VariableEditor
        {...createProps({
          variableId: 'closeness',
          initialDraft: {
            name: '',
            type: 'scalar',
            component: 'VisualAnalogScale',
          },
          onSubmitRequest,
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

    await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledTimes(1));
    const request = onSubmitRequest.mock.calls[0]?.[0] as CompoundEditRequest;
    expect(submittedVariables(request).closeness).toEqual({
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
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );
    const variable = {
      name: 'comment',
      type: 'text',
      component: 'Text',
      validation: { required: true },
    };
    render(<VariableEditor {...parameterProps(variable, onSubmitRequest)} />);

    expect(screen.queryByText('What this control accepts')).toBeNull();
    const name = screen.getByRole('textbox', { name: /attribute name/i });
    await user.clear(name);
    await user.type(name, 'note');
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledTimes(1));
    // The control and the rules are still preserved rather than replaced: this
    // editor writes `component` only where it writes the settings that depend
    // on it.
    expect(savedVariable(onSubmitRequest)).toEqual({
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
    onSubmitRequest: VariableEditorProps['onSubmitRequest'],
  ): Extract<VariableEditorProps, { mode: 'update' }> => ({
    openId: 'boolean-open',
    mode: 'update',
    subject: SUBJECT,
    authoritativeDocument: personDocument({ flagged: variable }),
    variableId: 'flagged',
    initialDraft: variable,
    description: 'Update the attribute',
    createRequestId: () => 'request-boolean',
    onSubmitRequest,
    onComplete: () => undefined,
  });

  const savedVariable = (
    onSubmitRequest: ReturnType<typeof vi.fn>,
  ): Record<string, unknown> => {
    const request = onSubmitRequest.mock.calls[0]?.[0] as
      | CompoundEditRequest
      | undefined;
    if (request === undefined) throw new Error('nothing was submitted');
    const variable = submittedVariables(request).flagged;
    if (!isRecord(variable)) throw new Error('the attribute was not submitted');
    return variable;
  };

  it('names the two answers a boolean choice shows, and marks one as negative', async () => {
    const user = userEvent.setup();
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );
    const variable = { name: 'flagged', type: 'boolean', component: 'Boolean' };
    render(<VariableEditor {...booleanProps(variable, onSubmitRequest)} />);

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

    await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledTimes(1));
    // The schema's own shape for a boolean's answers: the label is authored,
    // the value is the boolean it records, and `negative` is carried only
    // where it was switched on.
    expect(savedVariable(onSubmitRequest)).toEqual({
      name: 'flagged',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: 'Yes, always', value: true },
        { label: 'No, never', value: false, negative: true },
      ],
    });
  });

  it('offers no answers to name for a boolean collected with a toggle', async () => {
    const user = userEvent.setup();
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );
    const variable = { name: 'flagged', type: 'boolean', component: 'Toggle' };
    render(<VariableEditor {...booleanProps(variable, onSubmitRequest)} />);

    expect(screen.queryByText('The two answers')).toBeNull();
    expect(
      screen.queryByRole('textbox', { name: 'Label for “true”' }),
    ).toBeNull();

    const name = screen.getByRole('textbox', { name: /attribute name/i });
    await user.clear(name);
    await user.type(name, 'starred');
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledTimes(1));
    expect(savedVariable(onSubmitRequest)).toEqual({
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
  it('drops the answers when the control that showed them is left behind', async () => {
    const user = userEvent.setup();
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );
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
        {...booleanProps(committed, onSubmitRequest)}
        initialDraft={{ ...committed, component: 'Toggle' }}
      />,
    );

    expect(
      screen.queryByRole('textbox', { name: 'Label for “true”' }),
    ).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledTimes(1));
    const saved = savedVariable(onSubmitRequest);
    expect(Object.hasOwn(saved, 'options')).toBe(false);
    // The control itself stays the row's to commit — this editor writes it
    // only where it writes answers that depend on it.
    expect(saved).toEqual({
      name: 'flagged',
      type: 'boolean',
      component: 'Boolean',
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
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );
    const committed = {
      name: 'flagged',
      type: 'boolean',
      component: 'Toggle',
    };
    render(
      <VariableEditor
        {...booleanProps(committed, onSubmitRequest)}
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

    await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledTimes(1));
    expect(savedVariable(onSubmitRequest)).toEqual({
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
          () => APPLIED,
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
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );
    const committed = {
      name: 'flagged',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false, negative: true },
      ],
    };
    render(<VariableEditor {...booleanProps(committed, onSubmitRequest)} />);

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

    await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledTimes(1));
    expect(savedVariable(onSubmitRequest).options).toEqual(committed.options);
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
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );
    const committed = {
      name: 'flagged',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: 'Never', value: false, negative: true },
        { label: 'Always', value: true },
      ],
    };
    render(<VariableEditor {...booleanProps(committed, onSubmitRequest)} />);

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

    await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledTimes(1));
    expect(savedVariable(onSubmitRequest).options).toEqual(committed.options);
  });

  /**
   * One answer named and the other blank is a control with a button nobody can
   * read — the case the schema accepts (`label` is any string) and a
   * participant cannot answer.
   */
  it('refuses a pair with only one of its answers named', async () => {
    const user = userEvent.setup();
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );
    const variable = { name: 'flagged', type: 'boolean', component: 'Boolean' };
    render(<VariableEditor {...booleanProps(variable, onSubmitRequest)} />);

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
    expect(onSubmitRequest).not.toHaveBeenCalled();
  });

  /**
   * Both answers named the same words is the same failure by the other route,
   * and the schema accepts it for the same reason: `booleanOptionsSchema.label`
   * is a bare `z.string()` and nothing downstream compares the two. Two buttons
   * a participant cannot tell apart is not an answerable question.
   */
  it('refuses a pair whose two answers say the same thing', async () => {
    const user = userEvent.setup();
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );
    const committed = {
      name: 'agrees',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ],
    };
    render(<VariableEditor {...booleanProps(committed, onSubmitRequest)} />);

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
    expect(onSubmitRequest).not.toHaveBeenCalled();
  });

  /**
   * The control, and the reason the comparison is case-sensitive where a
   * categorical option's is not: these two labels are rendered exactly as they
   * were typed, so a participant CAN tell them apart. A categorical option's
   * value becomes a key, which is why that rule folds case.
   */
  it('takes two answers that differ only in case', async () => {
    const user = userEvent.setup();
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );
    const committed = {
      name: 'agrees',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: 'YES', value: true },
        { label: 'No', value: false },
      ],
    };
    render(<VariableEditor {...booleanProps(committed, onSubmitRequest)} />);

    const negative = screen.getByRole('textbox', { name: 'Label for “false”' });
    await user.clear(negative);
    await user.type(negative, 'yes');
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledTimes(1));
    expect(savedVariable(onSubmitRequest).options).toEqual([
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
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );
    const committed = {
      name: 'flagged',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ],
    };
    render(<VariableEditor {...booleanProps(committed, onSubmitRequest)} />);

    await user.clear(screen.getByRole('textbox', { name: 'Label for “true”' }));
    await user.clear(
      screen.getByRole('textbox', { name: 'Label for “false”' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledTimes(1));
    const saved = savedVariable(onSubmitRequest);
    expect(Object.hasOwn(saved, 'options')).toBe(false);
    expect(saved).toEqual({
      name: 'flagged',
      type: 'boolean',
      component: 'Boolean',
    });
  });

  it('creates a boolean together with the answers it offers', async () => {
    const user = userEvent.setup();
    const onSubmitRequest = vi.fn(
      (_request: CompoundEditRequest): CompoundEditResult => APPLIED,
    );
    render(
      <VariableEditor
        {...createProps({
          variableId: 'flagged',
          initialDraft: { name: '', type: 'boolean', component: 'Boolean' },
          onSubmitRequest,
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

    await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledTimes(1));
    const request = onSubmitRequest.mock.calls[0]?.[0] as CompoundEditRequest;
    expect(submittedVariables(request).flagged).toEqual({
      name: 'flagged',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ],
    });
  });
});
