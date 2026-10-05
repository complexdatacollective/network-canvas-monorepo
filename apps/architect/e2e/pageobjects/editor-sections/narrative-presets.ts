import { type Page } from '@playwright/test';

import { type StageEditor } from '../stage-editor.js';
import { addPrompt } from './prompts.js';
import { chooseAttribute, chooseOrCreateAttribute } from './variables.js';

// A narrative stage's presets and the permissions beneath them, as
// `@codaco/protocol-builder` renders them.
//
// `NarrativePresetsSection` is the section "Visualization presets", whose list
// adds through "Create new preset" and whose row dialog is titled "Create
// preset" (submitted with "Add", like every other row dialog in the package).
// `NarrativePresetFields` fills that dialog with five always-open groups —
// there are no capability switches inside it any more, so nothing has to be
// turned on before it can be filled in:
// - "Preset identity" holds "Preset label" (`label`).
// - "Node layout" holds the picker "Layout attribute" (`layoutVariable`),
//   whose create row writes the `layout` attribute itself — a position is
//   finished by its name, so no editor opens.
// - "Node grouping" holds the picker "Grouping attribute" (`groupVariable`),
//   which offers no creation at all: a preset groups by a categorical
//   attribute the protocol already collects, so a fresh one would draw a
//   single hull holding everybody. Its window has no create row, and its
//   search box says "Find an attribute…" rather than "Find or create".
// - "Displayed edges" holds the tick list "Edge types" (`edges.display`), and
//   "Node highlighting" the tick list "Highlight attributes" (`highlight`).
//   Both name codebook entries, and both drop the key entirely when nothing is
//   ticked.
//
// The behaviours are one section again, as released Architect had them:
// `CanvasPermissionsSection` ("Narrative behaviors") holds three switches, in
// Architect's order — "Automatic layout" at `behaviours.automaticLayout`,
// "Free-draw" at `behaviours.freeDraw` and "Allow repositioning" at
// `behaviours.allowRepositioning`. There is no "Layout mode" list on a
// narrative stage: the shared `NodeLayoutSection` is the sociogram's. The
// Narrative template seeds automaticLayout and allowRepositioning true, so the
// automatic-layout switch opens ON and turning it off is a click.

export async function addNarrativePreset(
  editor: StageEditor,
  page: Page,
  spec: {
    label: string;
    layoutVariable: string;
    groupVariable?: string;
    displayEdges?: string[];
    highlight?: string[];
  },
): Promise<void> {
  await addPrompt(
    editor.field('presets'),
    async () => {
      await page
        .getByRole('textbox', { name: 'Preset label', exact: true })
        .fill(spec.label);
      await chooseOrCreateAttribute(
        editor.field('layoutVariable'),
        spec.layoutVariable,
      );
      if (spec.groupVariable) {
        // Chosen and never created: this picker has no create row, so a
        // grouping attribute the codebook does not hold fails on the row that
        // is not there rather than being invented behind the spec's back.
        await chooseAttribute(
          editor.field('groupVariable'),
          spec.groupVariable,
        );
      }
      for (const edgeName of spec.displayEdges ?? []) {
        await editor
          .field('edges.display')
          .getByRole('checkbox', { name: edgeName, exact: true })
          .check();
      }
      for (const variableName of spec.highlight ?? []) {
        await editor
          .field('highlight')
          .getByRole('checkbox', { name: variableName, exact: true })
          .check();
      }
    },
    { addButtonLabel: 'Create new preset' },
  );
}

export async function setNarrativeBehaviours(
  editor: StageEditor,
  opts: { freeDraw?: boolean; automaticLayout?: boolean },
): Promise<void> {
  if (opts.freeDraw) {
    await editor
      .field('behaviours.freeDraw')
      .getByRole('switch', { name: 'Free-draw', exact: true })
      .click();
  }
  if (opts.automaticLayout === false) {
    await editor
      .field('behaviours.automaticLayout')
      .getByRole('switch', { name: 'Automatic layout', exact: true })
      .click();
  }
}
