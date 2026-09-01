import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { applyCommands, type SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import type { CodebookSubject } from '../../../protocol-context.ts';
import type {
  CompoundEditRequest,
  CompoundEditResult,
} from '../../../session.ts';
import CodebookEntityEditor, {
  type CodebookEntityEditorProps,
} from '../CodebookEntityEditor.tsx';

const NODE_SUBJECT = { entity: 'node', type: 'person:adult' } as const;

const NODE_DOCUMENT: SectionDoc = {
  name: 'Person',
  color: 'node-color-seq-1',
  icon: 'add-a-person',
  shape: { default: 'circle' },
  variables: {
    age: { name: 'Age', type: 'number', component: 'Number' },
  },
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

const renderUpdateEditor = (
  onSubmit: (
    request: CompoundEditRequest,
  ) => CompoundEditResult | Promise<CompoundEditResult>,
) =>
  render(
    <CodebookEntityEditor
      mode="update"
      sessionKey="open-1"
      createRequestId={() => 'request-update-person'}
      description="Update person type"
      subject={NODE_SUBJECT}
      initialDraft={NODE_DOCUMENT}
      authoritativeDocument={NODE_DOCUMENT}
      existingEntityNames={[]}
      onSubmit={onSubmit}
    />,
  );

describe('CodebookEntityEditor', () => {
  it('requires create mode to provide a successful completion callback', () => {
    type CreateEditorProps = Extract<
      CodebookEntityEditorProps,
      Readonly<{ mode: 'create' }>
    >;
    expectTypeOf<CreateEditorProps['onApplied']>().toEqualTypeOf<
      (result: Extract<CompoundEditResult, { status: 'applied' }>) => void
    >();
  });

  it('does not submit an unchanged existing entity', () => {
    const createRequestId = vi.fn(() => 'should-not-be-created');
    const onSubmit = vi.fn<
      (request: CompoundEditRequest) => CompoundEditResult
    >(() => appliedResult());
    const { container } = render(
      <CodebookEntityEditor
        mode="update"
        sessionKey="unchanged"
        createRequestId={createRequestId}
        description="Update person"
        subject={NODE_SUBJECT}
        initialDraft={NODE_DOCUMENT}
        authoritativeDocument={NODE_DOCUMENT}
        existingEntityNames={[]}
        onSubmit={onSubmit}
      />,
    );

    const save = screen.getByRole('button', { name: 'Save entity' });
    expect(save).toBeDisabled();
    const form = container.querySelector('form');
    if (form === null) throw new Error('expected entity editor form');
    fireEvent.submit(form);
    expect(createRequestId).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each([
    { caseName: 'matching', publishedName: 'Adult', shouldComplete: true },
    {
      caseName: 'different',
      publishedName: 'RemoteName',
      shouldComplete: false,
    },
  ])(
    '$caseName authoritative publication during submit completes: $shouldComplete',
    async ({ publishedName, shouldComplete }) => {
      const user = userEvent.setup();
      const pending =
        deferred<Extract<CompoundEditResult, { status: 'applied' }>>();
      const onSubmit = vi.fn(() => pending.promise);
      const onApplied = vi.fn();
      const commonProps = {
        mode: 'update' as const,
        sessionKey: `pending-${publishedName}`,
        createRequestId: () => `request-${publishedName}`,
        description: 'Update person',
        subject: NODE_SUBJECT,
        initialDraft: NODE_DOCUMENT,
        existingEntityNames: [] as const,
        onSubmit,
        onApplied,
      };
      const { rerender } = render(
        <CodebookEntityEditor
          {...commonProps}
          authoritativeDocument={NODE_DOCUMENT}
        />,
      );

      const name = screen.getByRole('textbox', { name: 'Node type name' });
      await user.clear(name);
      await user.type(name, 'Adult');
      await user.click(screen.getByRole('button', { name: 'Save entity' }));
      expect(onSubmit).toHaveBeenCalledOnce();

      rerender(
        <CodebookEntityEditor
          {...commonProps}
          authoritativeDocument={{ ...NODE_DOCUMENT, name: publishedName }}
        />,
      );
      await act(async () => pending.resolve(appliedResult()));
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Save entity' }),
        ).toBeDisabled(),
      );

      if (shouldComplete) expect(onApplied).toHaveBeenCalledOnce();
      else expect(onApplied).not.toHaveBeenCalled();
    },
  );

  it('updates an existing node while preserving variables and unrendered properties', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<
      (request: CompoundEditRequest) => CompoundEditResult
    >(() => appliedResult());
    renderUpdateEditor(onSubmit);

    const name = screen.getByRole('textbox', { name: 'Node type name' });
    await user.clear(name);
    await user.type(name, 'Adult');
    await user.click(screen.getByRole('button', { name: 'Save entity' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    const request = onSubmit.mock.calls[0]?.[0];
    const edit = request?.edits[0];
    if (edit?.kind !== 'update') throw new Error('expected update request');
    expect(applyCommands(NODE_DOCUMENT, [...edit.commands])).toEqual({
      ...NODE_DOCUMENT,
      name: 'Adult',
    });
  });

  it('accepts periods in a schema-valid entity name', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<
      (request: CompoundEditRequest) => CompoundEditResult
    >(() => appliedResult());
    renderUpdateEditor(onSubmit);

    const name = screen.getByRole('textbox', { name: 'Node type name' });
    await user.clear(name);
    await user.type(name, 'Person.v2');
    await user.click(screen.getByRole('button', { name: 'Save entity' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
  });

  it.each(['Person Type', 'Person/Place', 'Person&Place'])(
    'rejects the export-unsafe entity name %s',
    async (invalidName) => {
      const user = userEvent.setup();
      const onSubmit = vi.fn<
        (request: CompoundEditRequest) => CompoundEditResult
      >(() => appliedResult());
      renderUpdateEditor(onSubmit);

      const name = screen.getByRole('textbox', { name: 'Node type name' });
      await user.clear(name);
      await user.type(name, invalidName);
      await user.click(screen.getByRole('button', { name: 'Save entity' }));

      expect(onSubmit).not.toHaveBeenCalled();
      expect(
        screen.getByText(
          'Not a valid node type name. Only letters, numbers and the symbols ._-: are supported',
        ),
      ).toBeInTheDocument();
      expect(name).toHaveValue(invalidName);
    },
  );

  it('rejects a canonically equivalent entity name', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<
      (request: CompoundEditRequest) => CompoundEditResult
    >(() => appliedResult());
    render(
      <CodebookEntityEditor
        mode="update"
        sessionKey="canonical-duplicate"
        createRequestId={() => 'canonical-duplicate'}
        description="Update adult type"
        subject={NODE_SUBJECT}
        initialDraft={{ ...NODE_DOCUMENT, name: 'Adult' }}
        authoritativeDocument={{ ...NODE_DOCUMENT, name: 'Adult' }}
        existingEntityNames={['Person']}
        onSubmit={onSubmit}
      />,
    );

    const name = screen.getByRole('textbox', { name: 'Node type name' });
    await user.clear(name);
    await user.type(name, 'person');
    await user.click(screen.getByRole('button', { name: 'Save entity' }));

    expect(
      screen.getByText('A type named "person" already exists.'),
    ).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects an icon the Fresco renderer cannot display', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<
      (request: CompoundEditRequest) => CompoundEditResult
    >(() => appliedResult());
    renderUpdateEditor(onSubmit);

    const icon = screen.getByRole('textbox', { name: 'Interface icon' });
    await user.clear(icon);
    await user.type(icon, 'not-a-rendered-icon');
    await user.click(screen.getByRole('button', { name: 'Save entity' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByText('Choose an icon supported by Network Canvas.'),
    ).toBeInTheDocument();
    expect(icon).toHaveValue('not-a-rendered-icon');
  });

  it('reacts to live read-only access without losing the draft', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<
      (request: CompoundEditRequest) => CompoundEditResult
    >(() => appliedResult());
    const commonProps = {
      mode: 'update' as const,
      sessionKey: 'live-read-only',
      createRequestId: () => 'request-read-only',
      description: 'Update person',
      subject: NODE_SUBJECT,
      initialDraft: NODE_DOCUMENT,
      authoritativeDocument: NODE_DOCUMENT,
      existingEntityNames: [],
      onSubmit,
    };
    const { container, rerender } = render(
      <CodebookEntityEditor {...commonProps} readOnly={false} />,
    );

    const name = screen.getByRole('textbox', { name: 'Node type name' });
    await user.clear(name);
    await user.type(name, 'Unsaved local name');
    rerender(<CodebookEntityEditor {...commonProps} readOnly />);

    expect(name).toHaveValue('Unsaved local name');
    expect(name).toBeDisabled();
    expect(
      screen.getByRole('textbox', { name: 'Interface icon' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save entity' })).toBeDisabled();
    const form = container.querySelector('form');
    if (form === null) throw new Error('expected entity editor form');
    fireEvent.submit(form);
    expect(onSubmit).not.toHaveBeenCalled();

    rerender(<CodebookEntityEditor {...commonProps} readOnly={false} />);
    expect(name).toBeEnabled();
    expect(name).toHaveValue('Unsaved local name');
    expect(screen.getByRole('button', { name: 'Save entity' })).toBeEnabled();
  });

  it.each<{
    label: string;
    subject: CodebookSubject;
    draft: SectionDoc;
    expectedSection: string;
  }>([
    {
      label: 'node',
      subject: { entity: 'node', type: 'new:person' },
      draft: {
        name: 'NewPerson',
        color: 'node-color-seq-2',
        icon: 'add-a-person',
        shape: { default: 'square' },
      },
      expectedSection: 'codebook:node:new:person',
    },
    {
      label: 'edge',
      subject: { entity: 'edge', type: 'new:relationship' },
      draft: { name: 'Knows', color: 'edge-color-seq-2' },
      expectedSection: 'codebook:edge:new:relationship',
    },
    {
      label: 'ego',
      subject: { entity: 'ego' },
      draft: {},
      expectedSection: 'codebook:ego',
    },
  ])(
    'creates a new $label section',
    async ({ subject, draft, expectedSection }) => {
      const user = userEvent.setup();
      const onSubmit = vi.fn<
        (request: CompoundEditRequest) => CompoundEditResult
      >(() => appliedResult());
      const onApplied =
        vi.fn<
          (result: Extract<CompoundEditResult, { status: 'applied' }>) => void
        >();
      render(
        <CodebookEntityEditor
          mode="create"
          sessionKey={`create-${expectedSection}`}
          createRequestId={() => `request-${expectedSection}`}
          description="Create entity"
          subject={subject}
          initialDraft={draft}
          existingEntityNames={[]}
          onSubmit={onSubmit}
          onApplied={onApplied}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Save entity' }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
      expect(onApplied).toHaveBeenCalledOnce();
      expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
        id: `request-${expectedSection}`,
        edits: [{ kind: 'create', sectionId: expectedSection }],
      });
    },
  );

  it('keeps a blocked draft open, reports the holder, and focuses the failure', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<
      (request: CompoundEditRequest) => CompoundEditResult
    >((): CompoundEditResult => ({
      status: 'blocked',
      blockedSections: [
        {
          sectionId: sectionId({
            kind: 'codebookNode',
            typeId: 'person:adult',
          }),
          holder: {
            sessionId: 'remote-session',
            userId: 'remote-user',
            displayName: 'Morgan',
            sectionId: sectionId({
              kind: 'codebookNode',
              typeId: 'person:adult',
            }),
            mode: 'editing',
          },
        },
      ],
    }));
    renderUpdateEditor(onSubmit);

    const name = screen.getByRole('textbox', { name: 'Node type name' });
    await user.clear(name);
    await user.type(name, 'UnsavedLocalName');
    await user.click(screen.getByRole('button', { name: 'Save entity' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Morgan is currently editing a section needed for this change.',
    );
    expect(alert).toHaveFocus();
    expect(name).toHaveValue('UnsavedLocalName');
    expect(screen.getByRole('button', { name: 'Save entity' })).toBeEnabled();
  });

  it('uses a new intent id after editing a blocked draft', async () => {
    const user = userEvent.setup();
    const createRequestId = vi
      .fn<() => string>()
      .mockReturnValueOnce('blocked-intent')
      .mockReturnValueOnce('revised-intent');
    const onSubmit = vi
      .fn<(request: CompoundEditRequest) => CompoundEditResult>()
      .mockReturnValueOnce({
        status: 'blocked',
        blockedSections: [{ sectionId: sectionId({ kind: 'codebookEgo' }) }],
      })
      .mockReturnValueOnce(appliedResult());
    render(
      <CodebookEntityEditor
        mode="update"
        sessionKey="blocked-then-revised"
        createRequestId={createRequestId}
        description="Update person"
        subject={NODE_SUBJECT}
        initialDraft={NODE_DOCUMENT}
        authoritativeDocument={NODE_DOCUMENT}
        existingEntityNames={[]}
        onSubmit={onSubmit}
      />,
    );

    const name = screen.getByRole('textbox', { name: 'Node type name' });
    await user.clear(name);
    await user.type(name, 'FirstDraft');
    await user.click(screen.getByRole('button', { name: 'Save entity' }));
    await screen.findByText('Could not save this entity');

    await user.type(name, '_revised');
    await user.click(screen.getByRole('button', { name: 'Save entity' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls.map(([request]) => request.id)).toEqual([
      'blocked-intent',
      'revised-intent',
    ]);
  });

  it.each(['stale-epoch', 'lease-lost', 'stale-base'] as const)(
    'uses a new intent id after the retry-invalidating %s failure',
    async (reason) => {
      const user = userEvent.setup();
      const createRequestId = vi
        .fn<() => string>()
        .mockReturnValueOnce('stale-authority-intent')
        .mockReturnValueOnce('refreshed-authority-intent');
      const onSubmit = vi
        .fn<(request: CompoundEditRequest) => CompoundEditResult>()
        .mockReturnValueOnce({
          status: 'failed',
          reason,
          message: 'Editing authority changed.',
        })
        .mockReturnValueOnce(appliedResult());
      render(
        <CodebookEntityEditor
          mode="update"
          sessionKey={`authority-${reason}`}
          createRequestId={createRequestId}
          description="Update person"
          subject={NODE_SUBJECT}
          initialDraft={NODE_DOCUMENT}
          authoritativeDocument={NODE_DOCUMENT}
          existingEntityNames={[]}
          onSubmit={onSubmit}
        />,
      );

      const name = screen.getByRole('textbox', { name: 'Node type name' });
      await user.clear(name);
      await user.type(name, 'RetriableName');
      await user.click(screen.getByRole('button', { name: 'Save entity' }));
      await screen.findByText('Editing authority changed.');

      await user.click(screen.getByRole('button', { name: 'Save entity' }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
      expect(onSubmit.mock.calls.map(([request]) => request.id)).toEqual([
        'stale-authority-intent',
        'refreshed-authority-intent',
      ]);
    },
  );

  it('resets from the next opening identity even when the component never unmounts', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<
      (request: CompoundEditRequest) => CompoundEditResult
    >(() => appliedResult());
    const { rerender } = render(
      <CodebookEntityEditor
        mode="update"
        sessionKey="open-1"
        createRequestId={() => 'request-1'}
        description="Update person"
        subject={NODE_SUBJECT}
        initialDraft={NODE_DOCUMENT}
        authoritativeDocument={NODE_DOCUMENT}
        existingEntityNames={[]}
        onSubmit={onSubmit}
      />,
    );

    const name = screen.getByRole('textbox', { name: 'Node type name' });
    await user.clear(name);
    await user.type(name, 'Abandoned name');

    const nextDocument: SectionDoc = {
      ...NODE_DOCUMENT,
      name: 'Place',
      icon: 'add-a-place',
    };
    rerender(
      <CodebookEntityEditor
        mode="update"
        sessionKey="open-2"
        createRequestId={() => 'request-2'}
        description="Update place"
        subject={{ entity: 'node', type: 'place' }}
        initialDraft={nextDocument}
        authoritativeDocument={nextDocument}
        existingEntityNames={[]}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Node type name' })).toHaveValue(
      'Place',
    );
    expect(screen.getByRole('textbox', { name: 'Interface icon' })).toHaveValue(
      'add-a-place',
    );
  });

  it('preserves a dirty draft and prevents a stale save after a live authoritative change', async () => {
    const user = userEvent.setup();
    const createRequestId = vi.fn(() => 'request-live-change');
    const onSubmit = vi.fn<
      (request: CompoundEditRequest) => CompoundEditResult
    >(() => appliedResult());
    const { container, rerender } = render(
      <CodebookEntityEditor
        mode="update"
        sessionKey="open-live-change"
        createRequestId={createRequestId}
        description="Update person"
        subject={NODE_SUBJECT}
        initialDraft={NODE_DOCUMENT}
        authoritativeDocument={NODE_DOCUMENT}
        existingEntityNames={[]}
        onSubmit={onSubmit}
      />,
    );

    const name = screen.getByRole('textbox', { name: 'Node type name' });
    await user.clear(name);
    await user.type(name, 'Adult');

    const remoteDocument: SectionDoc = {
      ...NODE_DOCUMENT,
      icon: 'remote-icon',
    };
    rerender(
      <CodebookEntityEditor
        mode="update"
        sessionKey="open-live-change"
        createRequestId={createRequestId}
        description="Update person"
        subject={NODE_SUBJECT}
        initialDraft={NODE_DOCUMENT}
        authoritativeDocument={remoteDocument}
        existingEntityNames={[]}
        onSubmit={onSubmit}
      />,
    );

    expect(name).toHaveValue('Adult');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Newer codebook data is available',
    );
    expect(screen.getByRole('button', { name: 'Save entity' })).toBeDisabled();
    const form = container.querySelector('form');
    if (form === null) throw new Error('expected entity editor form');
    fireEvent.submit(form);
    expect(createRequestId).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
