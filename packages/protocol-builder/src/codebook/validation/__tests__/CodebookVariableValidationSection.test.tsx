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
        story: { name: 'story', type, component: COMPONENTS[type] },
        retelling: { name: 'retelling', type, component: COMPONENTS[type] },
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
      await screen.findByRole('checkbox', { name: 'Required answer' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Minimum text length' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Unique value' }),
    ).not.toBeInTheDocument();
  });

  it('writes a rule to the attribute it was asked about', async () => {
    const harness = open(EGO, 'ego_name');

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Validation' }),
    );
    await harness.user.click(
      await screen.findByRole('checkbox', { name: 'Required answer' }),
    );

    await waitFor(() =>
      expect(egoValidation(harness, 'ego_name')).toEqual({ required: true }),
    );
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
   * a row nobody can see and the section silently stops writing anything.
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
      await screen.findByRole('checkbox', {
        name: 'Less than another attribute',
      }),
    );
    expect(
      Reflect.get(
        harness.hostCodebook().node?.person?.variables?.story ?? {},
        'validation',
      ),
    ).toBeUndefined();

    harness.receiveCodebookUpdate(personHolding('boolean'));
    await waitFor(() =>
      expect(
        screen.queryByRole('checkbox', {
          name: 'Less than another attribute',
        }),
      ).not.toBeInTheDocument(),
    );

    await harness.user.click(
      await screen.findByRole('checkbox', { name: 'Required answer' }),
    );

    await waitFor(() =>
      expect(
        Reflect.get(
          harness.hostCodebook().node?.person?.variables?.story ?? {},
          'validation',
        ),
      ).toEqual({ required: true }),
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
 * when it opened — which is the state a write started now has to survive.
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

describe('rules written while the codebook is moving', () => {
  /**
   * The map on screen was read before the lock was taken, so writing it whole
   * deletes whatever a collaborator added in between. The edit is the KEY the
   * researcher touched, laid over the rules the lock hands back.
   */
  it('keeps a rule a collaborator added while the write was taking the lock', async () => {
    const harness = open(EGO, 'ego_name');

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Validation' }),
    );
    collaboratorRules(harness, { minLength: 3 });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Required answer' }));

    await waitFor(() =>
      expect(egoValidation(harness, 'ego_name')).toEqual({
        minLength: 3,
        required: true,
      }),
    );
  });

  /**
   * Rebasing can make a map nothing can satisfy, and the researcher never saw
   * the rule it contradicts. Refused with the sentence the row would have said
   * had they been looking at it, and nothing is written.
   */
  it('refuses an edit the collaborator’s rules leave no answer for', async () => {
    const harness = open(EGO, 'ego_name');
    harness.receiveCodebookUpdate({
      ego: {
        variables: {
          ego_name: {
            name: 'ego_name',
            type: 'text',
            validation: { maxLength: 9 },
          },
        },
      },
    });

    // On screen, so the rule the researcher switches on is seeded from the
    // maximum they can see — nine — rather than from the collaborator's two.
    expect(
      await screen.findByRole('checkbox', { name: 'Maximum text length' }),
    ).toBeChecked();
    collaboratorRules(harness, { maxLength: 2 });
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Minimum text length' }),
    );

    // Re-queried rather than held: the collaborator's rule arrives on the
    // channel while this is settling, and the panel it is drawn in is re-seeded
    // from the codebook when it does.
    await waitFor(() =>
      expect(screen.getByText(/leave no permitted answer/)).toBeInTheDocument(),
    );
    expect(egoValidation(harness, 'ego_name')).toEqual({ maxLength: 2 });
  });

  /**
   * Two edits made before the first has come back take the same lock, and
   * whichever releases first leaves the other's submit refused — a valid edit
   * silently unapplied. They are written one after the other instead.
   */
  it('lands both of two edits made before the first came back', async () => {
    const harness = open(EGO, 'ego_name');

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Validation' }),
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Required answer' }));
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Minimum text length' }),
    );

    await waitFor(() =>
      expect(egoValidation(harness, 'ego_name')).toEqual({
        required: true,
        minLength: 1,
      }),
    );
  });

  /**
   * The switch read the codebook's answer to the last write, which an addition
   * still in flight has not reached yet — so it closed over a rule the
   * protocol was about to hold.
   */
  it('clears a rule still in flight when the section is switched off', async () => {
    const harness = open(EGO, 'ego_name');

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Validation' }),
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Required answer' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Validation' }));

    await waitFor(() =>
      expect(egoValidation(harness, 'ego_name')).toBeUndefined(),
    );
    await harness.opened();
    expect(egoValidation(harness, 'ego_name')).toBeUndefined();
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
      screen.getByRole('checkbox', { name: 'Required answer' }),
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
      ego: { variables: { ego_name: { name: 'ego_name', type: 'text' } } },
    });

    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Validation' }),
      ).not.toBeChecked(),
    );
    expect(
      screen.queryByRole('checkbox', { name: 'Required answer' }),
    ).not.toBeInTheDocument();
  });

  /**
   * A rule the researcher is taking off is the codebook moving because THEY
   * moved it, and re-seeding the switch on that would close the panel under
   * the gesture that is still in progress.
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
      await screen.findByRole('checkbox', { name: 'Required answer' }),
    );

    await waitFor(() =>
      expect(egoValidation(harness, 'ego_name')).toBeUndefined(),
    );
    expect(screen.getByRole('switch', { name: 'Validation' })).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Required answer' }),
    ).not.toBeChecked();
  });
});

describe('a refusal the researcher has moved on from', () => {
  /**
   * A refusal describes the map that was refused. An edit that leaves the map
   * half-set is never written, so nothing else would take the sentence down,
   * and it stands over rules it is no longer about.
   */
  it('is taken down by the next edit, written or not', async () => {
    const harness = open(EGO, 'ego_name');
    await harness.opened();
    await harness.host
      .asCollaborator({
        sessionId: 'session-2',
        userId: 'user-2',
        displayName: 'Robin',
      })
      .acquireLock({
        protocolId: harness.host.protocolId,
        sectionId: EGO_SECTION,
      });

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Validation' }),
    );
    await harness.user.click(
      await screen.findByRole('checkbox', { name: 'Required answer' }),
    );
    expect(
      await screen.findByText(
        'Robin is currently editing a section needed for this change.',
      ),
    ).toBeInTheDocument();

    // Back to the rules the codebook holds, so nothing is written — and
    // nothing else takes down the sentence the refused edit left behind.
    await harness.user.click(
      await screen.findByRole('checkbox', { name: 'Required answer' }),
    );

    await waitFor(() =>
      expect(
        screen.queryByText(
          'Robin is currently editing a section needed for this change.',
        ),
      ).not.toBeInTheDocument(),
    );
  });
});
