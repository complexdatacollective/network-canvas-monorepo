import type { BackgroundDocument, Vec } from '~/model/types';
import type { StageBox } from '~/state/documentGeometry';

import { type Handle, resizeElement } from './canvasGeometry';

// Every frame in one resize gesture must derive from the same pre-gesture
// document. In particular, after a corner crosses its opposite anchor, feeding
// the previously resized shape back into resizeElement would move that anchor
// on each subsequent pointer frame.
export function resizeDocumentFromSnapshot(
  snapshot: BackgroundDocument,
  elementId: string,
  handle: Handle,
  point: Vec,
  stage: StageBox | null,
): BackgroundDocument {
  return {
    ...snapshot,
    elements: snapshot.elements.map((element) =>
      element.id === elementId
        ? resizeElement(element, handle, point, stage)
        : element,
    ),
  };
}
