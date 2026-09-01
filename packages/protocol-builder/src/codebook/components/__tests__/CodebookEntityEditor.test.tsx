import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { applyCommands, type SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import type { CodebookSubject } from '../../../protocol-context.ts';
import type {
  CompoundEditRequest,
  CompoundEditResult,
} from '../../../session.ts';
import CodebookEntityEditor from '../CodebookEntityEditor.tsx';

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
      onSubmit={onSubmit}
    />,
  );

describe('CodebookEntityEditor', () => {
  it('does not submit an unchanged existing entity', async () => {
    const user = userEvent.setup();
    const createRequestId = vi.fn(() => 'should-not-be-created');
    const onSubmit = vi.fn<
      (request: CompoundEditRequest) => CompoundEditResult
    >(() => appliedResult());
    render(
      <CodebookEntityEditor
        mode="update"
        sessionKey="unchanged"
        createRequestId={createRequestId}
        description="Update person"
        subject={NODE_SUBJECT}
        initialDraft={NODE_DOCUMENT}
        authoritativeDocument={NODE_DOCUMENT}
        onSubmit={onSubmit}
      />,
    );

    const save = screen.getByRole('button', { name: 'Save entity' });
    expect(save).toBeDisabled();
    await user.click(save);
    expect(createRequestId).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

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
        name: 'New person',
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
      render(
        <CodebookEntityEditor
          mode="create"
          sessionKey={`create-${expectedSection}`}
          createRequestId={() => `request-${expectedSection}`}
          description="Create entity"
          subject={subject}
          initialDraft={draft}
          onSubmit={onSubmit}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Save entity' }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
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
    await user.type(name, 'Unsaved local name');
    await user.click(screen.getByRole('button', { name: 'Save entity' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Morgan is currently editing a section needed for this change.',
    );
    expect(alert).toHaveFocus();
    expect(name).toHaveValue('Unsaved local name');
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
        onSubmit={onSubmit}
      />,
    );

    const name = screen.getByRole('textbox', { name: 'Node type name' });
    await user.clear(name);
    await user.type(name, 'First draft');
    await user.click(screen.getByRole('button', { name: 'Save entity' }));
    await screen.findByText('Could not save this entity');

    await user.type(name, ' revised');
    await user.click(screen.getByRole('button', { name: 'Save entity' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls.map(([request]) => request.id)).toEqual([
      'blocked-intent',
      'revised-intent',
    ]);
  });

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
    const onSubmit = vi.fn<
      (request: CompoundEditRequest) => CompoundEditResult
    >(() => appliedResult());
    const { rerender } = render(
      <CodebookEntityEditor
        mode="update"
        sessionKey="open-live-change"
        createRequestId={() => 'request-live-change'}
        description="Update person"
        subject={NODE_SUBJECT}
        initialDraft={NODE_DOCUMENT}
        authoritativeDocument={NODE_DOCUMENT}
        onSubmit={onSubmit}
      />,
    );

    const name = screen.getByRole('textbox', { name: 'Node type name' });
    await user.clear(name);
    await user.type(name, 'Unsaved local name');

    const remoteDocument: SectionDoc = {
      ...NODE_DOCUMENT,
      icon: 'remote-icon',
    };
    rerender(
      <CodebookEntityEditor
        mode="update"
        sessionKey="open-live-change"
        createRequestId={() => 'request-live-change'}
        description="Update person"
        subject={NODE_SUBJECT}
        initialDraft={NODE_DOCUMENT}
        authoritativeDocument={remoteDocument}
        onSubmit={onSubmit}
      />,
    );

    expect(name).toHaveValue('Unsaved local name');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Newer codebook data is available',
    );
    expect(screen.getByRole('button', { name: 'Save entity' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Save entity' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
