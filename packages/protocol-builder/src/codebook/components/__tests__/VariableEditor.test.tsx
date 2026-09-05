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
