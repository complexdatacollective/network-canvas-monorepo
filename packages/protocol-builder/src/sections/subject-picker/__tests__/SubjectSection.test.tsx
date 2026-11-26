import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { COLOR_SEQUENCE_HUE_NAMES } from '@codaco/fresco-ui/form/fields/ColorPicker';
import { NodeColorSequence } from '@codaco/protocol-validation';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { newEntityDraft } from '../../../codebook/components/CodebookEntityEditorDialog.tsx';
import { useStageValue } from '../../../form/stageFormHooks.ts';
import {
  fixtureStageId,
  fixtureTypeId,
  loadFixtureStage,
} from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { testId, testTypeId } from '../../../testing/testId.ts';
import {
  TestPromptEditor,
  TestPromptPreview,
} from '../../__tests__/rowFixtures.tsx';
import NodeLayoutSection from '../../canvas-behaviours/NodeLayoutSection.tsx';
import PromptsSection from '../../PromptsSection.tsx';
import SubjectSection from '../SubjectSection.tsx';
import { changeSubjectTo } from './changeSubject.ts';

const PLACE = testTypeId('place');
const PERSON = fixtureTypeId('node', 'person');
const FAMILY_MEMBER = fixtureTypeId('node', 'family member');

/** Copy in the fixture protocol's only language, as schema 9 holds it. */
const en = (text: string) => ({ 'en-US': text });

type Harness = ReturnType<typeof renderStageEditor>;

const NAME_GENERATOR = sectionId({
  kind: 'stage',
  stageId: fixtureStageId('name-generator-1'),
});

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

/**
 * The type names the PROTOCOL holds.
 *
 * A codebook edit made inside a stage editor is part of that stage's draft, so
 * this says what has been SAVED: the place to prove that a type reached the
 * protocol only with the stage, or that nothing did.
 */
const nodeTypeNames = (harness: Harness): string[] =>
  Object.values(harness.hostCodebook().node ?? {}).map(({ name }) => name);

/**
 * The type names the editor offers: the protocol's, with the types the stage
 * is holding laid over them.
 */
const editorNodeTypeNames = (harness: Harness): string[] =>
  Object.values(harness.editorCodebook().node ?? {}).map(({ name }) => name);

const edgeTypeNames = (harness: Harness): string[] =>
  Object.values(harness.hostCodebook().edge ?? {}).map(({ name }) => name);

/** What the prompt list is showing, one entry per row. */
const promptRows = (): string[] =>
  within(screen.getByRole('list', { name: 'Prompts' }))
    .getAllByRole('listitem')
    .map((row) => row.textContent ?? '');

/**
 * The control that edits the filter rule a stage was seeded with.
 *
 * Named by the rule it edits, so it goes when the rule does — unlike the
 * filter section's own label and switch, which an emptied filter goes on
 * showing. Read with the hidden elements included so it can also be found
 * behind an open question.
 */
const seededFilterRule = (): HTMLElement[] =>
  screen.queryAllByRole('button', {
    name: 'Edit rule: person exists',
    hidden: true,
  });

/**
 * The type the picker is showing while a question stands over it.
 *
 * A dialog takes the editor out of the accessibility tree, so the chips the
 * researcher can still see behind it are only reachable with the hidden ones
 * included. Answers with the id rather than the element, so a failure names
 * the type the stage moved to instead of reporting an element that is not
 * checked.
 */
const pickedTypeBehindTheQuestion = (): string | undefined => {
  for (const radio of screen.getAllByRole('radio', { hidden: true })) {
    if (radio instanceof HTMLInputElement && radio.checked) return radio.value;
  }
  return undefined;
};

/** Shows the subject the stage is holding, as the stage would save it. */
function StageSubjectProbe() {
  const subject = useStageValue('subject');
  return (
    <output aria-label="Stage subject">
      {JSON.stringify(subject ?? null)}
    </output>
  );
}

describe('the section that says what a stage is about', () => {
  it('offers the protocol’s own node types, and nothing else', () => {
    renderStageEditor({
      stageId: fixtureStageId('name-generator-1'),
      sections: nodeSubjectAndPrompts,
    });

    expect(
      screen.getAllByRole('radio').map((radio) => radio.getAttribute('value')),
    ).toEqual([PERSON, FAMILY_MEMBER]);
    expect(screen.getByRole('radio', { name: 'person' })).toBeChecked();
  });

  it('mounts the stage filter beside it, as its own section', async () => {
    const harness = renderStageEditor({
      stageId: fixtureStageId('alter-edge-form-1'),
      sections: <SubjectSection entity="edge" filter />,
    });

    await waitFor(() => expect(harness.outline()).toHaveLength(2));
    expect(harness.outline().map((section) => section.title)).toEqual([
      'Edge setup',
      'Filter network',
    ]);
  });

  it('leaves the filter out when the stage does not offer one', async () => {
    const harness = renderStageEditor({
      stageId: fixtureStageId('name-generator-1'),
      sections: nodeSubjectAndPrompts,
    });

    await waitFor(() => expect(harness.outline()).toHaveLength(2));
    expect(harness.outline().map((section) => section.title)).toEqual([
      'Node setup',
      'Prompt collection',
    ]);
  });

  /**
   * The end of the same path `EntitySubjectPickerField` bridges: a picked EDGE type
   * reaches the stage as an edge subject. The two branches are written out
   * rather than computed from the entity, so the edge one has to be walked.
   *
   * The picker shows the type alone, so which BRANCH wrote it is read from the
   * stage's own schema: an edge interface refuses a node subject, and a save
   * faults the section that owns the subject. Here the save is refused for the
   * form the change threw away, and the type section is not what is wrong with
   * the stage.
   */
  it('writes an edge pick as the stage’s edge subject', async () => {
    const harness = renderStageEditor({
      stageId: fixtureStageId('alter-edge-form-1'),
      sections: <SubjectSection entity="edge" filter />,
    });

    await changeSubjectTo(harness.user, 'family_edge', 'Change the edge type');

    expect(
      await screen.findByRole('radio', { name: 'family_edge' }),
    ).toBeChecked();
    expect(await harness.submit()).toBeNull();
    expect(harness.outline()).toEqual([
      { title: 'Edge setup', state: 'Finished' },
      { title: 'Filter network', state: 'Switched off' },
    ]);
  });

  /**
   * The picker offers one type, and the stage stores its node types as a
   * list: a pick reaches the stage as a list holding that one type.
   */
  it('writes a one-element types list', async () => {
    const harness = renderStageEditor({
      stage: {
        id: fixtureStageId('name-generator-1'),
        type: 'NameGenerator' as const,
        fields: {
          label: en('Name Generator'),
          subject: { entity: 'node', types: [PERSON] },
        },
      },
      sections: (
        <>
          <SubjectSection entity="node" />
          <StageSubjectProbe />
        </>
      ),
    });

    await harness.user.click(
      screen.getByRole('radio', { name: 'family member' }),
    );

    await waitFor(() =>
      expect(
        JSON.parse(
          screen.getByRole('status', { name: 'Stage subject' }).textContent ??
            'null',
        ),
      ).toEqual({ entity: 'node', types: [FAMILY_MEMBER] }),
    );
  });

  it('saves the stage it opened, unchanged', async () => {
    const harness = renderStageEditor({
      stageId: fixtureStageId('alter-edge-form-1'),
      sections: <SubjectSection entity="edge" filter />,
    });

    // The stage's name and its edge form belong to sections this mount does
    // not include.
    await harness.roundTrip({ unowned: ['form'] });
  });
});

/**
 * A prompt naming the old type's variables means nothing against a different
 * type, so changing the subject throws the configuration away. It is the one
 * destructive thing this section does, and everything below is about what the
 * researcher is left holding once it has.
 */
describe('changing what a stage is about', () => {
  it('throws away the configuration that described the old type', async () => {
    const harness = renderStageEditor({
      stageId: fixtureStageId('name-generator-1'),
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
   * A bound list does not rebuild itself from the controls on screen: it
   * resolves every insertion against the document the editor is holding. A
   * reset that had not reached that document would be undone by the very next
   * row the researcher adds, which would bring the old type's prompts back
   * with it and save them.
   */
  it('throws it away for good, so the next row cannot bring it back', async () => {
    const harness = renderStageEditor({
      stageId: fixtureStageId('name-generator-1'),
      sections: nodeSubjectAndPrompts,
    });

    await changeSubjectTo(harness.user, 'family member');
    await waitFor(() =>
      expect(
        screen.queryByText('Who are the people you know?'),
      ).not.toBeInTheDocument(),
    );

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'Which family members?',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByText('Which family members?');

    // The whole list, not just "the old one is gone": a list rebuilt from the
    // document the reset failed to reach would hold both.
    expect(promptRows()).toEqual(['Which family members?']);
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
  harness: Harness,
  name: string,
): Promise<void> => {
  await harness.user.click(
    await screen.findByRole('button', { name: 'Create new node type' }),
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
  harness: Harness,
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
      stageId: fixtureStageId('name-generator-1'),
      sections: nodeSubjectAndPrompts,
    });

    await harness.user.click(
      await screen.findByRole('button', { name: 'Create new node type' }),
    );

    // The fixture protocol's own node types are what the next colour counts
    // past, so the draft under test is the one this codebook produces.
    const draft = newEntityDraft(
      'node',
      Object.keys(harness.hostCodebook().node ?? {}).length,
    );
    const color = draftString(draft, 'color');
    const shape = draftString(draft, 'shape', 'default');
    const icon = draftString(draft, 'icon');
    // Asserted before they are compared against: a draft that stopped
    // pre-filling one of these would answer '' here, and an empty control
    // would then match it.
    expect([color, shape, icon]).not.toContain('');

    expect(
      await screen.findByRole('textbox', { name: 'Node type name' }),
    ).toHaveValue('');
    // The palette names each swatch after its hue rather than its position, so
    // the swatch the draft arrives with is the one named for the hue standing
    // at its reference's place in the node sequence.
    const colorPosition =
      NodeColorSequence.findIndex((reference) => reference === color) + 1;
    expect(colorPosition).toBeGreaterThan(0);
    const hueName =
      COLOR_SEQUENCE_HUE_NAMES['node-color-seq']?.[colorPosition - 1]
        ?.defaultMessage;
    // Thrown rather than asserted, so the locator below keeps its exact name:
    // a missing hue is this test's own setup failing, not the palette. A
    // descriptor's `defaultMessage` is pre-parsed ICU as well as a string, and
    // a swatch name is always the latter.
    if (typeof hueName !== 'string') {
      throw new Error(
        `the node palette names no hue at position ${colorPosition}`,
      );
    }
    expect(screen.getByRole('radio', { name: hueName })).toBeChecked();
    // The shape is chosen from the shapes themselves, so the swatch named for
    // the one the draft arrives with is the one marked.
    expect(
      within(screen.getByRole('radiogroup', { name: 'Shape' })).getByRole(
        'radio',
        {
          name: `Select shape ${shape[0]?.toUpperCase() ?? ''}${shape.slice(1)}`,
        },
      ),
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('combobox', { name: 'Icon' })).toHaveTextContent(
      icon,
    );
  });

  it('holds the new type with the stage and selects it here', async () => {
    const harness = renderStageEditor({
      stageId: fixtureStageId('name-generator-1'),
      sections: nodeSubjectAndPrompts,
    });

    await createNodeTypeNamed(harness, 'Place');
    await useTheCreatedType(harness);

    // The type is part of the stage's draft: the editor offers it at once, and
    // the protocol learns of it when the stage is saved.
    await waitFor(() =>
      expect(editorNodeTypeNames(harness)).toContain('Place'),
    );
    expect(nodeTypeNames(harness)).not.toContain('Place');
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
   * edit has already joined the stage's draft by the time this is asked, and
   * nothing about it is undone by an answer about the stage.
   */
  it('asks before it moves a configured stage to the new type', async () => {
    const harness = renderStageEditor({
      stageId: fixtureStageId('name-generator-1'),
      sections: nodeSubjectAndPrompts,
    });

    await createNodeTypeNamed(harness, 'Place');

    expect(await screen.findByText('Change node type?')).toBeInTheDocument();
    // The type exists, and the stage has not moved.
    expect(editorNodeTypeNames(harness)).toContain('Place');
    expect(pickedTypeBehindTheQuestion()).toBe(PERSON);
    expect(
      screen.getByText('Who are the people you know?'),
    ).toBeInTheDocument();
    // Including the create dialog, which stays mounted underneath so that
    // focus has a live control to come back to — and offers the researcher
    // nothing while the question is the thing to answer.
    expect(screen.queryByRole('button', { name: 'Save entity' })).toBeNull();
  });

  it('keeps the stage on its own type when the researcher backs out', async () => {
    const harness = renderStageEditor({
      stageId: fixtureStageId('name-generator-1'),
      sections: nodeSubjectAndPrompts,
    });

    await createNodeTypeNamed(harness, 'Place');
    // Scoped to the question: the create dialog underneath has a Cancel of its
    // own, and naming which one this is says what the gesture means — backing
    // out of the SELECTION, not out of a create that has already happened.
    const question = await screen.findByRole('dialog', {
      name: 'Change node type?',
    });
    await harness.user.click(
      within(question).getByRole('button', { name: 'Cancel' }),
    );

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    // The new type is held and offered here — declining is about this stage's
    // choice, not about the type.
    expect(editorNodeTypeNames(harness)).toContain('Place');
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
      stageId: fixtureStageId('name-generator-1'),
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
    expect(screen.queryByText('Change node type?')).not.toBeInTheDocument();
  });

  /**
   * The reason a researcher needs a new type is usually the work they have
   * just done, so the create has to work on an unsaved stage — WITHOUT saving
   * it. The prompt stays theirs to finish and save; the type is held beside it
   * and goes to the host with whatever they eventually save.
   */
  it('works after the stage has been edited, and leaves that edit unsaved', async () => {
    const harness = renderStageEditor({
      stageId: fixtureStageId('name-generator-1'),
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

    await createNodeTypeNamed(harness, 'Place');
    await useTheCreatedType(harness);

    expect(await screen.findByRole('radio', { name: 'Place' })).toBeChecked();
    expect(editorNodeTypeNames(harness)).toContain('Place');
    // The stage the protocol holds is exactly what it was, and so is its
    // codebook: nothing was saved, so the prompt the researcher wrote was
    // never saved for them and neither was the type.
    expect(harness.protocolSections()[NAME_GENERATOR]?.prompts).toHaveLength(1);
    expect(nodeTypeNames(harness)).not.toContain('Place');
  });

  /**
   * The whole point of the rule. Changing the subject throws the old type's
   * configuration away, which is precisely when a researcher discovers they
   * need a type that does not exist — and precisely when the stage cannot be
   * saved. Making the type is only a change to the draft, so it is not judged
   * until the researcher asks to save, and an unfinished stage does not get in
   * its way.
   */
  it('creates a type while the stage is too incomplete to save', async () => {
    const harness = renderStageEditor({
      stageId: fixtureStageId('name-generator-1'),
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
    expect(editorNodeTypeNames(harness)).toContain('Place');
    // Nothing was said about the entity that could not be saved.
    expect(
      screen.queryByText('Could not save this entity'),
    ).not.toBeInTheDocument();
  });

  it('refuses a name the protocol already uses', async () => {
    const harness = renderStageEditor({
      stageId: fixtureStageId('name-generator-1'),
      sections: nodeSubjectAndPrompts,
    });

    await harness.user.click(
      await screen.findByRole('button', { name: 'Create new node type' }),
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
    expect(editorNodeTypeNames(harness)).toEqual(['person', 'family member']);
  });

  it('is not offered to a spectator', async () => {
    renderStageEditor({
      stageId: fixtureStageId('name-generator-1'),
      sections: nodeSubjectAndPrompts,
      readOnly: true,
    });

    // Awaited, because nothing tells the editor the stage is somebody else's
    // until the host answers its acquire.
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Create new node type' }),
      ).not.toBeInTheDocument(),
    );
  });
});

/**
 * The types are read from the protocol's own sections, so a change made
 * anywhere else appears here without this section doing anything.
 */
describe('a codebook that changes while the editor is open', () => {
  it('offers a type a collaborator added', async () => {
    const harness = renderStageEditor({
      stageId: fixtureStageId('name-generator-1'),
      sections: nodeSubjectAndPrompts,
    });

    harness.receiveCodebookUpdate({
      node: {
        [PLACE]: {
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
      ).toEqual([PERSON, FAMILY_MEMBER, PLACE]),
    );
    expect(screen.getByRole('radio', { name: 'Place' })).not.toBeChecked();
    // The researcher's own choice is untouched by someone else's addition.
    expect(screen.getByRole('radio', { name: 'person' })).toBeChecked();
  });

  it('stops offering a type a collaborator deleted', async () => {
    const harness = renderStageEditor({
      stageId: fixtureStageId('name-generator-1'),
      sections: nodeSubjectAndPrompts,
    });

    harness.receiveCodebookUpdate({ node: { [FAMILY_MEMBER]: null } });

    await waitFor(() =>
      expect(
        screen
          .getAllByRole('radio')
          .map((radio) => radio.getAttribute('value')),
      ).toEqual([PERSON]),
    );
    expect(screen.getByRole('radio', { name: 'person' })).toBeChecked();
  });
});

/**
 * Node and edge types share one namespace: the editor validates a new name
 * against both codebook maps.
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
      stageId: fixtureStageId('name-generator-1'),
      sections: nodeSubjectAndPrompts,
    });

    await harness.user.click(
      await screen.findByRole('button', { name: 'Create new node type' }),
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
    expect(editorNodeTypeNames(harness)).toEqual(['person', 'family member']);
  });

  it('refuses an edge name a node type already uses, whatever the case', async () => {
    const harness = renderStageEditor({
      stageId: fixtureStageId('alter-edge-form-1'),
      sections: edgeSubjectSection,
    });

    await harness.user.click(
      await screen.findByRole('button', { name: 'Create new edge type' }),
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
    expect(edgeTypeNames(harness)).toEqual(['family_edge', 'knows']);
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
  const CHANGE_TITLE = 'Change node type?';
  const CHANGE_DESCRIPTION =
    'Everything else on this stage describes the node type it works with now, and choosing a different type removes all of it.';
  const CHANGE_CONFIRM = 'Change the node type';

  it('asks first, and changes nothing while the question stands', async () => {
    const harness = renderStageEditor({
      stageId: fixtureStageId('name-generator-1'),
      sections: nodeSubjectAndPrompts,
    });

    await harness.user.click(
      screen.getByRole('radio', { name: 'family member' }),
    );

    expect(await screen.findByText(CHANGE_TITLE)).toBeInTheDocument();
    expect(screen.getByText(CHANGE_DESCRIPTION)).toBeInTheDocument();
    // The pick has not been made: the stage still shows the type and the
    // configuration it opened with.
    expect(pickedTypeBehindTheQuestion()).toBe(PERSON);
    expect(
      screen.getByText('Who are the people you know?'),
    ).toBeInTheDocument();
  });

  it('leaves the stage as it was when the researcher backs out', async () => {
    const harness = renderStageEditor({
      stageId: fixtureStageId('name-generator-1'),
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
    // And the stage still saves as the stage it opened as.
    await harness.roundTrip({ unowned: ['form'] });
  });

  it('throws it away once the researcher has said so', async () => {
    const harness = renderStageEditor({
      stageId: fixtureStageId('name-generator-1'),
      sections: nodeSubjectAndPrompts,
    });

    await changeSubjectTo(harness.user, 'family member', CHANGE_CONFIRM);

    await waitFor(() =>
      expect(
        screen.getByRole('radio', { name: 'family member' }),
      ).toBeChecked(),
    );
    expect(
      screen.queryByText('Who are the people you know?'),
    ).not.toBeInTheDocument();
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
        id: fixtureStageId('name-generator-1'),
        type: 'NameGenerator' as const,
        fields: {
          label: en('Name Generator'),
          subject: { entity: 'node', types: [PERSON] },
        },
      },
      sections: nodeSubjectAndPrompts,
    });

    await harness.user.click(
      screen.getByRole('radio', { name: 'family member' }),
    );

    // The pick went straight through, which it cannot do while a question
    // stands: the picker holds it back until one is answered.
    await waitFor(() =>
      expect(
        screen.getByRole('radio', { name: 'family member' }),
      ).toBeChecked(),
    );
    expect(screen.queryByText(CHANGE_TITLE)).not.toBeInTheDocument();
  });
});

/**
 * A stage does not have to have HAD a type for choosing one to cost the
 * researcher something.
 *
 * The reset throws away everything the stage is carrying whichever way the
 * subject moved, so work entered before a type was picked is lost by the first
 * choice exactly as later work is lost by a change. The picker used to read
 * "no subject yet" as "nothing to lose" and let that one through in silence;
 * the loss is judged by what the stage HOLDS, and the question follows that
 * judgement.
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
      label: en('Details'),
      filter: {
        rules: [
          {
            id: testId('rule-a'),
            type: 'node',
            options: { type: PERSON, operator: 'EXISTS' },
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
    expect(screen.queryByText('Change node type?')).not.toBeInTheDocument();
    // Nothing has moved behind it: no type is picked, and the rule written
    // before there was a type is still there.
    expect(pickedTypeBehindTheQuestion()).toBeUndefined();
    expect(seededFilterRule()).toHaveLength(1);
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
    expect(seededFilterRule()).toHaveLength(1);
  });

  it('throws it away once the researcher has said so', async () => {
    const harness = renderStageEditor({
      stage: configuredWithoutASubject,
      sections: nodeSubjectAndFilter,
    });

    await changeSubjectTo(harness.user, 'person', FIRST_CHOICE_CONFIRM);

    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'person' })).toBeChecked(),
    );
    expect(seededFilterRule()).toEqual([]);
    // The section is left switched on with nothing in it, which is what it
    // reports about itself.
    expect(harness.outline()).toEqual([
      { title: 'Node setup', state: 'Finished' },
      { title: 'Filter network', state: 'Not finished' },
    ]);
  });

  /**
   * The guard still turns on what the stage HOLDS: a stage carrying nothing
   * but its name is the ordinary case, and it is not asked.
   */
  it('does not ask when the stage really has nothing to lose', async () => {
    const harness = renderStageEditor({
      stage: { type: 'AlterForm' as const, fields: { label: en('Details') } },
      sections: nodeSubjectAndFilter,
    });

    await harness.user.click(screen.getByRole('radio', { name: 'person' }));

    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'person' })).toBeChecked(),
    );
    expect(screen.queryByText(FIRST_CHOICE_TITLE)).not.toBeInTheDocument();
  });

  it('does not ask for the first type on an interface that has defaults', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'NetworkComposer' as const,
        fields: {
          label: en('Build your network'),
          behaviours: { automaticLayout: true },
          background: { concentricCircles: 4, skewedTowardCenter: false },
        },
      },
      sections: nodeSubjectAndFilter,
    });

    await harness.user.click(screen.getByRole('radio', { name: 'person' }));

    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'person' })).toBeChecked(),
    );
    expect(screen.queryByText(FIRST_CHOICE_TITLE)).not.toBeInTheDocument();
  });

  it('still asks when a default has been changed', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'NetworkComposer' as const,
        fields: {
          label: en('Build your network'),
          behaviours: { automaticLayout: false },
          background: { concentricCircles: 4, skewedTowardCenter: false },
        },
      },
      sections: nodeSubjectAndFilter,
    });

    await harness.user.click(screen.getByRole('radio', { name: 'person' }));

    expect(await screen.findByText(FIRST_CHOICE_TITLE)).toBeInTheDocument();
    expect(pickedTypeBehindTheQuestion()).toBeUndefined();
  });

  it('asks when an unmounted sibling of a default holds an answer', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'NetworkComposer' as const,
        fields: {
          label: en('Build your network'),
          behaviours: { automaticLayout: true, freeDraw: true },
          background: { concentricCircles: 4, skewedTowardCenter: false },
        },
      },
      sections: (
        <>
          <SubjectSection entity="node" filter />
          <NodeLayoutSection />
        </>
      ),
    });

    await harness.user.click(screen.getByRole('radio', { name: 'person' }));

    expect(await screen.findByText(FIRST_CHOICE_TITLE)).toBeInTheDocument();
    expect(pickedTypeBehindTheQuestion()).toBeUndefined();
  });

  /**
   * A draft saved before it was checked can hold its subject in any shape.
   * The picker shows the one type a node subject lists, and no type for any
   * subject it cannot read as exactly one, rather than failing to render.
   */
  describe('a draft subject in any shape', () => {
    const NAME_GENERATOR_STAGE = loadFixtureStage('name-generator-1');
    const renderWithSubject = (subject: unknown) =>
      renderStageEditor({
        stage: {
          id: NAME_GENERATOR_STAGE.id,
          type: NAME_GENERATOR_STAGE.type,
          fields: { ...NAME_GENERATOR_STAGE.fields, subject },
        },
        sections: <SubjectSection entity="node" />,
      });
    const checkedTypes = () =>
      screen
        .getAllByRole('radio')
        .flatMap((radio) =>
          radio instanceof HTMLInputElement && radio.checked
            ? [radio.value]
            : [],
        );

    it('checks the one type a node subject lists', () => {
      renderWithSubject({ entity: 'node', types: [FAMILY_MEMBER] });
      expect(checkedTypes()).toEqual([FAMILY_MEMBER]);
    });

    it.each([
      ['two types', { entity: 'node', types: [PERSON, FAMILY_MEMBER] }],
      ['an empty list', { entity: 'node', types: [] }],
      ['a list holding a number', { entity: 'node', types: [1] }],
      ['the schema 8 shape', { entity: 'node', type: PERSON }],
      ['an edge subject', { entity: 'edge', type: PERSON }],
    ])('checks no type for a node subject with %s', (_, subject) => {
      renderWithSubject(subject);
      expect(checkedTypes()).toEqual([]);
    });
  });
});
