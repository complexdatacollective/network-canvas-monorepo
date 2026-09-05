import { defineStageEditorPart } from '../src/stageEditorRegistry.ts';
import { InformationEditor } from './fixtures.ts';

/**
 * MUST NOT COMPILE: a family reaching `defineStageEditorPart` through the
 * registry.
 *
 * The registry imports every family's part, so a part module that imports
 * anything from the registry closes a cycle — and a cycle here is a crash in
 * whichever direction a program enters it: reach the part first and
 * `REGISTRY_PARTS` reads a binding that holds nothing yet, so
 * `composeStageEditorRegistry` is handed `undefined` and throws `Cannot
 * convert undefined or null to object`. All three editor families hit exactly
 * that while wiring in their first part.
 *
 * The fix was to move the helper to `stage-editor-contract.ts`, a leaf. What
 * keeps it fixed is that the registry does not offer it: a re-export would be
 * one line, would look like a courtesy, and would let the next family import
 * it from the same place it always did — re-closing the cycle for whoever
 * loads the two modules in the wrong order, which is not a property any family
 * controls.
 *
 * So this probe writes exactly what a family would write, reaching the helper
 * through the registry, and must be refused. It fails BOTH ways the rule can
 * be broken: re-export the helper from the registry and this file compiles;
 * move it back into the registry and this file compiles while every other
 * probe's contract import stops resolving. Either way
 * `__tests__/stageEditorRegistry.test.tsx` reads a different set of refused
 * files and fails.
 *
 * It calls the helper rather than naming its type, so a `export type {…}`
 * re-export — which would not give a family the function it needs, and so is
 * not what this is about — could not silence the probe either.
 */
export const partFromRegistry = defineStageEditorPart({
  Information: InformationEditor,
});
