import { type Page } from '@playwright/test';

import { type StageEditor } from '../stage-editor.js';
import {
  openResourceBrowser,
  pickResource,
  uploadIntoResourceBrowser,
} from './asset-upload.js';

// Canvas Background section (sections/Background/*, `Section
// title="Background"`, always-on for Sociogram/Narrative). Facts verified
// against source:
// - Concentric-circles mode is pre-selected on a fresh stage; the count is a
//   native number input (role spinbutton) at
//   data-field-name="background.concentricCircles" and the skew toggle a
//   switch at data-field-name="background.skewedTowardCenter" (the Toggle
//   mount effect force-writes `false`, so only click for `true`).
// - Choosing the 'Image' option (RichSelectGroup role=option, name matched by
//   prefix — the full accessible name includes the description sentence)
//   nulls both circle keys; the image is then picked (or uploaded at first
//   use — a single upload auto-selects and closes the browser) through
//   data-field-name="background.image"'s Resource Browser.
export async function setConcentricCirclesBackground(
  editor: StageEditor,
  opts: { circles: number; skewed?: boolean },
): Promise<void> {
  await editor
    .field('background.concentricCircles')
    .getByRole('spinbutton')
    .fill(String(opts.circles));
  if (opts.skewed) {
    await editor
      .field('background.skewedTowardCenter')
      .getByRole('switch')
      .click();
  }
}

export async function setImageBackground(
  editor: StageEditor,
  page: Page,
  source: { select: string } | { upload: string },
): Promise<void> {
  await editor
    .section('Background')
    .getByRole('option', { name: /^Image/ })
    .click();
  await openResourceBrowser(editor.field('background.image'));
  if ('upload' in source) {
    await uploadIntoResourceBrowser(page, source.upload);
  } else {
    await pickResource(page, source.select);
  }
}
