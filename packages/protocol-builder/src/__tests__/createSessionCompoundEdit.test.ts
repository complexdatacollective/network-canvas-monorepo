import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { buildCreateVariableRequest } from '../codebook/editing.ts';
import type { FinishRequest, ProtocolBuilderSessionStore } from '../session.ts';
import { openFixtureStageSession } from '../testing/fixtureSession.ts';
import { loadFixtureStage } from '../testing/protocolFixture.ts';

/**
 * Compound edits made from a stage the interview does not contain yet.
 *
 * A create session edits a stage the protocol has no section for, so the full
 * protocol a host answers a compound edit with cannot contain it either. That
 * absence is the correct answer and not a broken one: read as a broken answer,
 * every codebook edit a new stage's editor makes is refused AFTER the host has
 * applied it, leaving the researcher told nothing was saved and the session on
 * a revision the host has already left.
 */
const EGO_SECTION = sectionId({ kind: 'codebookEgo' });

const createNickname = (
  session: ProtocolBuilderSessionStore,
  variableId: string,
) => {
  const snapshot = session.getSnapshot();
  return session.requestCompoundEdit(
    buildCreateVariableRequest({
      requestId: `create-${variableId}`,
      description: 'Create the attribute "Nickname"',
      subject: { entity: 'ego' },
      authoritativeDocument: snapshot.protocolSections[EGO_SECTION] ?? {},
      variableId,
      protocolContext: snapshot.protocolContext,
      draft: { name: 'Nickname', type: 'text', component: 'Text' },
    }),
  );
};

const holdsVariable = (
  sections: Readonly<Record<string, SectionDoc>>,
  variableId: string,
): boolean => {
  const variables = Reflect.get(sections[EGO_SECTION] ?? {}, 'variables');
  return (
    typeof variables === 'object' &&
    variables !== null &&
    Object.hasOwn(variables, variableId)
  );
};

const openCreateSession = (
  onFinish: (request: FinishRequest) => void = () => undefined,
) =>
  openFixtureStageSession({
    seeded: {
      ...loadFixtureStage('ego-form-1'),
      id: 'stage-being-created',
      creation: { position: 0 },
    },
    onFinish,
  });

describe('a compound edit made from a stage being created', () => {
  it('creates the attribute the new stage will collect', async () => {
    const { session } = openCreateSession();

    const result = await createNickname(session, 'nickname-a');

    expect(result.status === 'failed' ? result.message : result.status).toBe(
      'applied',
    );
  });

  it('adopts the codebook and the revision the host answered with', async () => {
    const { session, host } = openCreateSession();

    await createNickname(session, 'nickname-b');

    const hostSnapshot = host.getSnapshot();
    expect({
      revision: session.getSnapshot().manifestRevision,
      sees: holdsVariable(session.getSnapshot().protocolSections, 'nickname-b'),
      offered: Object.hasOwn(
        session.getSnapshot().protocolContext.codebook.ego?.variables ?? {},
        'nickname-b',
      ),
    }).toEqual({
      revision: hostSnapshot.manifestRevision,
      sees: true,
      offered: true,
    });
  });

  /**
   * The half of the answer the host said nothing about. It holds no stage for
   * this session, so nothing it says can move this session's base — and the
   * batches the researcher has made since are still theirs to send at finish.
   */
  it('leaves the unsaved stage work exactly where it was', async () => {
    const finishes: FinishRequest[] = [];
    const { session } = openCreateSession((request) => finishes.push(request));
    session.dispatch([{ op: 'set', key: 'label', value: 'About you' }]);
    const before = session.getSnapshot();

    const result = await createNickname(session, 'nickname-c');

    expect(result.status === 'failed' ? result.message : result.status).toBe(
      'applied',
    );
    expect({
      label: session.getSnapshot().editedSection.fields.label,
      pending: session.getSnapshot().pendingCommands,
      history: session.getSnapshot().history,
    }).toEqual({
      label: 'About you',
      pending: before.pendingCommands,
      history: before.history,
    });

    await session.finish();
    expect(finishes.at(-1)?.pendingCommands).toEqual(before.pendingCommands);
    expect(finishes.at(-1)?.stageDocument.label).toBe('About you');
  });

  /**
   * The base itself, read where the session shows it: losing editing access
   * rolls the draft back to the stage the host is holding. A compound edit
   * that adopted the DRAFT as the base would roll back to nothing.
   */
  it('does not adopt the unsaved draft as the stage the host holds', async () => {
    const { session } = openCreateSession();
    const seededLabel = session.getSnapshot().editedSection.fields.label;
    session.dispatch([{ op: 'set', key: 'label', value: 'About you' }]);

    const result = await createNickname(session, 'nickname-d');
    expect(result.status === 'failed' ? result.message : result.status).toBe(
      'applied',
    );
    session.setAccess({ mode: 'readOnly', reason: 'lease-lost' });

    expect(session.getSnapshot().editedSection.fields.label).toBe(seededLabel);
  });

  it('makes the same edit from a session on a stage the interview contains', async () => {
    const { session } = openFixtureStageSession({
      seeded: loadFixtureStage('ego-form-1'),
      onFinish: () => undefined,
    });

    const result = await createNickname(session, 'nickname-e');

    expect(result.status === 'failed' ? result.message : result.status).toBe(
      'applied',
    );
  });
});
