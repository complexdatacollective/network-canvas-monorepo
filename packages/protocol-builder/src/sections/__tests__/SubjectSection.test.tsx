import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import IntroductionSection from '../IntroductionSection.tsx';
import PromptsSection from '../PromptsSection.tsx';
import SubjectSection from '../SubjectSection.tsx';
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

const codebookNodeNames = (
  sections: Readonly<Record<string, Record<string, unknown>>>,
): unknown[] =>
  Object.entries(sections)
    .filter(([id]) => id.startsWith('codebook:node:'))
    .map(([, document]) => document.name);

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

    await harness.roundTrip();
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

    await harness.user.click(
      screen.getByRole('radio', { name: 'family member' }),
    );

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

    await harness.user.click(
      screen.getByRole('radio', { name: 'family member' }),
    );
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

    await harness.user.click(
      screen.getByRole('radio', { name: 'family member' }),
    );
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
    await harness.roundTrip();
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

describe('creating the type a stage needs without leaving it', () => {
  it('puts the new type in the codebook and selects it here', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: nodeSubjectAndPrompts,
    });

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
   * The reason a researcher needs a new type is usually the work they have
   * just done, so the create has to survive an unsaved stage. The prompt they
   * added travels with the create and lands in the same host revision.
   */
  it('works after the stage has been edited, carrying that edit with it', async () => {
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

    expect(await screen.findByRole('radio', { name: 'Place' })).toBeChecked();
    const sections = harness.host.getSnapshot().protocolSections;
    expect(codebookNodeNames(sections)).toContain('Place');
    expect(sections['stage:name-generator-1']?.prompts).toHaveLength(2);
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

    expect(await screen.findByRole('radio', { name: 'Place' })).not.toBeNull();
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
