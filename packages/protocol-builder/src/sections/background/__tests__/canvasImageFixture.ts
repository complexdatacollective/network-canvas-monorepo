import type { StageType } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { loadFixtureStage } from '../../../testing/protocolFixture.ts';

/**
 * The one thing the shared all-interfaces protocol does not have: a canvas
 * whose background is a picture.
 *
 * Every canvas stage in that protocol draws concentric circles, so the image
 * half of `imageOrCirclesBackgroundSchema` — the half that makes the two
 * mutually exclusive, and the half a stale key would break — has nothing to be
 * tested against. Rather than change a fixture the end-to-end suites also
 * drive, the stage is derived from one of them here and the image it names is
 * added to the manifest the editor is opened over.
 */
export const CANVAS_IMAGE_ID = 'canvas_backdrop';

export const CANVAS_IMAGE_NAME = 'Neighbourhood map';

export const canvasImageAssets: Readonly<Record<string, SectionDoc>> =
  Object.freeze({
    [CANVAS_IMAGE_ID]: Object.freeze({
      name: CANVAS_IMAGE_NAME,
      type: 'image',
      source: 'neighbourhood.png',
    }),
  });

/**
 * A fixture stage of `stageId`'s interface whose background is that image.
 *
 * It keeps the fixture stage's own id, so it stands in for that stage rather
 * than sitting beside a copy that holds the same object ids.
 *
 * Derived from the fixture rather than written out, so it keeps every other
 * key that interface requires: what is under test is the background, and a
 * hand-written stage missing a required key would fail its save for an
 * unrelated reason.
 */
export function stageWithImageBackground(
  stageId: string,
): Readonly<{ id: string; type: StageType; fields: SectionDoc }> {
  const { id, type, fields } = loadFixtureStage(stageId);
  return {
    id,
    type,
    fields: { ...fields, background: { image: CANVAS_IMAGE_ID } },
  };
}
