import { describe, expect, it } from 'vitest';

// The ONLY imports this file may have. `stageEditorRegistry.ts` imports every
// part, so a part that imported it back would put the two modules in a cycle —
// and reaching the part first would then evaluate the registry while the part's
// own binding is still uninitialised, building `REGISTRY_PARTS` out of nothing.
// Naming the registry here, in any form, is what would make this file pass
// while that was true.
import { alterEdgeFormStageEditor } from '../alter-edge-form/AlterEdgeFormStageEditor.ts';
import { alterFormStageEditor } from '../alter-form/AlterFormStageEditor.ts';
import { egoFormStageEditor } from '../ego-form/EgoFormStageEditor.ts';
import { familyPedigreeStageEditor } from '../family-pedigree/FamilyPedigreeStageEditor.ts';
import { informationStageEditor } from '../information/InformationStageEditor.ts';
import { nameGeneratorStageEditor } from '../name-generator/NameGeneratorStageEditor.ts';

/**
 * A part has to be loadable without the registry that composes it.
 *
 * Which module a program reaches first is not something an editor controls: a
 * host importing an editor, a story naming a part, a test mounting one — each
 * enters the graph somewhere different. So a part depends only on the contract
 * its sections are written against, and `defineStageEditor` lives away from
 * the registry for that reason.
 */
describe('a part reached before the registry', () => {
  it.each([
    {
      name: 'Information',
      part: informationStageEditor,
      claims: ['Information'],
    },
    { name: 'EgoForm', part: egoFormStageEditor, claims: ['EgoForm'] },
    { name: 'AlterForm', part: alterFormStageEditor, claims: ['AlterForm'] },
    {
      name: 'AlterEdgeForm',
      part: alterEdgeFormStageEditor,
      claims: ['AlterEdgeForm'],
    },
    {
      name: 'NameGenerator',
      part: nameGeneratorStageEditor,
      claims: ['NameGenerator'],
    },
    {
      name: 'FamilyPedigree',
      part: familyPedigreeStageEditor,
      claims: ['FamilyPedigree'],
    },
  ])('is the set of interfaces $name claims', ({ part, claims }) => {
    expect(Object.keys(part).toSorted()).toEqual(claims);
  });
});
