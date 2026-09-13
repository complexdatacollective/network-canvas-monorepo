import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import type { CodebookSubject } from '../../../protocol-context.ts';
import type { InMemoryClient } from '../../../testing/host/createInMemoryHost.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';
import CodebookVariableValidationSection from '../CodebookVariableValidationSection.tsx';

const EGO: CodebookSubject = { entity: 'ego' };
const EGO_SECTION = sectionId({ kind: 'codebookEgo' });
const PERSON: CodebookSubject = { entity: 'node', type: 'person' };
const PERSON_SECTION = sectionId({ kind: 'codebookNode', typeId: 'person' });

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

/**
 * The section with the codebook's answer to its FIRST write held back, and the
 * release that lets it through.
 *
 * Every claim about two edits that overlap needs them to overlap: a suite fast
 * enough to settle the first write before the second is made proves nothing
 * about a researcher who clicks twice.
 */
const openWithHeldWrite = (
  subject: CodebookSubject,
  variableId: string,
): Readonly<{ harness: StageEditorHarness; release: () => void }> => {
  const first = Promise.withResolvers<void>();
  let held = true;
  const harness = renderStageEditor({
    stageId: 'ego-form-1',
    client: (host) => {
      const submit: InMemoryClient['submit'] = async (
        ...args: Parameters<InMemoryClient['submit']>
      ) => {
        if (held) {
          held = false;
          await first.promise;
        }
        return host.client.submit(...args);
      };
      return new Proxy(host.client, {
        get: (target, property) =>
          property === 'submit' ? submit : Reflect.get(target, property),
      });
    },
    sections: (
      <CodebookVariableValidationSection
        subject={subject}
        variableId={variableId}
      />
    ),
  });
  return {
    harness,
    release: () => {
      first.resolve();
    },
  };
};

/**
 * Where the protocol has got to, which is what says a write has landed.
 *
 * A reversal ends on the rules it started from, so nothing about the codebook's
 * own contents can tell a test that the write taking the rule back off has been
 * made — only that it has not been made YET. The protocol's revision counts
 * every change it takes, and two are expected: the rule, and the taking of it
 * back.
 */
const changesTaken = (
  harness: StageEditorHarness,
  section: ProtocolSectionId = EGO_SECTION,
): bigint => harness.host.store.read(section).revision.sequence;

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
   * The rebased map is what the codebook now holds, so it is what the screen
   * has to show — and what the NEXT edit is diffed against. A screen left on
   * the map the researcher clicked would carry the collaborator's rule as a
   * removal the moment they touched another rule, deleting it.
   */
  it('brings the rebased rule to the screen, so the next edit keeps it', async () => {
    const harness = open(EGO, 'ego_name');

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Validation' }),
    );
    collaboratorRules(harness, { minLength: 3 });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Required answer' }));

    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', { name: 'Minimum text length' }),
      ).toBeChecked(),
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Required answer' }));

    await waitFor(() =>
      expect(egoValidation(harness, 'ego_name')).toEqual({ minLength: 3 }),
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
   * Two edits made before the first has come back are two writes over one
   * section, each laying its map over the document the host held when IT
   * asked. Left to race, the first edit's write reads a document without the
   * second's rule in it and settles last, so the protocol ends up holding the
   * older map and the second edit is silently gone. They are written one after
   * the other instead, each rebased when its turn comes.
   *
   * The first write is held open, because that is the whole of the claim: a
   * suite fast enough to settle the first write before the second is made
   * proves nothing about two that overlap.
   */
  it('lands both of two edits made before the first came back', async () => {
    const { harness, release } = openWithHeldWrite(EGO, 'ego_name');

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Validation' }),
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Required answer' }));
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Minimum text length' }),
    );
    release();

    await waitFor(() =>
      expect(egoValidation(harness, 'ego_name')).toEqual({
        required: true,
        minLength: 1,
      }),
    );
  });

  /**
   * A rule switched on and straight back off is two edits, and the codebook has
   * heard about neither: the second is a change from the map the first is about
   * to leave, not from the one the codebook last confirmed. Read against the
   * confirmed map it is no change at all — so nothing takes the rule back off,
   * the first write lands it, and the researcher is left with a rule they
   * turned off and a box that ticks itself over it.
   */
  it('takes a rule back off when it is switched off before its own write came back', async () => {
    const { harness, release } = openWithHeldWrite(EGO, 'ego_name');

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Validation' }),
    );
    const before = changesTaken(harness);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Required answer' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Required answer' }));
    release();

    await waitFor(() => expect(changesTaken(harness)).toBe(before + 2n));
    expect(egoValidation(harness, 'ego_name')).toBeUndefined();
    expect(
      screen.getByRole('checkbox', { name: 'Required answer' }),
    ).not.toBeChecked();
  });

  /**
   * The same reversal made of a number rather than of a rule: the stepper takes
   * the minimum up and the researcher puts it straight back, before the raise
   * has been acknowledged.
   */
  it('puts a number back when it is reverted before its own write came back', async () => {
    const { harness, release } = openWithHeldWrite(PERSON, 'story');
    const numbers = personHolding('number');
    harness.receiveCodebookUpdate({
      node: {
        person: {
          ...numbers.node.person,
          variables: {
            ...numbers.node.person.variables,
            story: {
              ...numbers.node.person.variables.story,
              validation: { minValue: 4 },
            },
          },
        },
      },
    });

    expect(
      await screen.findByRole('spinbutton', { name: 'Minimum value' }),
    ).toHaveValue(4);
    const before = changesTaken(harness, PERSON_SECTION);
    fireEvent.click(
      screen.getByRole('button', { name: 'Increase Minimum value' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Decrease Minimum value' }),
    );
    release();

    await waitFor(() =>
      expect(changesTaken(harness, PERSON_SECTION)).toBe(before + 2n),
    );
    expect(personValidation(harness, 'story')).toEqual({ minValue: 4 });
    expect(
      screen.getByRole('spinbutton', { name: 'Minimum value' }),
    ).toHaveValue(4);
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

/**
 * Only SOME of the maps the researcher can see are written: one refused for
 * the lock, and one held back as half-set, both leave the screen ahead of the
 * codebook. The next edit that does write has to carry them, or the rules on
 * screen are dropped from the write, rebased away, and then wiped off the
 * screen by the re-seed with nothing said about any of it.
 */
describe('a rule on screen that the codebook has not taken yet', () => {
  it('is written by the next edit after a collaborator’s lock refused it', async () => {
    const harness = open(EGO, 'ego_name');
    await harness.opened();
    const robin = harness.host.asCollaborator({
      sessionId: 'session-2',
      userId: 'user-2',
      displayName: 'Robin',
    });
    await robin.acquireLock({
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
    expect(egoValidation(harness, 'ego_name')).toBeUndefined();

    await robin.releaseLock({
      protocolId: harness.host.protocolId,
      sectionId: EGO_SECTION,
    });
    await harness.user.click(
      await screen.findByRole('checkbox', { name: 'Minimum text length' }),
    );

    await waitFor(() =>
      expect(egoValidation(harness, 'ego_name')).toEqual({
        required: true,
        minLength: 1,
      }),
    );
    // And still on screen, because the codebook now holds it: a rule the write
    // left behind is unticked by the re-seed a moment later, silently.
    expect(
      screen.getByRole('checkbox', { name: 'Required answer' }),
    ).toBeChecked();
  });

  it('is written by the edit that finishes it, without a collaborator at all', async () => {
    const harness = open(PERSON, 'story');
    harness.receiveCodebookUpdate(personHolding('number'));

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Validation' }),
    );
    // Switched on with no target yet, so it is held on screen and not written.
    await harness.user.click(
      await screen.findByRole('checkbox', {
        name: 'Less than another attribute',
      }),
    );
    // Still unanswerable with the comparison open, so this is not written
    // either — and it is the edit the map on screen is now ahead by.
    await harness.user.click(
      await screen.findByRole('checkbox', { name: 'Required answer' }),
    );
    expect(personValidation(harness, 'story')).toBeUndefined();

    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Less than another attribute' }),
      'retelling',
    );

    await waitFor(() =>
      expect(personValidation(harness, 'story')).toEqual({
        lessThanVariable: 'retelling',
        required: true,
      }),
    );
  });
});

/**
 * The codebook moving because THIS section moved it is not news to the
 * researcher, and the switch is not re-seeded for it. A write that was refused
 * moved nothing, so the map it asked for is not an echo to wait for — and a
 * collaborator who then makes that very change is not this section's own work.
 */
describe('the marker a refused write leaves behind', () => {
  it('does not make a collaborator’s identical change read as ours', async () => {
    let drop = true;
    const harness = renderStageEditor({
      stageId: 'ego-form-1',
      client: (host) => {
        const submit: InMemoryClient['submit'] = async (
          ...args: Parameters<InMemoryClient['submit']>
        ) => {
          if (drop) {
            drop = false;
            // What a dropped socket is: the host took the lock and handed back
            // the document, and the answer to the write never arrived.
            throw new Error('the connection dropped');
          }
          return host.client.submit(...args);
        };
        return new Proxy(host.client, {
          get: (target, property) =>
            property === 'submit' ? submit : Reflect.get(target, property),
        });
      },
      sections: (
        <CodebookVariableValidationSection
          subject={EGO}
          variableId="ego_name"
        />
      ),
    });
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

    // Refused, so the rules are still there and the panel stays open over
    // them — but the section has asked for an empty map.
    await harness.user.click(
      screen.getByRole('switch', { name: 'Validation' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Validation' })).toBeChecked(),
    );
    expect(egoValidation(harness, 'ego_name')).toEqual({ required: true });

    harness.receiveCodebookUpdate({
      ego: { variables: { ego_name: { name: 'ego_name', type: 'text' } } },
    });

    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Validation' }),
      ).not.toBeChecked(),
    );
  });
});
