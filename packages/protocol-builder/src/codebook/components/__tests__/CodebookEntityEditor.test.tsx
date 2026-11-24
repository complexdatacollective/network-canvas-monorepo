import {
  fireEvent,
  render as renderUnwrapped,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import NodeLabelField from '../../../fields/NodeLabelField.tsx';
import { ProtocolLocalizationProvider } from '../../../localization/ProtocolLocalization.tsx';
import type { CodebookSubject } from '../../../protocol-context.ts';
import { testTypeId, testVariableId } from '../../../testing/testId.ts';
import { CodebookEditorHost } from '../../__tests__/codebookEditorHost.tsx';
import { codebookRefusalMessage } from '../../compoundFailureCopy.ts';
import { NodeLabelFieldProvider } from '../../nodeLabelFieldSlot.ts';
import type { CodebookWriteOutcome } from '../../writes.ts';
import CodebookEntityEditor from '../CodebookEntityEditor.tsx';

const PERSON_ADULT = testTypeId('person:adult');
const FRIENDS = testTypeId('friends');
const PLACE = testTypeId('place');
const NEW_PERSON = testTypeId('new:person');
const NEW_RELATIONSHIP = testTypeId('new:relationship');
const AGE = testVariableId('age');

/** Every editor here edits a protocol written in English. */
function InEnglishProtocol({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <CodebookEditorHost>
      <ProtocolLocalizationProvider
        localization={{ defaultLocale: 'en', locales: ['en'] }}
      >
        {children}
      </ProtocolLocalizationProvider>
    </CodebookEditorHost>
  );
}

const render = (ui: ReactElement) =>
  renderUnwrapped(ui, { wrapper: InEnglishProtocol });

const NODE_SUBJECT = { entity: 'node', type: PERSON_ADULT } as const;
const PERSON_SECTION = sectionId({
  kind: 'codebookNode',
  typeId: PERSON_ADULT,
});

/** What a host says when it fails: the schema's own sentence about a path. */
const HOST_WORDS = 'Invalid input: expected object, received undefined';

const NODE_DOCUMENT: SectionDoc = {
  name: 'Person',
  color: 'node-color-seq-1',
  icon: 'add-a-person',
  shape: { default: 'circle' },
  variables: {
    [AGE]: {
      name: 'Age',
      type: 'number',
      component: 'Number',
    },
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

  it.each([
    {
      subject: NODE_SUBJECT,
      document: NODE_DOCUMENT,
      nameLabel: 'Node type name',
      example: '"Person", "Place", or "Organization"',
      placeholder: 'Enter a name for this node type...',
      colorLabel: 'Node color',
      colorHint: 'Choose a color for this node type.',
    },
    {
      subject: { entity: 'edge', type: FRIENDS } as const,
      document: {
        name: 'Friends',
        color: 'edge-color-seq-1',
        variables: {},
      },
      nameLabel: 'Edge type name',
      example: '"Friends" or "Colleagues"',
      placeholder: 'Enter a name for this edge type...',
      colorLabel: 'Edge color',
      colorHint: 'Choose a color for this edge type.',
    },
  ])(
    'names the $subject.entity type’s fields for the entity, as Architect did',
    ({ subject, document, ...copy }) => {
      render(
        <CodebookEntityEditor
          mode="update"
          sessionKey={`copy-${subject.entity}`}
          subject={subject}
          initialDraft={document}
          authoritativeDocument={document}
          existingEntityNames={[]}
          onSubmit={async () => applied()}
        />,
      );

      const name = screen.getByRole('textbox', { name: copy.nameLabel });
      expect(name).toHaveAttribute('placeholder', copy.placeholder);
      expect(name).toHaveAccessibleDescription(
        expect.stringContaining(copy.example),
      );
      expect(
        screen.getByRole('radiogroup', { name: copy.colorLabel }),
      ).toHaveAccessibleDescription(expect.stringContaining(copy.colorHint));
      expect(screen.queryByText(/Protocol color|color reference/)).toBeNull();
    },
  );

  /**
   * And it still commits from there. The save sits outside the `<form>`
   * element once it is in the footer, so it names the form it submits; a
   * control that lost that association would look right and do nothing.
   */
  it('saves from the footer control, which is outside the form element', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<SubmitEntity>(async () => applied());
    render(
      <CodebookEntityEditor
        mode="update"
        sessionKey="footer-submits"
        dialog={{ title: 'Edit this node type', open: true }}
        subject={NODE_SUBJECT}
        initialDraft={NODE_DOCUMENT}
        authoritativeDocument={NODE_DOCUMENT}
        existingEntityNames={[]}
        onSubmit={onSubmit}
      />,
    );

    const dialog = within(screen.getByRole('dialog'));
    const name = dialog.getByRole('textbox', { name: 'Node type name' });
    await user.clear(name);
    await user.type(name, 'Adult');

    const save = dialog.getByRole('button', { name: 'Save entity' });
    expect(save.closest('form')).toBeNull();
    await user.click(save);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      ...NODE_DOCUMENT,
      name: 'Adult',
    });
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
    // write it over the one the type actually has. Counted inside the colour
    // field, because the shape beside it is a group of swatches too and one of
    // those is legitimately checked.
    expect(
      within(screen.getByRole('radiogroup', { name: 'Node color' }))
        .getAllByRole('radio')
        .filter((swatch) => swatch.getAttribute('aria-checked') === 'true'),
    ).toHaveLength(1);
  });

  it.each([
    'Person.v2',
    'Works With',
    '友人',
    'amigo cercano',
    'Collègue',
    'Person/Place',
    'Person&Place',
  ])('accepts the entity name %j', async (typed) => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<SubmitEntity>(async () => applied());
    renderUpdateEditor(onSubmit);

    const name = screen.getByRole('textbox', { name: 'Node type name' });
    await user.clear(name);
    await user.type(name, typed);
    await user.click(screen.getByRole('button', { name: 'Save entity' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      ...NODE_DOCUMENT,
      name: typed,
    });
  });

  it('saves an entity name trimmed and in canonical form', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<SubmitEntity>(async () => applied());
    renderUpdateEditor(onSubmit);

    const name = screen.getByRole('textbox', { name: 'Node type name' });
    await user.clear(name);
    await user.type(name, `  ${'Collègue'.normalize('NFD')}  `);
    await user.click(screen.getByRole('button', { name: 'Save entity' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      ...NODE_DOCUMENT,
      name: 'Collègue',
    });
  });

  it.each([
    ['a tab', 'Person\tType'],
    ['a nul', `Person${String.fromCharCode(0)}Type`],
  ])('rejects an entity name holding %s', async (_, invalidName) => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<SubmitEntity>(async () => applied());
    renderUpdateEditor(onSubmit);

    const name = screen.getByRole('textbox', { name: 'Node type name' });
    fireEvent.change(name, { target: { value: invalidName } });
    await user.click(screen.getByRole('button', { name: 'Save entity' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        'A node type name cannot contain line breaks, tabs or other control characters.',
      ),
    ).toBeInTheDocument();
  });

  it('asks for a name where the name is only spaces', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<SubmitEntity>(async () => applied());
    renderUpdateEditor(onSubmit);

    const name = screen.getByRole('textbox', { name: 'Node type name' });
    await user.clear(name);
    await user.type(name, '   ');
    await user.click(screen.getByRole('button', { name: 'Save entity' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a type name.')).toBeInTheDocument();
    expect(
      screen.queryByText(/cannot contain line breaks/u),
    ).not.toBeInTheDocument();
  });

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

  /**
   * The icon is chosen from the renderer's own two sets, so an unrenderable
   * name can only ARRIVE in a type — authored elsewhere, or by a schema the
   * app has since moved on from. The refusal is what tells the researcher
   * their type carries one, and the picker is how they replace it.
   */
  it('rejects an icon the Fresco renderer cannot display', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<SubmitEntity>(async () => applied());
    const carriesUnknownIcon: SectionDoc = {
      ...NODE_DOCUMENT,
      icon: 'not-a-rendered-icon',
    };
    render(
      <CodebookEntityEditor
        mode="update"
        sessionKey="unknown-icon"
        subject={NODE_SUBJECT}
        initialDraft={carriesUnknownIcon}
        authoritativeDocument={carriesUnknownIcon}
        existingEntityNames={[]}
        onSubmit={onSubmit}
      />,
    );

    // Nothing the picker can show, so it offers the choice rather than
    // claiming the type has an icon it does not.
    const icon = screen.getByRole('combobox', { name: 'Icon' });
    expect(icon).toHaveTextContent('Select an icon…');

    await user.type(screen.getByRole('textbox', { name: /name/i }), '!');
    await user.click(screen.getByRole('button', { name: 'Save entity' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByText('Choose an icon supported by Network Canvas.'),
    ).toBeInTheDocument();
  });

  /** The regression the researcher reported: a name to type, not icons to see. */
  it('chooses the icon from the icons themselves, and stores the one picked', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<SubmitEntity>(async () => applied());
    renderUpdateEditor(onSubmit);

    const icon = screen.getByRole('combobox', { name: 'Icon' });
    expect(icon).toHaveTextContent('add-a-person');

    await user.click(icon);
    await user.type(
      screen.getByPlaceholderText('Search icons…'),
      'add-a-place',
    );
    await user.click(screen.getByRole('option', { name: /add-a-place/ }));

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Icon' })).toHaveTextContent(
        'add-a-place',
      );
    });

    await user.click(screen.getByRole('button', { name: 'Save entity' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ icon: 'add-a-place' }),
        undefined,
      );
    });
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
    expect(screen.getByRole('combobox', { name: 'Icon' })).toBeDisabled();
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
      subject: { entity: 'node', type: NEW_PERSON },
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
      subject: { entity: 'edge', type: NEW_RELATIONSHIP },
      draft: { name: 'Knows', color: 'edge-color-seq-2' },
      expected: {
        name: 'Knows',
        color: 'edge-color-seq-2',
        variables: {},
      },
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
        subject={{ entity: 'node', type: PLACE }}
        initialDraft={nextDocument}
        authoritativeDocument={nextDocument}
        existingEntityNames={[]}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Node type name' })).toHaveValue(
      'Place',
    );
    expect(screen.getByRole('combobox', { name: 'Icon' })).toHaveTextContent(
      'add-a-place',
    );
  });
});

describe('a node type’s Dynamic label', () => {
  const CODEBOOK = {
    node: {
      [PERSON_ADULT]: {
        name: 'Person',
        color: 'node-color-seq-1',
        icon: 'add-a-person',
        shape: { default: 'circle' },
        variables: {
          [AGE]: { name: 'Age', type: 'number', component: 'Number' },
        },
      },
    },
  } as const;

  const LABELLED: SectionDoc = {
    ...NODE_DOCUMENT,
    dynamicLabel: { text: { en: 'Friend' } },
  };

  const renderWithCodebook = (document: SectionDoc, onSubmit: SubmitEntity) =>
    render(
      <NodeLabelFieldProvider value={NodeLabelField}>
        <CodebookEntityEditor
          mode="update"
          sessionKey="label"
          subject={NODE_SUBJECT}
          initialDraft={document}
          authoritativeDocument={document}
          existingEntityNames={[]}
          codebook={CODEBOOK}
          onSubmit={onSubmit}
        />
      </NodeLabelFieldProvider>,
    );

  const labelSwitch = () =>
    screen.getByRole('switch', { name: 'Dynamic label' });

  it('is offered only where there is a codebook to write it against', () => {
    render(
      <NodeLabelFieldProvider value={NodeLabelField}>
        <CodebookEntityEditor
          mode="update"
          sessionKey="no-codebook"
          subject={NODE_SUBJECT}
          initialDraft={NODE_DOCUMENT}
          authoritativeDocument={NODE_DOCUMENT}
          existingEntityNames={[]}
          onSubmit={async () => applied()}
        />
      </NodeLabelFieldProvider>,
    );
    expect(
      screen.queryByRole('switch', { name: 'Dynamic label' }),
    ).not.toBeInTheDocument();
  });

  it('opens switched off on a type that holds no label, and on with one', () => {
    const { unmount } = renderWithCodebook(NODE_DOCUMENT, async () =>
      applied(),
    );
    expect(labelSwitch()).not.toBeChecked();
    unmount();
    renderWithCodebook(LABELLED, async () => applied());
    expect(labelSwitch()).toBeChecked();
  });

  it('refuses a save while it is switched on with nothing written', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<SubmitEntity>(async () => applied());
    renderWithCodebook(NODE_DOCUMENT, onSubmit);

    await user.click(labelSwitch());
    await user.click(screen.getByRole('button', { name: 'Save entity' }));

    expect(
      await screen.findByText('Write the label, or turn off Dynamic label.'),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('removes the stored label when it is switched off', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<SubmitEntity>(async () => applied());
    renderWithCodebook(LABELLED, onSubmit);

    await user.click(labelSwitch());
    await user.click(screen.getByRole('button', { name: 'Save entity' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty('dynamicLabel');
  });

  it('keeps the label through switching it off and on again in one edit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<SubmitEntity>(async () => applied());
    renderWithCodebook(LABELLED, onSubmit);

    await user.click(labelSwitch());
    await user.click(labelSwitch());
    // Back where it started, so there is nothing to save.
    expect(screen.getByRole('button', { name: 'Save entity' })).toBeDisabled();
  });
});
