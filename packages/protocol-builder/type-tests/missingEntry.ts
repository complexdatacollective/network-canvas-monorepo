import {
  type Assert,
  type AwaitingListIsComplete,
  defineStageEditorPart,
} from '../src/stageEditorParts.ts';
import { InformationEditor } from './fixtures.ts';

/**
 * MUST NOT COMPILE: an interface nothing renders and nothing admits to.
 *
 * `EgoForm` has no editor here and is absent from the list, which is exactly
 * the shape of a stage type added to the schema with no family claiming it.
 * The build has to stop, or the interface reaches a researcher as a page that
 * throws.
 */
const PARTS = [
  defineStageEditorPart({ Information: InformationEditor }),
] as const;

const AWAITING = ['AlterForm'] as const;

export type ListIsComplete = Assert<
  AwaitingListIsComplete<typeof PARTS, typeof AWAITING>
>;
