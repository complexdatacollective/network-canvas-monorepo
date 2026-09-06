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
const COLLABORATOR = Object.freeze({
  sessionId: 'other-tab',
  displayName: 'Dana',
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Hands the changed sections to the HOST first, and tells the session about
 * them under the revision the host issued for them.
 *
 * One change to one protocol, seen from both ends — the same route
 * `harness.receiveCodebookUpdate` takes, and taken here for the same reason: a
 * collaborator's edit is a real edit, so the authoritative protocol has to hold
 * it. A helper that told the SESSION alone, under a revision it made up, left
 * the host behind for the rest of the test: every later compound edit is built
 * on a base the host does not recognise and is refused as stale, and the next
 * arrival the host issues is older than what the session already holds and is
 * dropped without a word. Neither is anything a collaborator can do.
 *
 * The host issuing the revision is also what keeps attribution honest.
 * Attribution is matched by revision — an issue is blamed on a change only
 * while that change's revision is the one the protocol is now at — so the
 * number has to be the protocol's own rather than a fabrication racing the
 * harness's.
 *
 * `null` removes a section, which is what the host's own arrival path means by
 * it. Only the sections that actually CHANGED are passed: the host merges them
 * into what it holds, and answers with the whole protocol at its new revision.
 */
function receive(
  harness: StageEditorHarness,
  changed: Readonly<Record<string, SectionDoc | null>>,
  changedSectionId: string,
): void {
  const applied = harness.host.receiveAuthoritativeSections(changed);
  const manifestRevision = applied.manifestRevision;
  act(() => {
    harness.session.receiveAuthoritativeUpdate({
      protocolSections: applied.protocolSections,
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
  // Read from the HOST, which is what this change is made against: the session
  // is told about the result afterwards, and anything the editor has had
  // applied since it last heard from the host is here and not there.
  const definition = harness.host.getSnapshot().protocolSections[id];
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
  receive(harness, { [id]: { ...definition, variables: kept } }, id);
}

/** Removes one asset from the protocol's manifest, as a collaborator would. */
export function removeAsset(
  harness: StageEditorHarness,
  assetId: string,
): void {
  const id = sectionId({ kind: 'assets' });
  const manifest = { ...harness.host.getSnapshot().protocolSections[id] };
  if (!Object.hasOwn(manifest, assetId)) {
    throw new Error(
      `the manifest has no "${assetId}" to remove. It holds: ${Object.keys(manifest).join(', ')}.`,
    );
  }
  delete manifest[assetId];
  receive(harness, { [id]: manifest }, id);
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
