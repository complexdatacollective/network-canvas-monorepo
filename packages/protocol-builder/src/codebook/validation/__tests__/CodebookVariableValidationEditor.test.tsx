import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import type {
  CompoundEditRequest,
  CompoundEditResult,
} from '../../../session.ts';
import CodebookVariableValidationEditor, {
  type CodebookVariableValidationEditorProps,
} from '../CodebookVariableValidationEditor.tsx';

const SUBJECT = { entity: 'node', type: 'person' } as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const entityDocument = (
  ageValidation: Record<string, unknown> = { minValue: 0 },
): SectionDoc => ({
  name: 'Person',
  color: 'node-color-seq-1',
  shape: { default: 'circle' },
  variables: {
    age: {
      name: 'Age',
      type: 'number',
      component: 'Number',
      validation: ageValidation,
    },
    height: {
      name: 'Height',
      type: 'number',
      component: 'Number',
    },
  },
});

const variablesFrom = (document: SectionDoc): Record<string, unknown> => {
  const variables = document.variables;
  return isRecord(variables) ? variables : {};
};

const appliedResult = (): Extract<
  CompoundEditResult,
  { status: 'applied' }
> => ({
  status: 'applied',
  update: {
    protocolSections: {},
    manifestRevision: { sequence: 2n, hash: 'revision-2' },
  },
});

const blockedResult = (): Extract<
  CompoundEditResult,
  { status: 'blocked' }
> => ({
  status: 'blocked',
  blockedSections: [
    {
      sectionId: sectionId({ kind: 'codebookNode', typeId: 'person' }),
    },
  ],
});

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

const renderEditor = (
  overrides: Partial<CodebookVariableValidationEditorProps> = {},
) => {
  const authoritativeEntityDocument =
    overrides.authoritativeEntityDocument ?? entityDocument();
  const props: CodebookVariableValidationEditorProps = {
    openId: 'open-1',
    subject: SUBJECT,
    variableId: 'age',
    authoritativeEntityDocument,
    allSubjectVariables: variablesFrom(authoritativeEntityDocument),
    requestMetadata: {
      createId: () => 'request-1',
      description: 'Update Age validation',
    },
    onSubmitRequest: vi.fn(() => appliedResult()),
    ...overrides,
  };
  return { ...render(<CodebookVariableValidationEditor {...props} />), props };
};

const replaceMinimumValue = async (value: string) => {
  const user = userEvent.setup();
  const input = screen.getByRole('spinbutton', { name: 'Minimum value' });
  await user.clear(input);
  await user.type(input, value);
  return user;
};

describe('CodebookVariableValidationEditor', () => {
  it('submits an existing-variable update and completes only after application', async () => {
    const onSubmitRequest = vi.fn<
      (request: CompoundEditRequest) => CompoundEditResult
    >(() => appliedResult());
    const onComplete = vi.fn();
    renderEditor({ onSubmitRequest, onComplete });
    const user = await replaceMinimumValue('5');

    await user.click(screen.getByRole('button', { name: 'Save validation' }));

    await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledOnce());
    expect(onSubmitRequest.mock.calls[0]?.[0]).toMatchObject({
      id: 'request-1',
      description: 'Update Age validation',
      edits: [
        {
          kind: 'update',
          commands: [
            {
              op: 'set',
              key: 'variables',
              value: {
                age: { validation: { minValue: 5 } },
                height: { name: 'Height' },
              },
            },
          ],
        },
      ],
    });
    expect(onComplete).toHaveBeenCalledOnce();
    expect(
      screen.getByRole('button', { name: 'Waiting for latest data…' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('spinbutton', { name: 'Minimum value' }),
    ).toHaveValue(5);
  });

  it('does not complete an applied submit that settles with an authoritative conflict', async () => {
    const initial = entityDocument();
    const pending = deferred<CompoundEditResult>();
    const onSubmitRequest = vi.fn(() => pending.promise);
    const onComplete = vi.fn();
    const { rerender, props } = renderEditor({
      authoritativeEntityDocument: initial,
      allSubjectVariables: variablesFrom(initial),
      onSubmitRequest,
      onComplete,
    });
    const user = await replaceMinimumValue('5');
    await user.click(screen.getByRole('button', { name: 'Save validation' }));
    expect(onSubmitRequest).toHaveBeenCalledOnce();

    const remote = entityDocument({ minValue: 2 });
    rerender(
      <CodebookVariableValidationEditor
        {...props}
        authoritativeEntityDocument={remote}
        allSubjectVariables={variablesFrom(remote)}
      />,
    );
    await act(async () => pending.resolve(appliedResult()));

    expect(
      await screen.findByText('Newer codebook data is available'),
    ).toBeVisible();
    expect(
      screen.getByRole('spinbutton', { name: 'Minimum value' }),
    ).toHaveValue(5);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('keeps a deleted comparison target visible and blocks submission', async () => {
    const document = entityDocument({ lessThanVariable: 'deleted-height' });
    delete variablesFrom(document).height;
    const onSubmitRequest = vi.fn(() => appliedResult());
    renderEditor({
      authoritativeEntityDocument: document,
      allSubjectVariables: variablesFrom(document),
      onSubmitRequest,
    });

    expect(
      screen.getByRole('option', {
        name: 'Deleted attribute (deleted-height)',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Less than' })).toHaveValue(
      'deleted-height',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The selected comparison attribute no longer exists.',
    );
    expect(
      screen.getByRole('button', { name: 'Save validation' }),
    ).toBeDisabled();
    await userEvent.click(
      screen.getByRole('button', { name: 'Save validation' }),
    );
    expect(onSubmitRequest).not.toHaveBeenCalled();
  });

  it('preserves an incomplete null draft instead of silently dropping it', async () => {
    renderEditor();
    const user = userEvent.setup();
    const input = screen.getByRole('spinbutton', { name: 'Minimum value' });
    await user.clear(input);

    expect(input).toHaveValue(null);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a value for "Minimum value", or switch the rule off.',
    );
    expect(
      screen.getByRole('button', { name: 'Save validation' }),
    ).toBeDisabled();
  });

  it('keeps contradictory values visible for correction', () => {
    const document = entityDocument({ minValue: 10, maxValue: 2 });
    renderEditor({
      authoritativeEntityDocument: document,
      allSubjectVariables: variablesFrom(document),
    });

    expect(
      screen.getByRole('spinbutton', { name: 'Minimum value' }),
    ).toHaveValue(10);
    expect(
      screen.getByRole('spinbutton', { name: 'Maximum value' }),
    ).toHaveValue(2);
    expect(screen.getByRole('alert')).toHaveTextContent('is greater than');
    expect(
      screen.getByRole('button', { name: 'Save validation' }),
    ).toBeDisabled();
  });

  it.each([
    {
      name: 'blocked',
      result: blockedResult(),
      message: 'A section needed for this change is currently being edited.',
    },
    {
      name: 'stale',
      result: {
        status: 'failed' as const,
        reason: 'stale-epoch' as const,
        message: 'Editing authority changed before the request completed.',
      },
      message: 'Editing authority changed before the request completed.',
    },
    {
      name: 'failed',
      result: {
        status: 'failed' as const,
        reason: 'host-error' as const,
        message: 'The codebook service rejected the request.',
      },
      message: 'The codebook service rejected the request.',
    },
  ])(
    'keeps the dirty draft visible after a $name result',
    async ({ result, message }) => {
      const onSubmitRequest = vi.fn(() => result);
      const onComplete = vi.fn();
      renderEditor({ onSubmitRequest, onComplete });
      const user = await replaceMinimumValue('5');

      await user.click(screen.getByRole('button', { name: 'Save validation' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(
        screen.getByRole('spinbutton', { name: 'Minimum value' }),
      ).toHaveValue(5);
      expect(onComplete).not.toHaveBeenCalled();
      expect(
        screen.getByRole('button', { name: 'Save validation' }),
      ).toBeEnabled();
    },
  );

  it('uses a new intent id after editing a blocked validation draft', async () => {
    const createId = vi
      .fn<() => string>()
      .mockReturnValueOnce('blocked-intent')
      .mockReturnValueOnce('revised-intent');
    const onSubmitRequest = vi
      .fn<(request: CompoundEditRequest) => CompoundEditResult>()
      .mockReturnValueOnce(blockedResult())
      .mockReturnValueOnce(appliedResult());
    renderEditor({
      requestMetadata: {
        createId,
        description: 'Update Age validation',
      },
      onSubmitRequest,
    });
    const user = await replaceMinimumValue('5');

    await user.click(screen.getByRole('button', { name: 'Save validation' }));
    await screen.findByText('Could not save validation');
    await replaceMinimumValue('6');
    await user.click(screen.getByRole('button', { name: 'Save validation' }));

    await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledTimes(2));
    expect(onSubmitRequest.mock.calls.map(([request]) => request.id)).toEqual([
      'blocked-intent',
      'revised-intent',
    ]);
  });

  it('preserves an uncertain retry id across a content-identical authority re-emission', async () => {
    const initial = entityDocument();
    const createId = vi
      .fn<() => string>()
      .mockReturnValueOnce('uncertain-validation-intent')
      .mockReturnValueOnce('duplicate-validation-intent');
    const onSubmitRequest = vi
      .fn<(request: CompoundEditRequest) => Promise<CompoundEditResult>>()
      .mockRejectedValueOnce(new Error('Connection dropped.'))
      .mockResolvedValueOnce(appliedResult());
    const { rerender, props } = renderEditor({
      authoritativeEntityDocument: initial,
      allSubjectVariables: variablesFrom(initial),
      requestMetadata: {
        createId,
        description: 'Update Age validation',
      },
      onSubmitRequest,
    });
    const user = await replaceMinimumValue('5');

    await user.click(screen.getByRole('button', { name: 'Save validation' }));
    await screen.findByText('Connection dropped.');

    const reemitted = structuredClone(initial);
    rerender(
      <CodebookVariableValidationEditor
        {...props}
        authoritativeEntityDocument={reemitted}
        allSubjectVariables={variablesFrom(reemitted)}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Save validation' }));

    await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledTimes(2));
    expect(onSubmitRequest.mock.calls.map(([request]) => request.id)).toEqual([
      'uncertain-validation-intent',
      'uncertain-validation-intent',
    ]);
    expect(createId).toHaveBeenCalledOnce();
  });

  it.each(['stale-epoch', 'lease-lost', 'stale-base'] as const)(
    'uses a new intent id after the retry-invalidating %s failure',
    async (reason) => {
      const createId = vi
        .fn<() => string>()
        .mockReturnValueOnce('stale-validation-intent')
        .mockReturnValueOnce('refreshed-validation-intent');
      const onSubmitRequest = vi
        .fn<(request: CompoundEditRequest) => CompoundEditResult>()
        .mockReturnValueOnce({
          status: 'failed',
          reason,
          message: 'The request base changed.',
        })
        .mockReturnValueOnce(appliedResult());
      renderEditor({
        requestMetadata: {
          createId,
          description: 'Update Age validation',
        },
        onSubmitRequest,
      });
      const user = await replaceMinimumValue('5');

      await user.click(screen.getByRole('button', { name: 'Save validation' }));
      await screen.findByText('The request base changed.');
      await user.click(screen.getByRole('button', { name: 'Save validation' }));

      await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledTimes(2));
      expect(onSubmitRequest.mock.calls.map(([request]) => request.id)).toEqual(
        ['stale-validation-intent', 'refreshed-validation-intent'],
      );
    },
  );

  it('preserves a dirty draft but bases its request on a newer authoritative entity', async () => {
    const initial = entityDocument();
    const onSubmitRequest = vi.fn<
      (request: CompoundEditRequest) => CompoundEditResult
    >(() => blockedResult());
    const { rerender, props } = renderEditor({
      authoritativeEntityDocument: initial,
      allSubjectVariables: variablesFrom(initial),
      onSubmitRequest,
    });
    const user = await replaceMinimumValue('5');
    const remote = entityDocument({ minValue: 2 });
    const remoteVariables = variablesFrom(remote);
    remoteVariables.remoteWeight = {
      name: 'RemoteWeight',
      type: 'number',
      component: 'Number',
    };

    rerender(
      <CodebookVariableValidationEditor
        {...props}
        authoritativeEntityDocument={remote}
        allSubjectVariables={remoteVariables}
      />,
    );

    expect(
      await screen.findByText('Newer codebook data is available'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('spinbutton', { name: 'Minimum value' }),
    ).toHaveValue(5);

    await user.click(screen.getByRole('button', { name: 'Save validation' }));
    await waitFor(() => expect(onSubmitRequest).toHaveBeenCalledOnce());
    expect(onSubmitRequest.mock.calls[0]?.[0]).toMatchObject({
      edits: [
        {
          commands: [
            {
              key: 'variables',
              value: {
                age: { validation: { minValue: 5 } },
                remoteWeight: { name: 'RemoteWeight' },
              },
            },
          ],
        },
      ],
    });
  });

  it('blocks a dirty validation draft when the authoritative attribute was deleted remotely', async () => {
    const initial = entityDocument();
    const onSubmitRequest = vi.fn(() => appliedResult());
    const { rerender, props } = renderEditor({
      authoritativeEntityDocument: initial,
      allSubjectVariables: variablesFrom(initial),
      onSubmitRequest,
    });
    const user = await replaceMinimumValue('5');
    const deleted = entityDocument();
    delete variablesFrom(deleted).age;

    rerender(
      <CodebookVariableValidationEditor
        {...props}
        authoritativeEntityDocument={deleted}
        allSubjectVariables={variablesFrom(deleted)}
      />,
    );

    expect(await screen.findByText('Attribute unavailable')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The latest entity data no longer contains this attribute.',
    );
    const save = screen.getByRole('button', { name: 'Save validation' });
    expect(save).toBeDisabled();
    await user.click(save);
    expect(onSubmitRequest).not.toHaveBeenCalled();

    const restored = entityDocument({ minValue: 2 });
    rerender(
      <CodebookVariableValidationEditor
        {...props}
        authoritativeEntityDocument={restored}
        allSubjectVariables={variablesFrom(restored)}
      />,
    );
    expect(
      await screen.findByRole('spinbutton', { name: 'Minimum value' }),
    ).toHaveValue(5);
  });

  it('keeps a dirty draft visible but blocks saving after a remote variable type change', async () => {
    const initial = entityDocument();
    const onSubmitRequest = vi.fn(() => appliedResult());
    const { rerender, props } = renderEditor({
      authoritativeEntityDocument: initial,
      allSubjectVariables: variablesFrom(initial),
      onSubmitRequest,
    });
    const user = await replaceMinimumValue('5');
    const remote = entityDocument();
    variablesFrom(remote).age = {
      name: 'Age',
      type: 'text',
      component: 'Text',
      validation: { required: true },
    };

    rerender(
      <CodebookVariableValidationEditor
        {...props}
        authoritativeEntityDocument={remote}
        allSubjectVariables={variablesFrom(remote)}
      />,
    );

    expect(await screen.findByText('Attribute type changed')).toBeVisible();
    expect(screen.getByText(/close and reopen this editor/i)).toBeVisible();
    expect(
      screen.getByRole('spinbutton', { name: 'Minimum value' }),
    ).toHaveValue(5);
    const save = screen.getByRole('button', { name: 'Save validation' });
    expect(save).toBeDisabled();
    await user.click(save);
    expect(onSubmitRequest).not.toHaveBeenCalled();
  });
});
