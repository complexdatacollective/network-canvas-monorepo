import { defineStageEditorPart } from '../stage-editor-contract.ts';
import { GeospatialStageEditor } from './network/GeospatialStageEditor.tsx';
import { NarrativeStageEditor } from './network/NarrativeStageEditor.tsx';
import { NetworkComposerStageEditor } from './network/NetworkComposerStageEditor.tsx';
import { SociogramStageEditor } from './network/SociogramStageEditor.tsx';

/**
 * The four interfaces that put the network in space.
 *
 * They ship as one family because they share their hard parts: three of them
 * draw nodes on a canvas over a background that may be a picture, three of
 * them decide how those nodes are arranged, and the fourth swaps the canvas
 * for a map while asking the same question about which part of the network the
 * stage is about. A change to any of that is one change to one family rather
 * than four separate edits that can disagree.
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
  Geospatial: GeospatialStageEditor,
});
