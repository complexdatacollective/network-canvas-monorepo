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
 * The pickers subscribe to the codebook sections, so where an attribute came
 * from makes no difference to what they offer — and arriving this way costs a
 * single revision on the protocol's own channel rather than a trip through the
 * create dialog. Tests that are about the create dialog itself still drive it;
 * tests that only need an attribute to exist use this.
 *
 * The revision reaches the components over the channel, which is a microtask,
 * so a caller reads what it changed with `waitFor` or `findBy`.
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

/**
 * The fixture pedigree, with whatever the test needs added to it.
 *
 * The shared all-interfaces protocol carries one nomination prompt and no
 * family-member form, so a test that needs a particular prompt list, or a
 * form, seeds it here — but over the fixture stage rather than a hand-written
 * one, so a test still fails when the fixture and the schema disagree.
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

/**
 * The fixture pedigree with the named keys taken away.
 *
 * The fixture asks one nomination question, so a test about a pedigree that
 * asks nothing has to remove it rather than find it absent — and removing it
 * from the fixture stage, like adding to it above, keeps the rest of the stage
 * the one the app is tested against.
 */
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
