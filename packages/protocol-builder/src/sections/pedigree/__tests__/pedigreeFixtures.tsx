import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { loadFixtureStage } from '../../../testing/protocolFixture.ts';
import type { StageEditorHarness } from '../../../testing/renderStageEditor.tsx';

const FAMILY_MEMBER_SECTION = sectionId({
  kind: 'codebookNode',
  typeId: 'family_member',
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * One more attribute on the type the pedigree draws people as, put there from
 * outside this editor.
 *
 * The pickers read the codebook out of the editor's protocol context, so where
 * an attribute came from makes no difference to what they offer — and arriving
 * this way costs a single authoritative revision rather than a trip through
 * the create dialog. Tests that are about the create dialog itself still drive
 * it; tests that only need an attribute to exist use this.
 */
export function addFamilyMemberVariable(
  harness: StageEditorHarness,
  variableId: string,
  variable: Readonly<Record<string, unknown>>,
): void {
  const section =
    harness.session.getSnapshot().protocolSections[FAMILY_MEMBER_SECTION];
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

/**
 * The fixture pedigree, with whatever the test needs added to it.
 *
 * The shared all-interfaces protocol carries no nomination prompts and no
 * family-member form, so the paths that edit them have to be seeded here — but
 * from the fixture stage rather than from a hand-written one, so a test still
 * fails when the fixture and the schema disagree.
 */
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
