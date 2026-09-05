import type { SectionDoc } from '@codaco/studio-sync/apply';

import { loadFixtureStage } from '../../../testing/protocolFixture.ts';

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
