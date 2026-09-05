import { act } from '@testing-library/react';
import { expect } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import type { StageEditorHarness } from '../../../testing/renderStageEditor.tsx';

/**
 * Somebody else, editing the same protocol at the same time.
 *
 * Every change made through this module arrives as theirs: one authoritative
 * revision, attributed to a named person. That is what lets an editor's test
 * assert not only that a problem was reported but that the researcher is told
 * whose change caused it — nothing they did to this stage did.
 */
export const COLLABORATOR = Object.freeze({
  sessionId: 'other-tab',
  displayName: 'Dana',
});

/**
 * Revisions never repeat, and always move forward.
 *
 * Attribution is matched by revision: an issue is blamed on a change only when
 * that change's revision is the one the protocol is now at. A helper reusing a
 * sequence number the harness itself has already sent would blame the wrong
 * change, or none.
 */
let sequence = 100n;

const nextRevision = () => {
  sequence += 1n;
  return { sequence, hash: `revision-${sequence}` };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function receive(
  harness: StageEditorHarness,
  protocolSections: Record<string, SectionDoc>,
  changedSectionId: string,
): void {
  const manifestRevision = nextRevision();
  act(() => {
    harness.session.receiveAuthoritativeUpdate({
      protocolSections,
      manifestRevision,
      attribution: {
        [changedSectionId]: { ...COLLABORATOR, revision: manifestRevision },
      },
    });
  });
}

/**
 * Deletes one attribute of a node type, as a collaborator would.
 *
 * Refuses to "delete" an attribute the fixture does not have: a test whose
 * setup silently did nothing would then assert that nothing was reported and
 * pass while proving nothing.
 */
export function deleteNodeVariable(
  harness: StageEditorHarness,
  typeId: string,
  variableId: string,
): void {
  const id = sectionId({ kind: 'codebookNode', typeId });
  const sections = harness.session.getSnapshot().protocolSections;
  const definition = sections[id];
  if (definition === undefined) {
    throw new Error(`the protocol has no "${typeId}" node type to change`);
  }
  const variables = isRecord(definition.variables) ? definition.variables : {};
  if (!Object.hasOwn(variables, variableId)) {
    throw new Error(
      `"${typeId}" has no "${variableId}" attribute to delete. It has: ${Object.keys(variables).join(', ')}.`,
    );
  }
  const { [variableId]: _deleted, ...kept } = variables;
  receive(
    harness,
    { ...sections, [id]: { ...definition, variables: kept } },
    id,
  );
}

/** Removes one asset from the protocol's manifest, as a collaborator would. */
export function removeAsset(
  harness: StageEditorHarness,
  assetId: string,
): void {
  const id = sectionId({ kind: 'assets' });
  const sections = harness.session.getSnapshot().protocolSections;
  const manifest = { ...sections[id] };
  if (!Object.hasOwn(manifest, assetId)) {
    throw new Error(
      `the manifest has no "${assetId}" to remove. It holds: ${Object.keys(manifest).join(', ')}.`,
    );
  }
  delete manifest[assetId];
  receive(harness, { ...sections, [id]: manifest }, id);
}

/**
 * Asserts the session reported a problem at `pathSegment`, and blamed it on
 * the collaborator who caused it.
 */
export function expectAttributedTo(
  harness: StageEditorHarness,
  pathSegment: string,
): void {
  const issues = harness.session.getSnapshot().validation.issues;
  const blamed = issues.filter(
    (issue) =>
      issue.attributedChange !== undefined && issue.path.includes(pathSegment),
  );
  expect(
    blamed.length,
    `nothing was reported at "${pathSegment}" with a change to blame. Reported: ${issues
      .map((issue) => issue.path.join('.'))
      .join(' | ')}`,
  ).toBeGreaterThan(0);
  expect(blamed[0]?.attributedChange?.attribution).toMatchObject(COLLABORATOR);
}
