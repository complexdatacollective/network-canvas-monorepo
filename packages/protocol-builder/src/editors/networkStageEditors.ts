import { defineStageEditorPart } from '../stage-editor-contract.ts';
import { NarrativeStageEditor } from './network/NarrativeStageEditor.tsx';
import { NetworkComposerStageEditor } from './network/NetworkComposerStageEditor.tsx';
import { SociogramStageEditor } from './network/SociogramStageEditor.tsx';

/**
 * The interfaces that put the network in space.
 *
 * They ship as one family because they share their hard parts: each draws
 * nodes on a canvas over a background that may be a picture, and each decides
 * how those nodes are arranged. A change to any of that is one change to one
 * family rather than separate edits that can disagree.
 *
 * The geospatial interface belongs to the same family — it swaps the canvas
 * for a map while asking the same question about which part of the network the
 * stage is about — and joins this object when its editor leaves
 * `AWAITING_STAGE_EDITORS`.
 *
 * Written as an inferred object literal through `defineStageEditorPart`, never
 * as an annotated `StageEditorRegistryPart`: the annotation widens the value
 * to a registry in which every key is optional, and the package's coverage
 * checks are built on `keyof` it.
 */
export const networkStageEditors = defineStageEditorPart({
  Narrative: NarrativeStageEditor,
  Sociogram: SociogramStageEditor,
  NetworkComposer: NetworkComposerStageEditor,
});
