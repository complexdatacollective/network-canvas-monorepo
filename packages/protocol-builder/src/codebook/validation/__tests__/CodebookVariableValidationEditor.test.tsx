import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ecosystemLocales } from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { protocolBuilderCatalogs } from '../../../locales/catalogs.ts';
import type {
  CompoundEditRequest,
  CompoundEditResult,
} from '../../../session.ts';
import type { AuxiliaryCodebookSubmitResult } from '../../editing.ts';
import { draftValidatedElsewhereMessage } from '../../variableValidation.ts';
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
  'stale-epoch':
    'Editing access changed while this was being saved, so nothing was saved. Try again.',
  'lease-lost':
    'You are no longer the editor of this stage, so nothing was saved. Take over editing and try again.',
  'stale-base':
    'Someone else changed this while you were editing it, so nothing was saved. Close and reopen this editor to load their version, then make your change again.',
  'host-error':
    'The protocol would not be valid with this change, so nothing was saved. Adjust this type and try again, or close this and come back once the rest of the stage is filled in.',
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
  '“Minimum value” is above the maximum this attribute is allowed to hold.';

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
      message: REFUSED.heldByNobodyNamed,
    },
    {
      name: 'stale',
      result: {
        status: 'failed' as const,
        reason: 'stale-epoch' as const,
        message: HOST_WORDS,
      },
      message: REFUSED['stale-epoch'],
    },
    {
      name: 'failed',
      result: {
        status: 'failed' as const,
        reason: 'host-error' as const,
        message: HOST_WORDS,
      },
      message: REFUSED['host-error'],
    },
  ])(
    'keeps the dirty draft visible after a $name result',
    async ({ result, message }) => {
      const onSubmitRequest = vi.fn(() => result);
      const onComplete = vi.fn();
      renderEditor({ onSubmitRequest, onComplete });
      const user = await replaceMinimumValue('5');

      await user.click(screen.getByRole('button', { name: 'Save validation' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(message);
      // Never the host's own words, and never an internal section address: a
      // researcher is told what happened to their change, not where.
      expect(alert).not.toHaveTextContent(HOST_WORDS);
      expect(alert).not.toHaveTextContent('codebook:node:person');
      expect(
        screen.getByRole('spinbutton', { name: 'Minimum value' }),
      ).toHaveValue(5);
      expect(onComplete).not.toHaveBeenCalled();
      expect(
        screen.getByRole('button', { name: 'Save validation' }),
      ).toBeEnabled();
    },
  );

  /**
   * The one refusal shown in the words it arrived in.
   *
   * A contradiction — rules that cannot all hold at once for this attribute —
   * is legal to the codebook schema and to the host, so nothing downstream
   * refuses it. The surface that detects it says which rule is the problem,
   * which is more than `compoundFailureCopy` could write about it.
   *
   * The control is the second case: the SAME sentence, reported the way it was
   * before this channel existed, is discarded and the researcher is told the
   * change could not be sent. That is the bug the status exists to fix, so the
   * test would pass on the old code for the wrong reason without it.
   */
  it.each([
    {
      name: 'a contradiction the surface refused itself',
      result: {
        status: 'contradiction',
        message: CONTRADICTION,
      } satisfies AuxiliaryCodebookSubmitResult,
      shown: CONTRADICTION,
      hidden: REFUSED['invalid-request'],
    },
    {
      name: 'the same sentence sent as a failed result',
      result: {
        status: 'failed',
        reason: 'invalid-request',
        message: CONTRADICTION,
      } satisfies AuxiliaryCodebookSubmitResult,
      shown: REFUSED['invalid-request'],
      hidden: CONTRADICTION,
    },
  ])('reports $name', async ({ result, shown, hidden }) => {
    const onSubmitRequest = vi.fn(() => result);
    const onComplete = vi.fn();
    renderEditor({ onSubmitRequest, onComplete });
    const user = await replaceMinimumValue('5');

    await user.click(screen.getByRole('button', { name: 'Save validation' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(shown);
    expect(alert).not.toHaveTextContent(hidden);
    // Refused either way: the dirty draft stays put and the editor stays open.
    expect(
      screen.getByRole('spinbutton', { name: 'Minimum value' }),
    ).toHaveValue(5);
    expect(onComplete).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Save validation' }),
    ).toBeEnabled();
  });

  it('reads a refusal this package wrote in the reader’s language', async () => {
    // A contradiction is the one refusal shown in the words it arrived in, and
    // those words are a plain string because a HOST writes its own into the
    // same field — so the ones this package produces travel encoded and have
    // to be decoded here. Without the decode this alert shows the raw
    // `@codaco/app-i18n/error/v1:` payload, which is neither English nor
    // Spanish. That payload carries the English `defaultMessage` inside it, so
    // reading the English sentence out of the alert is not on its own evidence
    // of anything — each language is paired with the assertion that the
    // envelope is gone. Both languages, so a decode wired to a fixed formatter
    // would fail too.
    //
    // Every OTHER refusal reaches the reader as `compoundFailureCopy`'s own
    // sentence for that reason rather than as the message it arrived with, so
    // this is the only channel through which an undecoded payload could ever
    // be rendered by this editor.
    const refusal = {
      status: 'contradiction' as const,
      message: draftValidatedElsewhereMessage('Height'),
    };
    const props: CodebookVariableValidationEditorProps = {
      openId: 'open-1',
      subject: SUBJECT,
      variableId: 'age',
      authoritativeEntityDocument: entityDocument(),
      allSubjectVariables: variablesFrom(entityDocument()),
      requestMetadata: {
        createId: () => 'request-1',
        description: 'Update Age validation',
      },
      onSubmitRequest: vi.fn(() => refusal),
    };
    const view = (locale: string) => (
      <AppI18nProvider
        locale={locale}
        locales={ecosystemLocales}
        messages={protocolBuilderCatalogs[locale]}
      >
        <CodebookVariableValidationEditor {...props} />
      </AppI18nProvider>
    );

    const { rerender } = render(view('en'));
    const user = await replaceMinimumValue('5');
    await user.click(screen.getByRole('button', { name: 'Save validation' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '"Height" is collected by this stage\'s form, so it cannot be assigned by this prompt',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      '@codaco/app-i18n/error/v1',
    );

    rerender(view('es'));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'El formulario de esta etapa recoge «Height», por lo que esta pregunta no puede asignarlo',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      '@codaco/app-i18n/error/v1',
    );
  });

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
    await screen.findByText(REFUSED.threw);

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
          message: HOST_WORDS,
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
      await screen.findByText(REFUSED[reason]);
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
