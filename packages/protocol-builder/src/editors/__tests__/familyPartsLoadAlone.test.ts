import { describe, expect, it } from 'vitest';

// The ONLY imports this file may have. `stageEditorRegistry.ts` imports every
// family's part, so a part that imported it back would put the two modules in
// a cycle — and reaching the part first would then evaluate the registry while
// the part's own binding is still uninitialised, building `REGISTRY_PARTS` out
// of nothing. Naming the registry here, in any form, is what would make this
// file pass while that was true.
import { formStageEditors } from '../formStageEditors.ts';
import { nameGeneratorStageEditors } from '../nameGeneratorStageEditors.ts';

/**
 * A family's part has to be loadable without the registry that composes it.
 *
 * Which module a program reaches first is not something a family controls: a
 * host importing an editor, a story naming a part, a test mounting one — each
 * enters the graph somewhere different. So the parts depend only on the
 * contract their editors are written against, and `defineStageEditorPart`
 * lives there rather than in the registry for exactly this reason.
 */
describe('a family part reached before the registry', () => {
  it('is the set of interfaces its family claims', () => {
    expect(Object.keys(formStageEditors).toSorted()).toEqual([
      'AlterEdgeForm',
      'AlterForm',
      'EgoForm',
      'Information',
    ]);
    expect(Object.keys(nameGeneratorStageEditors).toSorted()).toEqual([
      'NameGenerator',
    ]);
  });
});
