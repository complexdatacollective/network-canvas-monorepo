import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { sectionId } from '@codaco/studio-sync/taxonomy';

import type { CodebookSubject } from '../../../protocol-context.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';
import CodebookVariableValidationSection from '../CodebookVariableValidationSection.tsx';

const EGO: CodebookSubject = { entity: 'ego' };
const EGO_SECTION = sectionId({ kind: 'codebookEgo' });
const PERSON: CodebookSubject = { entity: 'node', type: 'person' };

/**
 * The section over one attribute, inside a stage editor.
 *
 * It reads the codebook and writes to it under the stage editor's own host, so
 * it is mounted the way every other section is rather than rendered bare: the
 * point of the surface is that the write reaches the protocol.
 */
const open = (
  subject: CodebookSubject,
  variableId: string | undefined,
  options: Readonly<{ readOnly?: true }> = {},
) =>
  renderStageEditor({
    stageId: 'ego-form-1',
    ...options,
    sections: (
      <CodebookVariableValidationSection
        subject={subject}
        variableId={variableId}
      />
    ),
  });

const COMPONENTS: Readonly<Record<string, string>> = {
  text: 'Text',
  number: 'Number',
  boolean: 'Boolean',
};

/**
 * A node type holding two attributes of the kind given.
 *
 * Two, because a comparison rule is the one rule a researcher can switch on
 * and leave unanswered, and it is offered only where another attribute of the
 * same kind could satisfy it.
 */
const personHolding = (type: string) => ({
  node: {
    person: {
      name: 'person',
      color: 'node-color-seq-1',
      icon: 'add-a-person',
      shape: { default: 'circle' },
      variables: {
        story: {
          name: 'story',
          type,
          component: COMPONENTS[type],
        },
        retelling: {
          name: 'retelling',
          type,
          component: COMPONENTS[type],
        },
      },
    },
  },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const egoValidation = (
  harness: StageEditorHarness,
  variableId: string,
): unknown =>
  Reflect.get(
    harness.hostCodebook().ego?.variables?.[variableId] ?? {},
    'validation',
  );

/** The rules the EDITOR shows for an ego attribute: the protocol's plus the stage's held changes. */
const egoEditorValidation = (
  harness: StageEditorHarness,
  variableId: string,
): unknown =>
  Reflect.get(
    harness.editorCodebook().ego?.variables?.[variableId] ?? {},
    'validation',
  );

const personEditorValidation = (
  harness: StageEditorHarness,
  variableId: string,
): unknown =>
  Reflect.get(
    harness.editorCodebook().node?.person?.variables?.[variableId] ?? {},
    'validation',
  );

const personValidation = (
  harness: StageEditorHarness,
  variableId: string,
): unknown =>
  Reflect.get(
    harness.hostCodebook().node?.person?.variables?.[variableId] ?? {},
    'validation',
  );

describe('the rules one codebook attribute’s answers have to satisfy', () => {
  /**
   * Every participant answers a question about themselves exactly once, so
   * there is no second answer for one of theirs to be unique against — the
   * schema's own mask says so, and Architect drops the rule for ego too.
   */
  it('does not offer uniqueness for the participant’s own attributes', async () => {
    const harness = open(EGO, 'ego_name');

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Validation' }),
    );

    expect(
      await screen.findByRole('switch', { name: 'Required answer' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Minimum text length' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('switch', { name: 'Unique value' }),
    ).not.toBeInTheDocument();
  });

  /**
   * The rules belong to the codebook, but changing them here is part of the
   * researcher's edit of the stage: the editor shows them at once, the protocol
   * only holds them once the stage is saved.
   */
  it('keeps a rule for the attribute it was asked about with the stage, and saves it with the stage', async () => {
    const harness = open(EGO, 'ego_name');

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Validation' }),
    );
    await harness.user.click(
      await screen.findByRole('switch', { name: 'Required answer' }),
    );

    expect(egoEditorValidation(harness, 'ego_name')).toEqual({
      required: true,
    });
    expect(egoValidation(harness, 'ego_name')).toBeUndefined();

    expect(await harness.submit()).not.toBeNull();
    expect(egoValidation(harness, 'ego_name')).toEqual({ required: true });
  });

  it('discards a rule with the stage when the stage is cancelled', async () => {
    const harness = open(EGO, 'ego_name');

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Validation' }),
    );
    await harness.user.click(
      await screen.findByRole('switch', { name: 'Required answer' }),
    );
    expect(egoEditorValidation(harness, 'ego_name')).toEqual({
      required: true,
    });

    await harness.cancel();

    expect(egoValidation(harness, 'ego_name')).toBeUndefined();
  });

  /**
   * Nothing to be ruled is nothing to say: a field with no attribute chosen,
   * or one still holding an attribute a collaborator has deleted, has its own
   * message about that and a rule section beside it would be a second, worse
   * explanation of the same thing.
   */
  it('renders nothing without an attribute to be about', async () => {
    const harness = open(EGO, undefined);

    // The editor is on screen and its lock answered, so nothing here is
    // waiting on a render that has not happened yet.
    await harness.opened();
    expect(
      screen.queryByRole('switch', { name: 'Validation' }),
    ).not.toBeInTheDocument();
  });

  /**
   * A rule switched on but not yet answered is held on screen rather than in
   * the codebook, so nothing about a COLLABORATOR changing the kind of answer
   * takes it away. Left where it was it is a rule the new kind's rows do not
   * draw and the schema will not accept, so every later change is refused over
   * a row nobody can see and the section silently stops keeping anything.
   */
  it('drops a half-set rule the new kind of answer has no room for', async () => {
    const harness = open(PERSON, 'story');
    harness.receiveCodebookUpdate(personHolding('number'));

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Validation' }),
    );
    // Switched on and not answered, so it is held on screen and never
    // written: the codebook still says this attribute has no rules.
    await harness.user.click(
      await screen.findByRole('switch', {
        name: 'Less than another attribute',
      }),
    );
    expect(personEditorValidation(harness, 'story')).toBeUndefined();

    harness.receiveCodebookUpdate(personHolding('boolean'));
    await waitFor(() =>
      expect(
        screen.queryByRole('switch', {
          name: 'Less than another attribute',
        }),
      ).not.toBeInTheDocument(),
    );

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Required answer' }),
    );

    await waitFor(() =>
      expect(personEditorValidation(harness, 'story')).toEqual({
        required: true,
      }),
    );
  });

  /**
   * The rules are the codebook's, but the gesture that changes them is made
   * inside a stage this researcher may only be reading — and a spectator who
   * could still clear an attribute's rules would be writing to the protocol
   * from a surface that told them they could not.
   */
  it('offers no change on a stage this researcher may only read', async () => {
    const harness = open(EGO, 'ego_name', { readOnly: true });

    await harness.opened();
    expect(
      await screen.findByRole('switch', { name: 'Validation' }),
    ).toBeDisabled();
  });

  it('renders nothing for an attribute the codebook does not have', async () => {
    const harness = open(PERSON, 'deleted-attribute');

    await harness.opened();
    expect(
      screen.queryByRole('switch', { name: 'Validation' }),
    ).not.toBeInTheDocument();
  });
});

/**
 * A rule another editor wrote, in the protocol but NOT yet delivered here.
 *
 * Written straight into the store and deliberately outside `act`, so the
 * channel has not turned and this section is still rendering the rules it read
 * when it opened — which is the state a stage save has to survive.
 */
const collaboratorRules = (
  harness: StageEditorHarness,
  validation: Readonly<Record<string, unknown>>,
): void => {
  const current = harness.host.store.read(EGO_SECTION).document;
  const variables = isRecord(current.variables) ? current.variables : {};
  const ego_name = isRecord(variables.ego_name) ? variables.ego_name : {};
  harness.host.store.applyAsCollaborator(EGO_SECTION, {
    ...current,
    variables: { ...variables, ego_name: { ...ego_name, validation } },
  });
};

describe('rules changed while a collaborator is changing the same codebook', () => {
  /**
   * The researcher's edit is the KEY they touched. A collaborator's rule on
   * the same attribute, added after this editor opened, is kept when the stage
   * is saved rather than deleted by a map written whole.
   */
  it('keeps a rule a collaborator added, when the stage is saved', async () => {
    const harness = open(EGO, 'ego_name');

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Validation' }),
    );
    await screen.findByRole('switch', { name: 'Required answer' });
    collaboratorRules(harness, { minLength: 3 });
    fireEvent.click(screen.getByRole('switch', { name: 'Required answer' }));

    expect(await harness.submit()).not.toBeNull();
    expect(egoValidation(harness, 'ego_name')).toEqual({
      minLength: 3,
      required: true,
    });
  });

  /**
   * The editor shows the rules it holds over the protocol's current ones, so
   * the rule the collaborator added reaches the screen and the NEXT edit is
   * made against it rather than deleting it.
   */
  it('brings the collaborator’s rule to the screen, so the next edit keeps it', async () => {
    const harness = open(EGO, 'ego_name');

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Validation' }),
    );
    await screen.findByRole('switch', { name: 'Required answer' });
    collaboratorRules(harness, { minLength: 3 });
    fireEvent.click(screen.getByRole('switch', { name: 'Required answer' }));

    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Minimum text length' }),
      ).toBeChecked(),
    );

    fireEvent.click(screen.getByRole('switch', { name: 'Required answer' }));

    expect(await harness.submit()).not.toBeNull();
    expect(egoValidation(harness, 'ego_name')).toEqual({ minLength: 3 });
  });

  /**
   * A rule switched on and straight back off is two edits to the stage's
   * draft; the draft ends where the protocol started, so there is nothing to
   * save for it.
   */
  it('holds nothing when a rule is switched on and straight back off', async () => {
    const harness = open(EGO, 'ego_name');

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Validation' }),
    );
    await screen.findByRole('switch', { name: 'Required answer' });
    fireEvent.click(screen.getByRole('switch', { name: 'Required answer' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Required answer' }));

    expect(egoEditorValidation(harness, 'ego_name')).toBeUndefined();
    expect(
      screen.getByRole('switch', { name: 'Required answer' }),
    ).not.toBeChecked();
    expect(await harness.submit()).not.toBeNull();
    expect(egoValidation(harness, 'ego_name')).toBeUndefined();
  });

  it('clears a rule just switched on when the section is switched off', async () => {
    const harness = open(EGO, 'ego_name');

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Validation' }),
    );
    await screen.findByRole('switch', { name: 'Required answer' });
    fireEvent.click(screen.getByRole('switch', { name: 'Required answer' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Validation' }));

    await waitFor(() =>
      expect(egoEditorValidation(harness, 'ego_name')).toBeUndefined(),
    );
    expect(await harness.submit()).not.toBeNull();
    expect(egoValidation(harness, 'ego_name')).toBeUndefined();
  });

  /**
   * Nothing is locked while the researcher edits, so a colleague holding the
   * codebook is not met until the stage is saved. The save is refused naming
   * them, the rule stays in the draft, and saving again once they are done
   * lands it.
   */
  it('refuses the stage save naming the colleague holding the codebook, keeps the rule, and saves once they are done', async () => {
    const harness = open(EGO, 'ego_name');
    await harness.opened();
    const robin = harness.host.asCollaborator({
      sessionId: 'session-2',
      userId: 'user-2',
      displayName: 'Robin',
    });
    await robin.rpcCall('AcquireLock', {
      protocolId: harness.host.protocolId,
      sectionId: EGO_SECTION,
    });

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Validation' }),
    );
    await harness.user.click(
      await screen.findByRole('switch', { name: 'Required answer' }),
    );
    // No refusal while editing.
    expect(
      screen.queryByText(
        'Robin is currently editing a section needed for this change.',
      ),
    ).not.toBeInTheDocument();

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(
        'Robin is currently editing a section needed for this change.',
      ),
    ).toBeInTheDocument();
    expect(egoValidation(harness, 'ego_name')).toBeUndefined();
    expect(egoEditorValidation(harness, 'ego_name')).toEqual({
      required: true,
    });

    await robin.rpcCall('ReleaseLock', {
      protocolId: harness.host.protocolId,
      sectionId: EGO_SECTION,
    });
    expect(await harness.submit()).not.toBeNull();
    expect(egoValidation(harness, 'ego_name')).toEqual({ required: true });
  });
});

describe('the switch, while a collaborator is changing the same attribute', () => {
  it('opens over a rule a collaborator added', async () => {
    const harness = open(EGO, 'ego_name');

    await harness.opened();
    expect(
      await screen.findByRole('switch', { name: 'Validation' }),
    ).not.toBeChecked();

    harness.receiveCodebookUpdate({
      ego: {
        variables: {
          ego_name: {
            name: 'ego_name',
            type: 'text',
            validation: { required: true },
          },
        },
      },
    });

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Validation' })).toBeChecked(),
    );
    expect(
      screen.getByRole('switch', { name: 'Required answer' }),
    ).toBeChecked();
  });

  it('closes when a collaborator clears the rules', async () => {
    const harness = open(EGO, 'ego_name');
    harness.receiveCodebookUpdate({
      ego: {
        variables: {
          ego_name: {
            name: 'ego_name',
            type: 'text',
            validation: { required: true },
          },
        },
      },
    });

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Validation' })).toBeChecked(),
    );

    harness.receiveCodebookUpdate({
      ego: {
        variables: {
          ego_name: {
            name: 'ego_name',
            type: 'text',
          },
        },
      },
    });

    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Validation' }),
      ).not.toBeChecked(),
    );
    expect(
      screen.queryByRole('switch', { name: 'Required answer' }),
    ).not.toBeInTheDocument();
  });

  /**
   * A rule the researcher is taking off is the codebook (as the editor shows
   * it) moving because THEY moved it, and re-seeding the switch on that would
   * close the panel under the gesture that is still in progress.
   */
  it('stays open when the researcher takes the last rule off', async () => {
    const harness = open(EGO, 'ego_name');
    harness.receiveCodebookUpdate({
      ego: {
        variables: {
          ego_name: {
            name: 'ego_name',
            type: 'text',
            validation: { required: true },
          },
        },
      },
    });

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Required answer' }),
    );

    await waitFor(() =>
      expect(egoEditorValidation(harness, 'ego_name')).toBeUndefined(),
    );
    expect(screen.getByRole('switch', { name: 'Validation' })).toBeChecked();
    expect(
      screen.getByRole('switch', { name: 'Required answer' }),
    ).not.toBeChecked();
  });
});

/**
 * Only SOME of the maps the researcher can see are kept: a half-set one stays
 * on screen ahead of the draft. The next edit that is kept has to carry it, or
 * the rules on screen are dropped and then wiped off the screen by the re-seed
 * with nothing said about any of it.
 */
describe('a rule on screen that the stage draft has not taken yet', () => {
  it('is kept by the edit that finishes it', async () => {
    const harness = open(PERSON, 'story');
    harness.receiveCodebookUpdate(personHolding('number'));

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Validation' }),
    );
    // Switched on with no target yet, so it is held on screen and not kept.
    await harness.user.click(
      await screen.findByRole('switch', {
        name: 'Less than another attribute',
      }),
    );
    // Still unanswerable with the comparison open, so this is not kept
    // either — and it is the edit the map on screen is now ahead by.
    await harness.user.click(
      await screen.findByRole('switch', { name: 'Required answer' }),
    );
    expect(personEditorValidation(harness, 'story')).toBeUndefined();

    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Less than another attribute' }),
      'retelling',
    );

    await waitFor(() =>
      expect(personEditorValidation(harness, 'story')).toEqual({
        lessThanVariable: 'retelling',
        required: true,
      }),
    );
  });
});

/**
 * A host may rule a rule out of its stage, but a rule the codebook already
 * holds can still be taken off — and must stay so while the codebook holds
 * it.
 */
describe('a rule the mounting stage rules out', () => {
  const REASON = 'The stage always records one.';
  const openRulingOut = () =>
    renderStageEditor({
      stageId: 'ego-form-1',
      sections: (
        <CodebookVariableValidationSection
          subject={PERSON}
          variableId="story"
          unavailableRules={{ required: REASON }}
        />
      ),
    });
  const holdingRequired = () => {
    const codebook = personHolding('text');
    return {
      node: {
        person: {
          ...codebook.node.person,
          variables: {
            ...codebook.node.person.variables,
            story: {
              ...codebook.node.person.variables.story,
              validation: { required: true },
            },
          },
        },
      },
    };
  };

  it('cannot be switched on', async () => {
    const harness = openRulingOut();
    harness.receiveCodebookUpdate(personHolding('text'));

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Validation' }),
    );
    const required = await screen.findByRole('switch', {
      name: 'Required answer',
    });
    expect(required).toHaveAttribute('aria-disabled', 'true');
    expect(required).toHaveAccessibleDescription(REASON);
    await harness.user.click(required);
    expect(personEditorValidation(harness, 'story')).toBeUndefined();
  });

  it('can be taken off, and put back on, while the codebook holds it', async () => {
    const harness = openRulingOut();
    harness.receiveCodebookUpdate(holdingRequired());
    await harness.opened();

    // On, and explained: the reason belongs beneath the rule while it stands.
    const standing = await screen.findByRole('switch', {
      name: 'Required answer',
    });
    expect(standing).toHaveAccessibleDescription(REASON);
    expect(standing).not.toHaveAttribute('aria-disabled');
    await harness.user.click(standing);
    expect(personEditorValidation(harness, 'story')).toBeUndefined();

    // Off in the editor, still held by the protocol until the stage is saved.
    const taken = await screen.findByRole('switch', {
      name: 'Required answer',
    });
    expect(taken).not.toBeChecked();
    expect(personValidation(harness, 'story')).toEqual({ required: true });

    expect(await harness.submit()).not.toBeNull();
    expect(personValidation(harness, 'story')).toBeUndefined();
  });
});
