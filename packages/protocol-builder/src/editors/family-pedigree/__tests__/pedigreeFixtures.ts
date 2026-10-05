import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { loadFixtureStage } from '../../../testing/protocolFixture.ts';
import type { StageEditorHarness } from '../../../testing/renderStageEditor.tsx';

export const FAMILY_MEMBER_SECTION = sectionId({
  kind: 'codebookNode',
  typeId: 'family_member',
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * One more attribute on the fixture's person type, arriving from outside the
 * editor as a collaborator's would. The revision reaches the components over
 * the channel (a microtask), so read what it changed with `waitFor`/`findBy`.
 */
export function addFamilyMemberVariable(
  harness: StageEditorHarness,
  variableId: string,
  variable: Readonly<Record<string, unknown>>,
): void {
  const section = harness.protocolSections()[FAMILY_MEMBER_SECTION];
  if (section === undefined) {
    throw new Error('the fixture protocol has no family_member node type');
  }
  const variables = isRecord(section.variables) ? section.variables : {};
  if (Object.hasOwn(variables, variableId)) {
    throw new Error(
      `"family_member" already has a "${variableId}" attribute, so adding one proves nothing.`,
    );
  }
  harness.receiveCodebookUpdate({
    node: {
      family_member: {
        ...section,
        variables: { ...variables, [variableId]: variable },
      },
    },
  });
}

/** The fixture pedigree with whatever a test needs added to it. */
export function familyPedigreeStageWith(extra: SectionDoc): Readonly<{
  id: string;
  type: 'FamilyPedigree';
  fields: SectionDoc;
}> {
  const seeded = loadFixtureStage('family-pedigree-1');
  if (seeded.type !== 'FamilyPedigree') {
    throw new Error('The fixture stage "family-pedigree-1" changed interface.');
  }
  return {
    id: seeded.id,
    type: 'FamilyPedigree',
    fields: { ...seeded.fields, ...extra },
  };
}

/** The fixture pedigree with the named keys taken away. */
export function familyPedigreeStageWithout(keys: readonly string[]): Readonly<{
  id: string;
  type: 'FamilyPedigree';
  fields: SectionDoc;
}> {
  const seeded = loadFixtureStage('family-pedigree-1');
  if (seeded.type !== 'FamilyPedigree') {
    throw new Error('The fixture stage "family-pedigree-1" changed interface.');
  }
  for (const key of keys) {
    if (!Object.hasOwn(seeded.fields, key)) {
      throw new Error(
        `The fixture stage "family-pedigree-1" has no "${key}" to take away, so removing it proves nothing.`,
      );
    }
  }
  return {
    id: seeded.id,
    type: 'FamilyPedigree',
    fields: Object.fromEntries(
      Object.entries(seeded.fields).filter(([key]) => !keys.includes(key)),
    ),
  };
}
