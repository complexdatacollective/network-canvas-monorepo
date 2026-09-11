import { type Page } from '@playwright/test';

import { type StageEditor } from '../stage-editor.js';
import { importResource, selectResource } from './data-source.js';

// The shared canvas Background section (`@codaco/protocol-builder`'s
// `BackgroundSection`, always-on for Sociogram/Narrative/NetworkComposer).
// Facts read off the section's own source:
// - Which background the canvas has is one control, a `RichSelectGroupField`
//   labelled "Choose a background type" holding two cards, "Concentric
//   "Image". It renders as a listbox of options, and each option's accessible
//   name is its title followed by its description sentence — hence the
//   anchored name match rather than the whole paragraph.
// - Concentric circles is what a stage with no image opens on. The count is
//   an `IntegerField` at data-field-name="background.concentricCircles"
//   (label "Number of concentric circles", a native number input, so role
//   "spinbutton") and the skew a `ToggleField` at
//   data-field-name="background.skewedTowardCenter" (label "Make the inner
//   circles larger", role "switch").
// - Choosing "Image" discards both circle keys — the schema refuses a
//   background holding either kind's keys alongside the other's — and swaps in
//   the resource picker at data-field-name="background.image".
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
    .getByRole('listbox', { name: 'Choose a background type', exact: true })
    .getByRole('option', { name: /^Image/ })
    .click();
  const field = editor.field('background.image');
  if ('upload' in source) {
    await importResource(page, field, 'image', source.upload);
  } else {
    await selectResource(page, field, 'image', source.select);
  }
}
