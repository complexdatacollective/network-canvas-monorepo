import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import type { CodebookSubject } from '../../../protocol-context.ts';
import { codebookRefusalMessage } from '../../compoundFailureCopy.ts';
import type { CodebookWriteOutcome } from '../../writes.ts';
import CodebookEntityEditor, {
  type CodebookEntityEditorProps,
} from '../CodebookEntityEditor.tsx';

const NODE_SUBJECT = { entity: 'node', type: 'person:adult' } as const;
const PERSON_SECTION = sectionId({
  kind: 'codebookNode',
  typeId: 'person:adult',
});

/** What a host says when it fails: the schema's own sentence about a path. */
const HOST_WORDS = 'Invalid input: expected object, received undefined';

const NODE_DOCUMENT: SectionDoc = {
  name: 'Person',
  color: 'node-color-seq-1',
  icon: 'add-a-person',
  shape: { default: 'circle' },
  variables: {
    age: { name: 'Age', type: 'number', component: 'Number' },
  },
};

const applied = (): CodebookWriteOutcome => ({
  status: 'applied',
  sectionId: PERSON_SECTION,
});

type SubmitEntity = (document: SectionDoc) => Promise<CodebookWriteOutcome>;

const renderUpdateEditor = (onSubmit: SubmitEntity) =>
  render(
    <CodebookEntityEditor
      mode="update"
      sessionKey="open-1"
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
      (outcome: Extract<CodebookWriteOutcome, { status: 'applied' }>) => void
    >();
  });

  it('does not submit an unchanged existing entity', () => {
    const onSubmit = vi.fn<SubmitEntity>(async () => applied());
    const { container } = render(
      <CodebookEntityEditor
        mode="update"
        sessionKey="unchanged"
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
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('updates an existing node while preserving variables and unrendered properties', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<SubmitEntity>(async () => applied());
    renderUpdateEditor(onSubmit);

    const name = screen.getByRole('textbox', { name: 'Node type name' });
    await user.clear(name);
    await user.type(name, 'Adult');
    await user.click(screen.getByRole('button', { name: 'Save entity' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      ...NODE_DOCUMENT,
      name: 'Adult',
    });
  });

  it('saves the palette position the researcher picked from the swatches', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<SubmitEntity>(async () => applied());
    renderUpdateEditor(onSubmit);

    expect(screen.getByRole('radio', { name: 'Neon Coral' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Neon Carrot' }));
    await user.click(screen.getByRole('button', { name: 'Save entity' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      ...NODE_DOCUMENT,
      color: 'node-color-seq-4',
    });
  });

  it('shows a stored colour the palette does not offer rather than any of the ones it does', () => {
    const onSubmit = vi.fn<SubmitEntity>(async () => applied());
    const document = { ...NODE_DOCUMENT, color: 'cat-color-seq-3' };
    render(
      <CodebookEntityEditor
        mode="update"
        sessionKey="outside-palette"
        subject={NODE_SUBJECT}
        initialDraft={document}
        authoritativeDocument={document}
        existingEntityNames={[]}
        onSubmit={onSubmit}
      />,
    );

    expect(
      screen.getByRole('radio', { name: 'Current color (cat-color-seq-3)' }),
    ).toBeChecked();
    // Nothing in the palette stands in for it: a swatch checked here would be
    // a colour the researcher never chose, and touching any other swatch would
    // write it over the one the type actually has.
    expect(
      screen
        .getAllByRole('radio')
        .filter((swatch) => swatch.getAttribute('aria-checked') === 'true'),
    ).toHaveLength(1);
  });

  it('accepts periods in a schema-valid entity name', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<SubmitEntity>(async () => applied());
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
      const onSubmit = vi.fn<SubmitEntity>(async () => applied());
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
    const onSubmit = vi.fn<SubmitEntity>(async () => applied());
    render(
      <CodebookEntityEditor
        mode="update"
        sessionKey="canonical-duplicate"
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
    const onSubmit = vi.fn<SubmitEntity>(async () => applied());
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
    const onSubmit = vi.fn<SubmitEntity>(async () => applied());
    const commonProps = {
      mode: 'update' as const,
      sessionKey: 'live-read-only',
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
    expected: SectionDoc;
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
      expected: {
        name: 'NewPerson',
        color: 'node-color-seq-2',
        icon: 'add-a-person',
        shape: { default: 'square' },
        variables: {},
      },
    },
    {
      label: 'edge',
      subject: { entity: 'edge', type: 'new:relationship' },
      draft: { name: 'Knows', color: 'edge-color-seq-2' },
      expected: { name: 'Knows', color: 'edge-color-seq-2', variables: {} },
    },
    {
      label: 'ego',
      subject: { entity: 'ego' },
      draft: {},
      expected: { variables: {} },
    },
  ])(
    'hands over the whole document a new $label section is created from',
    async ({ subject, draft, expected }) => {
      const user = userEvent.setup();
      const onSubmit = vi.fn<SubmitEntity>(async () => applied());
      const onApplied =
        vi.fn<
          (
            outcome: Extract<CodebookWriteOutcome, { status: 'applied' }>,
          ) => void
        >();
      render(
        <CodebookEntityEditor
          mode="create"
          sessionKey={`create-${subject.entity}`}
          subject={subject}
          initialDraft={draft}
          existingEntityNames={[]}
          onSubmit={onSubmit}
          onApplied={onApplied}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Save entity' }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
      expect(onSubmit.mock.calls[0]?.[0]).toEqual(expected);
      expect(onApplied).toHaveBeenCalledWith(applied());
    },
  );

  /**
   * A save that threw carries whatever the thing that threw had to say, and it
   * is written for whoever reads a log — "expected object, received undefined"
   * is about a path, and names neither what the researcher did nor what to do
   * next. Repeating it is how an authoring tool tells someone their work failed
   * for reasons it will not explain.
   */
  it('says what a failed save means when the write threw, never the words it used', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<SubmitEntity>(() => {
      throw new Error(HOST_WORDS);
    });
    renderUpdateEditor(onSubmit);

    const name = screen.getByRole('textbox', { name: 'Node type name' });
    await user.clear(name);
    await user.type(name, 'Adult');
    await user.click(screen.getByRole('button', { name: 'Save entity' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'This change could not be saved, and nothing was altered. Wait a moment and try again.',
    );
    expect(alert).not.toHaveTextContent(HOST_WORDS);
    // And it points nowhere: this alert is the first thing in the editor, and
    // nothing renders the host's account of what it refused, so a message
    // sending the researcher to "the details above" sends them to nothing.
    expect(alert).not.toHaveTextContent(/above/i);
    // The draft is still there to correct, as it is after any failure.
    expect(name).toHaveValue('Adult');
  });

  /**
   * The refusal reaches this editor encoded, so it is decoded HERE rather than
   * where it was raised — which is what lets it follow a change of language
   * while it stands. A renderer that showed the message as it arrived would put
   * the `@codaco/app-i18n/error/v1:` payload in front of the researcher.
   */
  it('keeps a refused draft open, reports the holder, and focuses the failure', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<SubmitEntity>(async () => ({
      status: 'refused',
      message: codebookRefusalMessage({
        kind: 'held',
        holders: ['Morgan'],
      }),
      refusal: { kind: 'held' },
    }));
    renderUpdateEditor(onSubmit);

    const name = screen.getByRole('textbox', { name: 'Node type name' });
    await user.clear(name);
    await user.type(name, 'UnsavedLocalName');
    await user.click(screen.getByRole('button', { name: 'Save entity' }));

    // A notice rather than an alert: a section somebody else is holding is not
    // a fault, and the change lands once they are finished.
    const alert = await screen.findByRole('status');
    expect(alert).toHaveTextContent(
      'Morgan is currently editing a section needed for this change.',
    );
    expect(alert).not.toHaveTextContent('@codaco/app-i18n/error/v1');
    expect(alert).toHaveFocus();
    expect(name).toHaveValue('UnsavedLocalName');
    expect(screen.getByRole('button', { name: 'Save entity' })).toBeEnabled();
  });

  it('resets from the next opening identity even when the component never unmounts', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<SubmitEntity>(async () => applied());
    const { rerender } = render(
      <CodebookEntityEditor
        mode="update"
        sessionKey="open-1"
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
});
