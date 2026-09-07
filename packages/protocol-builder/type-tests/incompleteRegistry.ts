import { defineStageEditorPart } from '../src/stage-editor-contract.ts';
import {
  type Assert,
  type PartsCoverEveryStageType,
} from '../src/stageEditorRegistry.ts';
import { EgoFormEditor, InformationEditor } from './fixtures.ts';

/**
 * MUST NOT COMPILE: a registry composed from parts that do not cover the
 * schema.
 *
 * This is the check that lets `StageEditor` dispatch without a branch for an
 * interface nothing renders. `stageEditorRegistry` is annotated
 * `StageEditorRegistry` — every stage type, no optional keys — so the day a
 * family's claim is dropped, or a stage type is added to the schema with no
 * family taking it, that annotation stops compiling and the package cannot be
 * built at all. What it CANNOT do is be probed: rebuilding the failure means
 * rebuilding the parts tuple, and the parts tuple is every editor family.
 *
 * So the same fact is also stated as `PartsCoverEveryStageType`, which takes
 * the parts as an argument, and this is a tuple that fails it — two families
 * and seventeen interfaces nobody claims. `EveryStageTypeHasAnEditor` in
 * `stageEditorRegistry.ts` is the control: the identical assertion over the
 * real parts, which compiles.
 */
const PARTS = [
  defineStageEditorPart({ Information: InformationEditor }),
  defineStageEditorPart({ EgoForm: EgoFormEditor }),
] as const;

export type CoversEverything = Assert<PartsCoverEveryStageType<typeof PARTS>>;
