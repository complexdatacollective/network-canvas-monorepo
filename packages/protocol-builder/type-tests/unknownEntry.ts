import { defineStageEditorPart } from '../src/stage-editor-contract.ts';
import { InformationEditor } from './fixtures.ts';

/**
 * MUST NOT COMPILE: a family claiming an interface the schema does not have.
 *
 * The mirror image of `missingEntry.ts`. That probe is about a stage type with
 * no editor; this one is about an editor with no stage type — a family that
 * registers `Questionnaire`, or misspells `NameGeneratorRoster`, and ships an
 * editor no stage can ever open. Nothing at run time would say so: the entry
 * simply sits in the registry and is never looked up, and the interface the
 * family MEANT to claim goes on being one nothing renders.
 *
 * It has to be refused here, at the part, rather than where the registry is
 * composed: a key that is not a stage type is not one `RegisteredIn` can
 * subtract from anything, so the coverage machinery downstream reads a family
 * that claimed nothing at all and reports only the interface that is missing —
 * which is the wrong interface to be told about, in the wrong file.
 *
 * Its control is every other probe here: they all name real stage types
 * through the same helper and all compile.
 */
export const claimsAnInterfaceTheSchemaDoesNotHave = defineStageEditorPart({
  Questionnaire: InformationEditor,
});
