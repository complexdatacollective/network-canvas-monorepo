import { defineStageEditor } from '../src/editors/defineStageEditor.tsx';
import {
  type Assert,
  type CoversEveryStageType,
} from '../src/stageEditorRegistry.ts';

/**
 * MUST NOT COMPILE: an interface nothing renders.
 *
 * Only `Information` has an editor here, which is the shape of a stage type
 * added to the schema with no part claiming it. The build has to stop, or the
 * interface reaches a researcher as a page that throws.
 */
const PARTS = [defineStageEditor('Information', [])] as const;

export type EveryTypeCovered = Assert<CoversEveryStageType<typeof PARTS>>;
