import {
  type Assert,
  defineStageEditorPart,
  type PartsAreDisjoint,
} from '../src/stageEditorParts.ts';
import { InformationEditor } from './fixtures.ts';

/**
 * MUST NOT COMPILE: two families claiming the same interface.
 *
 * `composeStageEditorRegistry` throws on this at run time, but a duplicate
 * that reaches run time has already reached a review. Nothing chooses between
 * two claimants, so the build refuses first.
 */
const PARTS = [
  defineStageEditorPart({ Information: InformationEditor }),
  defineStageEditorPart({ Information: InformationEditor }),
] as const;

export type Disjoint = Assert<PartsAreDisjoint<typeof PARTS>>;
