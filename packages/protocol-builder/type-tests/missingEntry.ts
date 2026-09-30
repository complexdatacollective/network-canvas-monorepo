import { defineStageEditor } from '../src/editors/defineStageEditor.tsx';
import {
  type Assert,
  type AwaitingListIsComplete,
} from '../src/stageEditorRegistry.ts';

/**
 * MUST NOT COMPILE: an interface nothing renders and nothing admits to.
 *
 * `EgoForm` has no editor here and is absent from the list, which is exactly
 * the shape of a stage type added to the schema with no family claiming it.
 * The build has to stop, or the interface reaches a researcher as a page that
 * throws.
 */
const PARTS = [defineStageEditor('Information', [])] as const;

const AWAITING = ['AlterForm'] as const;

export type ListIsComplete = Assert<
  AwaitingListIsComplete<typeof PARTS, typeof AWAITING>
>;
