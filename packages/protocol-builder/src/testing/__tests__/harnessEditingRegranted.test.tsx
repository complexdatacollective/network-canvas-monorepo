import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { buildUpdateVariableRequest } from '../../codebook/editing.ts';
import StageNameSection from '../../sections/StageNameSection.tsx';
import {
  type CompoundEditResult,
  SessionReadOnlyError,
} from '../../session.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../renderStageEditor.tsx';

const PERSON_SECTION = sectionId({ kind: 'codebookNode', typeId: 'person' });

const NICKNAME = Object.freeze({
  name: 'nickname',
  type: 'text',
  component: 'Text',
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The fixture's `person` type, as the session currently holds it. */
const personDocument = (harness: StageEditorHarness): SectionDoc => {
  const person = harness.session.getSnapshot().protocolSections[PERSON_SECTION];
  if (person === undefined) {
    throw new Error('the fixture has no "person" node type');
  }
  return person;
};

/** The fixture's `person` type with one more attribute on it. */
const personWithNickname = (harness: StageEditorHarness): SectionDoc => {
  const person = personDocument(harness);
  const variables = isRecord(person.variables) ? person.variables : {};
  if (Object.hasOwn(variables, 'nickname')) {
    throw new Error(
      'the fixture already gives "person" a "nickname" attribute, so seeding one proves nothing',
    );
  }
  return { ...person, variables: { ...variables, nickname: NICKNAME } };
};

const openStage = (): StageEditorHarness => {
  const harness = renderStageEditor({
    stageId: 'alter-form-1',
    sections: <StageNameSection />,
  });
  harness.receiveCodebookUpdate({
    node: { person: personWithNickname(harness) },
  });
  return harness;
};

/** The rename a codebook editor sends when the researcher renames one. */
const renameNickname = async (
  harness: StageEditorHarness,
): Promise<CompoundEditResult> => {
  const request = buildUpdateVariableRequest({
    requestId: 'rename-the-seeded-attribute',
    description: 'Rename an attribute',
    subject: { entity: 'node', type: 'person' },
    authoritativeDocument: personDocument(harness),
    variableId: 'nickname',
    draft: { name: 'preferred_name' },
  });
  let result: CompoundEditResult | undefined;
  await act(async () => {
    result = await harness.session.requestCompoundEdit(request);
  });
  if (result === undefined) throw new Error('the compound edit never settled');
  return result;
};

/**
 * A compound edit carries the session's lease epoch and the host refuses it
 * unless that is the epoch the host's own lease record holds. So the harness
 * handing editing back is only honest if the two ends still agree about it.
 *
 * They did not. `setReadOnly(false)` granted the session an epoch of its own
 * while the fixture host went on holding the one it issued, and every compound
 * edit after that round trip was refused `stale-epoch`. Nothing on screen said
 * so — a test that took editing away, gave it back and read the page passed —
 * and the refusal was reported against whatever the editor tried to write
 * next, which is the last place anyone would look for it.
 */
describe('editing taken away by the harness and given back', () => {
  it('leaves a compound edit judged by the authority the host still holds', async () => {
    const harness = openStage();

    harness.setReadOnly();
    harness.setReadOnly(false);

    await expect(renameNickname(harness)).resolves.toMatchObject({
      status: 'applied',
    });
    expect(
      harness.hostCodebook().node?.person?.variables?.nickname,
    ).toMatchObject({ name: 'preferred_name' });
  });

  /**
   * The control for the claim above: the same edit, from a session nothing has
   * taken editing away from, is applied too — so what the first test measures
   * is the round trip and not the edit.
   */
  it('is the same edit a session that kept editing throughout can make', async () => {
    const harness = openStage();

    await expect(renameNickname(harness)).resolves.toMatchObject({
      status: 'applied',
    });
  });

  /**
   * And the control for the round trip itself: editing really is gone in
   * between, so the first test is not passing because `setReadOnly` did
   * nothing at all.
   */
  it('really does take editing away in between', async () => {
    const harness = openStage();

    harness.setReadOnly();

    await expect(renameNickname(harness)).rejects.toThrow(SessionReadOnlyError);
  });
});
