import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import IntroductionSection from '../IntroductionSection.tsx';
import PromptsSection from '../PromptsSection.tsx';
import SubjectSection, { NEW_ENTITY_DRAFT } from '../SubjectSection.tsx';
import { changeSubjectTo } from './changeSubject.ts';
import { TestPromptEditor, TestPromptPreview } from './rowFixtures.tsx';

const nodeSubjectAndPrompts = (
  <>
    <SubjectSection entity="node" />
    <PromptsSection
      PromptEditor={TestPromptEditor}
      PromptPreview={TestPromptPreview}
    />
  </>
);

/** One string out of the shared new-type draft, which is an open document. */
const draftString = (draft: unknown, ...keys: readonly string[]): string => {
  let current = draft;
  for (const key of keys) {
    current =
      typeof current === 'object' && current !== null
        ? Reflect.get(current, key)
        : undefined;
  }
  return typeof current === 'string' ? current : '';
};

const codebookNamesOf =
  (prefix: string) =>
  (sections: Readonly<Record<string, Record<string, unknown>>>): unknown[] =>
    Object.entries(sections)
      .filter(([id]) => id.startsWith(prefix))
      .map(([, document]) => document.name);

const codebookNodeNames = codebookNamesOf('codebook:node:');
const codebookEdgeNames = codebookNamesOf('codebook:edge:');

describe('the section that says what a stage is about', () => {
  it('offers the protocol’s own node types, and nothing else', () => {
    renderStageEditor({
      stageId: 'name-generator-1',
      sections: nodeSubjectAndPrompts,
    });

    expect(
      screen.getAllByRole('radio').map((radio) => radio.getAttribute('value')),
    ).toEqual(['person', 'family_member']);
    expect(screen.getByRole('radio', { name: 'person' })).toBeChecked();
  });

  it('mounts the stage filter beside it, as its own section', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-edge-form-1',
      sections: (
        <>
          <SubjectSection entity="edge" filter />
          <IntroductionSection />
        </>
      ),
    });

    await waitFor(() => expect(harness.outline()).toHaveLength(3));
    expect(harness.outline().map((section) => section.title)).toEqual([
      'Edge type',
      'Stage filter',
      'Task introduction',
    ]);
  });

  it('leaves the filter out when the stage does not offer one', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: nodeSubjectAndPrompts,
    });

    await waitFor(() => expect(harness.outline()).toHaveLength(2));
    expect(harness.outline().map((section) => section.title)).toEqual([
      'Node type',
      'Prompts',
    ]);
  });

  /**
   * The end of the same path `SubjectSelectField` bridges: a picked EDGE type
   * reaches the stage as an edge subject. The two branches are written out
   * rather than computed from the entity, so the edge one has to be walked.
   */
  it('writes an edge pick as the stage’s edge subject', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-edge-form-1',
      sections: <SubjectSection entity="edge" filter />,
    });

    await changeSubjectTo(harness.user, 'family_edge', 'Change the edge type');

    await waitFor(() =>
      expect(
        harness.session.getSnapshot().editedSection.fields.subject,
      ).toEqual({ entity: 'edge', type: 'family_edge' }),
    );
  });

  it('saves the stage it opened, unchanged', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-edge-form-1',
      sections: (
        <>
          <SubjectSection entity="edge" filter />
          <IntroductionSection />
        </>
      ),
    });

    // The stage's name and its edge form belong to sections this mount does
    // not include.
    await harness.roundTrip({ unowned: ['label', 'form'] });
  });
});

/**
 * A prompt naming the old type's variables means nothing against a different
 * type, so changing the subject throws the configuration away. It is the one
 * destructive thing this section does, and everything below is about telling
 * the researcher's own choice apart from the draft moving beneath them.
 */
describe('changing what a stage is about', () => {
  it('throws away the configuration that described the old type', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: nodeSubjectAndPrompts,
    });
    expect(
      screen.getByText('Who are the people you know?'),
    ).toBeInTheDocument();

    await changeSubjectTo(harness.user, 'family member');

    await waitFor(() =>
      expect(
        screen.queryByText('Who are the people you know?'),
      ).not.toBeInTheDocument(),
    );
    // And the stage cannot be saved until it has been configured again, rather
    // than being saved still carrying the previous type's prompts.
    expect(await harness.submit()).toBeNull();
  });

  /**
   * A bound list does not wait for the submit that flushes ordinary typing: it
   * resolves every insertion against the draft the SESSION holds. A reset that
   * lived only in the form store would be undone by the very next row the
   * researcher adds, which would rebuild the list from the old type's prompts
   * and save them.
   */
  it('throws it away in the session too, so the next row cannot bring it back', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: nodeSubjectAndPrompts,
    });

    await changeSubjectTo(harness.user, 'family member');
    await waitFor(() =>
      expect(
        screen.queryByText('Who are the people you know?'),
      ).not.toBeInTheDocument(),
    );
    expect(
      harness.session.getSnapshot().editedSection.fields,
    ).not.toHaveProperty('prompts');

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'Which family members?',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByText('Which family members?');

    expect(
      screen.queryByText('Who are the people you know?'),
    ).not.toBeInTheDocument();
    // The draft the list resolved its insertion against holds the new prompt
    // and nothing of the old type's, which is the only place that can be true:
    // the stage cannot be saved until it has a form for the new type.
    expect(harness.session.getSnapshot().editedSection.fields.prompts).toEqual([
      {
        id: expect.any(String) as unknown as string,
        text: 'Which family members?',
      },
    ]);
  });

  /**
   * The reset is ONE batch, so the stage the researcher had is one undo away —
   * the type they moved away from and everything that described it, together.
   * Restoring the configuration without the type it describes would leave the
   * stage in a state nobody chose.
   */
  it('is undone in one step, type and configuration together', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: nodeSubjectAndPrompts,
    });

    await changeSubjectTo(harness.user, 'family member');
    await waitFor(() =>
      expect(
        screen.queryByText('Who are the people you know?'),
      ).not.toBeInTheDocument(),
    );

    act(() => {
      harness.session.undo();
    });

    expect(
      await screen.findByText('Who are the people you know?'),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'person' })).toBeChecked();
    await harness.roundTrip({ unowned: ['label', 'form'] });
  });

  /**
   * An undo, a redo or a collaborator's change replaces the draft beneath the
   * form and brings the configuration that belongs to the subject it carries.
   * Resetting there would wipe the half of the change the researcher was
   * reaching for.
   */
  it('keeps the configuration a draft arriving from elsewhere brings with it', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: nodeSubjectAndPrompts,
    });

    // A collaborator switched the stage to the other type AND wrote the
    // prompts that go with it, in one authoritative revision.
    act(() => {
      harness.session.replaceAuthoritativeStage({
        fields: {
          label: 'Name Generator',
          subject: { entity: 'node', type: 'family_member' },
          form: {
            title: 'Add a family member',
            fields: [{ variable: 'name', prompt: 'Name?' }],
          },
          prompts: [{ id: 'prompt-remote', text: 'Which family members?' }],
        },
        manifestRevision: { sequence: 2n, hash: 'revision-2' },
      });
    });

    expect(
      await screen.findByText('Which family members?'),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'family member' })).toBeChecked();
  });
});

/**
 * The researcher creates a node type from inside the stage they are
 * configuring.
 *
 * Stops at the moment the type exists: what happens next is the subject moving
 * to it, which is the thing the tests below are about.
 */
const createNodeTypeNamed = async (
  harness: ReturnType<typeof renderStageEditor>,
  name: string,
): Promise<void> => {
  await harness.user.click(
    screen.getByRole('button', { name: 'Create a new node type' }),
  );
  await harness.user.type(
    await screen.findByRole('textbox', { name: 'Node type name' }),
    name,
  );
  await harness.user.click(screen.getByRole('button', { name: 'Save entity' }));
};

/**
 * Answers the question a configured stage raises before it moves to the type
 * the researcher has just created.
 *
 * The same question the picker asks, because it is the same loss: every test
 * that means "the researcher created a type and used it on a configured stage"
 * goes through both gestures, so none of them can pass by a route the
 * researcher does not have.
 */
const useTheCreatedType = async (
  harness: ReturnType<typeof renderStageEditor>,
  confirmLabel = 'Change the node type',
): Promise<void> => {
  await harness.user.click(
    await screen.findByRole('button', { name: confirmLabel }),
  );
};

describe('creating the type a stage needs without leaving it', () => {
  /**
   * The point of creating a type from inside a stage is to get back to
   * configuring the stage, so everything the schema requires is pre-filled and
   * the researcher only has to name it. Other sections that create a type from
   * inside a stage open on the same draft, which is why it is shared — and a
   * copy that drifted would ask those researchers for a colour and an icon
   * here and not there.
   */
  it('opens on the shared draft, so only the name is left to enter', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: nodeSubjectAndPrompts,
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Create a new node type' }),
    );

    const color = draftString(NEW_ENTITY_DRAFT.node, 'color');
    const shape = draftString(NEW_ENTITY_DRAFT.node, 'shape', 'default');
    const icon = draftString(NEW_ENTITY_DRAFT.node, 'icon');
    // Asserted before they are compared against: a draft that stopped
    // pre-filling one of these would answer '' here, and an empty control
    // would then match it.
    expect([color, shape, icon]).not.toContain('');

    expect(
      await screen.findByRole('textbox', { name: 'Node type name' }),
    ).toHaveValue('');
    expect(
      screen.getByRole('combobox', { name: 'Protocol color' }),
    ).toHaveValue(color);
    expect(screen.getByRole('combobox', { name: 'Default shape' })).toHaveValue(
      shape,
    );
    expect(screen.getByRole('textbox', { name: 'Interface icon' })).toHaveValue(
      icon,
    );
  });

  it('puts the new type in the codebook and selects it here', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: nodeSubjectAndPrompts,
    });

    await createNodeTypeNamed(harness, 'Place');
    await useTheCreatedType(harness);

    // The codebook change reached the host as one atomic edit, which is what
    // `requestCompoundEdit` exists for.
    await waitFor(() =>
      expect(
        codebookNodeNames(harness.host.getSnapshot().protocolSections),
      ).toContain('Place'),
    );
    // …and the stage now points at it, with the previous type's prompts gone.
    expect(await screen.findByRole('radio', { name: 'Place' })).toBeChecked();
    await waitFor(() =>
      expect(
        screen.queryByText('Who are the people you know?'),
      ).not.toBeInTheDocument(),
    );
  });

  /**
   * Creating a type and selecting it on a configured stage costs the
   * researcher exactly what picking a different type in the list costs — the
   * prompts, the form, the panels and the filter — so it is the same question,
   * asked at the same moment. The type is created either way: the codebook
   * edit has already been accepted by the host by the time this is asked, and
   * nothing about it is undone by an answer about the stage.
   */
  it('asks before it moves a configured stage to the new type', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: nodeSubjectAndPrompts,
    });

    await createNodeTypeNamed(harness, 'Place');

    expect(
      await screen.findByText('Change the node type?'),
    ).toBeInTheDocument();
    // The type exists, and the stage has not moved: read from the session,
    // which is where a reset would have landed first, because everything
    // behind the question is out of the accessibility tree while it stands.
    expect(
      codebookNodeNames(harness.host.getSnapshot().protocolSections),
    ).toContain('Place');
    const { fields } = harness.session.getSnapshot().editedSection;
    expect(fields.subject).toEqual({ entity: 'node', type: 'person' });
    expect(fields.prompts).toHaveLength(1);
    // Including the create dialog, which stays mounted underneath so that
    // focus has a live control to come back to — and offers the researcher
    // nothing while the question is the thing to answer.
    expect(screen.queryByRole('button', { name: 'Save entity' })).toBeNull();
  });

  it('keeps the stage on its own type when the researcher backs out', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: nodeSubjectAndPrompts,
    });

    await createNodeTypeNamed(harness, 'Place');
    // Scoped to the question: the create dialog underneath has a Cancel of its
    // own, and naming which one this is says what the gesture means — backing
    // out of the SELECTION, not out of a create that has already happened.
    const question = await screen.findByRole('dialog', {
      name: 'Change the node type?',
    });
    await harness.user.click(
      within(question).getByRole('button', { name: 'Cancel' }),
    );

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    // The new type is in the codebook and offered here — declining is about
    // this stage, not about the type.
    expect(
      codebookNodeNames(harness.host.getSnapshot().protocolSections),
    ).toContain('Place');
    expect(screen.getByRole('radio', { name: 'Place' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'person' })).toBeChecked();
    expect(
      screen.getByText('Who are the people you know?'),
    ).toBeInTheDocument();
  });

  /**
   * A question about nothing is one a researcher learns to dismiss without
   * reading — the rule the picker and the discard guard already follow. A
   * stage whose configuration has just been thrown away is the commonest
   * reason to create a type at all.
   */
  it('does not ask when the stage has nothing to lose', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: nodeSubjectAndPrompts,
    });

    await changeSubjectTo(harness.user, 'family member');
    await waitFor(() =>
      expect(
        screen.queryByText('Who are the people you know?'),
      ).not.toBeInTheDocument(),
    );

    await createNodeTypeNamed(harness, 'Place');

    expect(await screen.findByRole('radio', { name: 'Place' })).toBeChecked();
    expect(screen.queryByText('Change the node type?')).not.toBeInTheDocument();
  });

  /**
   * The reason a researcher needs a new type is usually the work they have
   * just done, so the create has to survive an unsaved stage — WITHOUT saving
   * it. The prompt stays theirs to finish and save; the codebook change goes
   * to the host on its own.
   */
  it('works after the stage has been edited, and leaves that edit unsaved', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: nodeSubjectAndPrompts,
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'And who else?',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByText('And who else?');
    expect(harness.pendingCommands()).toHaveLength(1);

    await createNodeTypeNamed(harness, 'Place');
    await useTheCreatedType(harness);

    expect(await screen.findByRole('radio', { name: 'Place' })).toBeChecked();
    const sections = harness.host.getSnapshot().protocolSections;
    expect(codebookNodeNames(sections)).toContain('Place');
    // The host's stage is exactly what it was: the create claimed nothing
    // about it, so the prompt the researcher wrote was never saved for them.
    expect(sections['stage:name-generator-1']?.prompts).toHaveLength(1);
  });

  /**
   * The whole point of the rule. Changing the subject throws the old type's
   * configuration away, which is precisely when a researcher discovers they
   * need a type that does not exist — and precisely when the stage cannot be
   * saved. A create that folded the stage into its request would be refused
   * here, in the protocol schema's words, for a stage nobody asked to save.
   */
  it('creates a type while the stage is too incomplete to save', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: nodeSubjectAndPrompts,
    });

    await changeSubjectTo(harness.user, 'family member');
    await waitFor(() =>
      expect(
        screen.queryByText('Who are the people you know?'),
      ).not.toBeInTheDocument(),
    );
    expect(await harness.submit()).toBeNull();

    await createNodeTypeNamed(harness, 'Place');

    expect(await screen.findByRole('radio', { name: 'Place' })).toBeChecked();
    expect(
      codebookNodeNames(harness.host.getSnapshot().protocolSections),
    ).toContain('Place');
    // Nothing was said about the entity that could not be saved.
    expect(
      screen.queryByText('Could not save this entity'),
    ).not.toBeInTheDocument();
  });

  it('refuses a name the protocol already uses', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: nodeSubjectAndPrompts,
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Create a new node type' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Node type name' }),
      'person',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Save entity' }),
    );

    expect(
      await screen.findByText('A type named "person" already exists.'),
    ).toBeInTheDocument();
    expect(
      codebookNodeNames(harness.host.getSnapshot().protocolSections),
    ).toEqual(['person', 'family member']);
  });

  it('is not offered to a spectator', () => {
    renderStageEditor({
      stageId: 'name-generator-1',
      sections: nodeSubjectAndPrompts,
      readOnly: true,
    });

    expect(
      screen.queryByRole('button', { name: 'Create a new node type' }),
    ).not.toBeInTheDocument();
  });
});

/**
 * The types are read from the editor's own protocol context, so a change made
 * anywhere else appears here without this section doing anything — and, above
 * all, without it writing that change back as if this session had made it.
 */
describe('a codebook that changes while the editor is open', () => {
  it('offers a type a collaborator added, without echoing a command', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: nodeSubjectAndPrompts,
    });
    expect(harness.pendingCommands()).toEqual([]);
    // Watched as well as counted: a write of a value the draft already holds
    // leaves no pending batch, so the batches alone cannot tell an editor that
    // stayed quiet apart from one that wrote and was ignored.
    const dispatch = vi.spyOn(harness.session, 'dispatch');

    harness.receiveCodebookUpdate({
      node: {
        place: {
          name: 'Place',
          color: 'node-color-seq-3',
          shape: { default: 'circle' },
          icon: 'Circle',
          variables: {},
        },
      },
    });

    // The whole offered set, not just "the new one exists": `findByRole`
    // throws when it finds nothing, so asserting it is not null asserts
    // nothing at all.
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('radio')
          .map((radio) => radio.getAttribute('value')),
      ).toEqual(['person', 'family_member', 'place']),
    );
    expect(screen.getByRole('radio', { name: 'Place' })).not.toBeChecked();
    expect(dispatch).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toEqual([]);
    // The researcher's own choice is untouched by someone else's addition.
    expect(screen.getByRole('radio', { name: 'person' })).toBeChecked();
  });

  it('stops offering a type a collaborator deleted', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: nodeSubjectAndPrompts,
    });

    const dispatch = vi.spyOn(harness.session, 'dispatch');
    harness.receiveCodebookUpdate({ node: { family_member: null } });

    await waitFor(() =>
      expect(
        screen.queryByRole('radio', { name: 'family member' }),
      ).not.toBeInTheDocument(),
    );
    expect(dispatch).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toEqual([]);
  });
});

/**
 * A collaborator takes the stage while the create dialog is open.
 *
 * The draft inside it is work the researcher has done and nowhere else: they
 * opened the dialog because the type they need does not exist yet, and the
 * name they were typing is the whole of it. Unmounting the editor with the
 * trigger that opened it throws that away without a word — and the researcher
 * who takes editing back has to start again without ever being told why.
 */
describe('editing taken away while the create dialog is open', () => {
  const openTheCreateDialog = async (
    harness: ReturnType<typeof renderStageEditor>,
  ) => {
    await harness.user.click(
      screen.getByRole('button', { name: 'Create a new node type' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Node type name' }),
      'Place',
    );
  };

  it('keeps the open editor, read-only, and hides only the trigger', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: nodeSubjectAndPrompts,
    });
    await openTheCreateDialog(harness);

    harness.setReadOnly();

    // The editor takes `readOnly` for exactly this: interaction stops, the
    // draft does not.
    const name = screen.getByRole('textbox', { name: 'Node type name' });
    expect(name).toHaveValue('Place');
    expect(name).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save entity' })).toBeDisabled();
    // The trigger goes, because a create nobody may start is not on offer.
    expect(
      screen.queryByRole('button', { name: 'Create a new node type' }),
    ).not.toBeInTheDocument();
  });

  /**
   * The way out is still there. Keeping the editor mounted would be worse than
   * unmounting it if the researcher were then stuck inside it — and the
   * trigger it would return focus to has gone with the lease, which Fresco's
   * `Dialog` answers by falling back to Base UI's own default.
   */
  it('can still be dismissed by the researcher who can no longer use it', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: nodeSubjectAndPrompts,
    });
    await openTheCreateDialog(harness);

    harness.setReadOnly();
    await harness.user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('finishes the create the researcher had started once editing comes back', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: nodeSubjectAndPrompts,
    });
    await openTheCreateDialog(harness);

    harness.setReadOnly();
    harness.setReadOnly(false);

    await harness.user.click(
      screen.getByRole('button', { name: 'Save entity' }),
    );

    await waitFor(() =>
      expect(
        codebookNodeNames(harness.host.getSnapshot().protocolSections),
      ).toContain('Place'),
    );
    await useTheCreatedType(harness);
    expect(await screen.findByRole('radio', { name: 'Place' })).toBeChecked();
  });
});

/**
 * A dismissal while the create is in flight.
 *
 * The request outlives the dialog: the handler awaiting it is still alive, and
 * a success arriving after the dialog has gone still selects the new type on
 * the stage — which throws away everything that described the old one. The
 * researcher sees the configuration of a stage they had closed a dialog on
 * disappear, for a type they never saw arrive.
 */
describe('dismissing the create dialog while it is submitting', () => {
  /** Holds the compound edit open, and hands back the release. */
  const holdTheCompoundEdit = (
    harness: ReturnType<typeof renderStageEditor>,
  ) => {
    const send = harness.session.requestCompoundEdit.bind(harness.session);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(harness.session, 'requestCompoundEdit').mockImplementation(
      async (request) => {
        await held;
        return send(request);
      },
    );
    return () => {
      release();
    };
  };

  const startTheCreate = async (
    harness: ReturnType<typeof renderStageEditor>,
  ) => {
    await harness.user.click(
      screen.getByRole('button', { name: 'Create a new node type' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Node type name' }),
      'Place',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Save entity' }),
    );
  };

  it('refuses every way out until the request has answered', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: nodeSubjectAndPrompts,
    });
    const release = holdTheCompoundEdit(harness);
    await startTheCreate(harness);

    // Escape, a press outside and the close button are the three routes the
    // researcher has left — Cancel disables itself — and all of them reach the
    // dialog through `closeDialog`.
    await harness.user.keyboard('{Escape}');
    await harness.user.click(document.body);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // …and the one that is a visible control is not offered at all, rather
    // than offered and inert.
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();

    release();
    await waitFor(() =>
      expect(
        codebookNodeNames(harness.host.getSnapshot().protocolSections),
      ).toContain('Place'),
    );
    await useTheCreatedType(harness);
    expect(await screen.findByRole('radio', { name: 'Place' })).toBeChecked();
  });

  /**
   * And the way out comes back. A refusal that outlived the request would
   * leave the researcher shut inside a dialog with nothing left to wait for.
   */
  it('can be dismissed again once the request has failed', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: nodeSubjectAndPrompts,
    });
    vi.spyOn(harness.session, 'requestCompoundEdit').mockResolvedValue({
      status: 'failed',
      reason: 'host-error',
      message: 'expected object, received undefined',
    });

    await startTheCreate(harness);
    await screen.findByText(
      'The protocol would not be valid with this change, so nothing was saved. Adjust this type and try again, or close this and come back once the rest of the stage is filled in.',
    );

    await harness.user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });
});

/**
 * Node and edge types share one namespace, which is what Architect has always
 * enforced (`TypeEditor` validates a new name against both codebook maps).
 *
 * A node named like an edge is two different things a researcher cannot tell
 * apart afterwards: the codebook lists them by name, every export names them,
 * and a rule or a form naming one of them reads as naming the other. The
 * confusable pair is the worse half — an exact duplicate at least looks wrong
 * on sight, while a name differing only in case or in a Unicode form the
 * comparison folds together looks like the type the researcher meant.
 */
describe('naming a new type', () => {
  const edgeSubjectSection = <SubjectSection entity="edge" filter />;

  it('refuses a node name an edge type already uses', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: nodeSubjectAndPrompts,
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Create a new node type' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Node type name' }),
      'knows',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Save entity' }),
    );

    expect(
      await screen.findByText('A type named "knows" already exists.'),
    ).toBeInTheDocument();
    expect(
      codebookNodeNames(harness.host.getSnapshot().protocolSections),
    ).toEqual(['person', 'family member']);
  });

  it('refuses an edge name a node type already uses, whatever the case', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-edge-form-1',
      sections: edgeSubjectSection,
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Create a new edge type' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Edge type name' }),
      'Person',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Save entity' }),
    );

    // The editor folds case and Unicode form together on purpose, so this is
    // the pair that would otherwise have been committed: two types nobody
    // reading the codebook could tell apart.
    expect(
      await screen.findByText('A type named "Person" already exists.'),
    ).toBeInTheDocument();
    expect(
      codebookEdgeNames(harness.host.getSnapshot().protocolSections),
    ).toEqual(['family_edge', 'knows']);
  });
});

/**
 * The one destructive thing this section does, and the researcher gets to say
 * so first.
 *
 * A radio is a single click, and the click throws away every prompt, form,
 * panel and filter the stage carried. Architect has always asked before it
 * (`NodeType`'s `promptBeforeChange`), and this package already asks before
 * the far smaller loss of switching a capability off, so a stage-wide reset
 * that happens on a mis-click is out of step with both.
 */
describe('changing a subject the stage is configured for', () => {
  const CHANGE_TITLE = 'Change the node type?';
  const CHANGE_DESCRIPTION =
    'Everything else on this stage describes the node type it works with now, and choosing a different type removes all of it.';
  const CHANGE_CONFIRM = 'Change the node type';

  it('asks first, and changes nothing while the question stands', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: nodeSubjectAndPrompts,
    });

    await harness.user.click(
      screen.getByRole('radio', { name: 'family member' }),
    );

    expect(await screen.findByText(CHANGE_TITLE)).toBeInTheDocument();
    expect(screen.getByText(CHANGE_DESCRIPTION)).toBeInTheDocument();
    // The pick has not been made: the stage still holds the type and the
    // configuration it opened with. The editor behind the question is out of
    // the accessibility tree while it stands, so this is read from the
    // session — which is where a reset would have landed first.
    const { fields } = harness.session.getSnapshot().editedSection;
    expect(fields.subject).toEqual({ entity: 'node', type: 'person' });
    expect(fields.prompts).toHaveLength(1);
    expect(harness.pendingCommands()).toEqual([]);
  });

  it('leaves the stage as it was when the researcher backs out', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: nodeSubjectAndPrompts,
    });

    await harness.user.click(
      screen.getByRole('radio', { name: 'family member' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Cancel' }),
    );

    await waitFor(() =>
      expect(screen.queryByText(CHANGE_TITLE)).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('radio', { name: 'person' })).toBeChecked();
    expect(
      screen.getByText('Who are the people you know?'),
    ).toBeInTheDocument();
    expect(harness.pendingCommands()).toEqual([]);
    // And the stage still saves as the stage it opened as.
    await harness.roundTrip({ unowned: ['label', 'form'] });
  });

  it('throws it away once the researcher has said so', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: nodeSubjectAndPrompts,
    });

    await changeSubjectTo(harness.user, 'family member', CHANGE_CONFIRM);

    await waitFor(() =>
      expect(
        screen.queryByText('Who are the people you know?'),
      ).not.toBeInTheDocument(),
    );
    expect(harness.session.getSnapshot().editedSection.fields.subject).toEqual({
      entity: 'node',
      type: 'family_member',
    });
  });

  /**
   * A question about nothing is one a researcher learns to dismiss without
   * reading — the rule the discard guard already states. A stage that has just
   * been created carries its name and its type and nothing else, and choosing
   * the type it is for is the first thing the researcher does with it.
   */
  it('does not ask about a stage that has nothing to lose', async () => {
    const harness = renderStageEditor({
      stage: {
        id: 'name-generator-1',
        type: 'NameGenerator' as const,
        fields: {
          label: 'Name Generator',
          subject: { entity: 'node', type: 'person' },
        },
      },
      sections: nodeSubjectAndPrompts,
    });

    await harness.user.click(
      screen.getByRole('radio', { name: 'family member' }),
    );

    await waitFor(() =>
      expect(
        harness.session.getSnapshot().editedSection.fields.subject,
      ).toEqual({ entity: 'node', type: 'family_member' }),
    );
    expect(screen.queryByText(CHANGE_TITLE)).not.toBeInTheDocument();
  });
});

/**
 * A stage does not have to have HAD a type for choosing one to cost the
 * researcher something.
 *
 * The reset throws away everything the stage is carrying whichever way the
 * subject moved — the same keys, the same batch — so work entered before a
 * type was picked is lost by the first choice exactly as later work is lost by
 * a change. The picker used to read "no subject yet" as "nothing to lose" and
 * let that one through in silence; the loss is judged by what the stage HOLDS,
 * and the question follows that judgement.
 *
 * The words differ, because what is true differs: there is no type the rest of
 * the stage describes, so the sentence about replacing one would be about a
 * change that is not happening.
 */
describe('choosing a type for a stage that has never had one', () => {
  const FIRST_CHOICE_TITLE = 'Choose the node type?';
  const FIRST_CHOICE_DESCRIPTION =
    'Everything else on this stage was configured without a node type, and choosing one removes all of it.';
  const FIRST_CHOICE_CONFIRM = 'Choose the node type';

  /**
   * A filter written before the type was chosen — the one section this package
   * mounts beside the picker without waiting on a subject, and so the way a
   * researcher reaches this state without doing anything unusual.
   */
  const configuredWithoutASubject = {
    type: 'AlterForm' as const,
    fields: {
      label: 'Details',
      filter: {
        rules: [
          {
            id: 'rule-a',
            type: 'node',
            options: { type: 'person', operator: 'EXISTS' },
          },
        ],
      },
    },
  };

  const nodeSubjectAndFilter = <SubjectSection entity="node" filter />;

  it('asks first, and changes nothing while the question stands', async () => {
    const harness = renderStageEditor({
      stage: configuredWithoutASubject,
      sections: nodeSubjectAndFilter,
    });

    await harness.user.click(screen.getByRole('radio', { name: 'person' }));

    expect(await screen.findByText(FIRST_CHOICE_TITLE)).toBeInTheDocument();
    // Its own words, not the ones about replacing a type the stage does not
    // have: the two questions share a definition, not a sentence.
    expect(screen.getByText(FIRST_CHOICE_DESCRIPTION)).toBeInTheDocument();
    expect(screen.queryByText('Change the node type?')).not.toBeInTheDocument();
    // Read from the session, which is where a reset would have landed first:
    // everything behind the question is out of the accessibility tree while it
    // stands.
    const { fields } = harness.session.getSnapshot().editedSection;
    expect(fields.subject).toBeUndefined();
    expect(fields.filter).toBeDefined();
    expect(harness.pendingCommands()).toEqual([]);
  });

  it('leaves the stage as it was when the researcher backs out', async () => {
    const harness = renderStageEditor({
      stage: configuredWithoutASubject,
      sections: nodeSubjectAndFilter,
    });

    await harness.user.click(screen.getByRole('radio', { name: 'person' }));
    await harness.user.click(
      await screen.findByRole('button', { name: 'Cancel' }),
    );

    await waitFor(() =>
      expect(screen.queryByText(FIRST_CHOICE_TITLE)).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('radio', { name: 'person' })).not.toBeChecked();
    const { fields } = harness.session.getSnapshot().editedSection;
    expect(fields.subject).toBeUndefined();
    expect(fields.filter).toBeDefined();
    expect(harness.pendingCommands()).toEqual([]);
  });

  it('throws it away once the researcher has said so', async () => {
    const harness = renderStageEditor({
      stage: configuredWithoutASubject,
      sections: nodeSubjectAndFilter,
    });

    await changeSubjectTo(harness.user, 'person', FIRST_CHOICE_CONFIRM);

    await waitFor(() =>
      expect(
        harness.session.getSnapshot().editedSection.fields.subject,
      ).toEqual({ entity: 'node', type: 'person' }),
    );
    expect(
      harness.session.getSnapshot().editedSection.fields.filter,
    ).toBeUndefined();
  });

  /**
   * The guard still turns on what the stage HOLDS: a stage carrying nothing
   * but its name is the ordinary case, and it is not asked.
   */
  it('does not ask when the stage really has nothing to lose', async () => {
    const harness = renderStageEditor({
      stage: { type: 'AlterForm' as const, fields: { label: 'Details' } },
      sections: nodeSubjectAndFilter,
    });

    await harness.user.click(screen.getByRole('radio', { name: 'person' }));

    await waitFor(() =>
      expect(
        harness.session.getSnapshot().editedSection.fields.subject,
      ).toEqual({ entity: 'node', type: 'person' }),
    );
    expect(screen.queryByText(FIRST_CHOICE_TITLE)).not.toBeInTheDocument();
  });
});
