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
// - "Preset identity" holds "Preset name" (`label`).
// - "Node positions" holds the picker "Position attribute" (`layoutVariable`),
//   whose create row writes the `layout` attribute itself — a position is
//   finished by its name, so no editor opens.
// - "Node grouping" holds the picker "Grouping attribute" (`groupVariable`),
//   which offers no creation at all: a preset groups by a categorical
//   attribute the protocol already collects, so a fresh one would draw a
//   single hull holding everybody. Its window has no create row, and its
//   search box says "Find an attribute…" rather than "Find or create".
// - "Connections" holds the tick list "Connection types shown"
//   (`edges.display`), and "Highlighted nodes" the tick list "Highlight
//   attributes" (`highlight`). Both name codebook entries, and both drop the
//   key entirely when nothing is ticked.
//
// The behaviours are no longer one section: what the participant may DO is
// `CanvasPermissionsSection` ("Canvas interaction" — "Allow drawing on the
// canvas" at `behaviours.freeDraw`, "Allow moving nodes" at
// `behaviours.allowRepositioning`), while how the stage arranges nodes when it
// opens is the shared `NodeLayoutSection` ("Node layout"), which is not a
// switch at all but a choice of "Layout mode" between "Manual mode" and
// "Automatic mode" written to `behaviours.automaticLayout`. The Narrative
// template seeds automaticLayout and allowRepositioning true.

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
        .getByRole('textbox', { name: 'Preset name', exact: true })
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
      .getByRole('switch', { name: 'Allow drawing on the canvas', exact: true })
      .click();
  }
  if (opts.automaticLayout === false) {
    await editor
      .field('behaviours.automaticLayout')
      .getByRole('listbox', { name: 'Layout mode', exact: true })
      .getByRole('option', { name: /^Manual mode/ })
      .click();
  }
}
