import { expect, type Locator, type Page } from '@playwright/test';

import { type StageEditor } from '../stage-editor.js';
import { addPrompt } from './prompts.js';
import { chooseAttributeIfOffered } from './variables.js';

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
// - "Node positions" holds the picker "Position attribute" (`layoutVariable`)
//   and the button "Create a new position attribute" beside it.
// - "Node grouping" holds the picker "Grouping attribute" (`groupVariable`)
//   and NO create button: a preset groups by a categorical attribute the
//   protocol already collects, so there is nothing here to invent.
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

/**
 * Chooses a codebook attribute in one of the preset dialog's pickers.
 *
 * `VariablePickerField` is handed options and no `onCreateOption` here, so
 * its window only chooses from the attributes that exist (and where the type
 * has none of the kind the field shows a sentence and no trigger). Where the
 * group
 * offers a `CreateVariableButton`, `createLabel` names it: it opens the
 * codebook's own attribute editor — "Attribute name", submitted with "Create
 * attribute" — in a dialog titled with the button's own label.
 */
async function chooseAttribute(
  page: Page,
  field: Locator,
  opts: { name: string; createLabel?: string; scope: Locator },
): Promise<void> {
  if (await chooseAttributeIfOffered(field, opts.name)) return;
  if (opts.createLabel === undefined) {
    throw new Error(
      `The attribute "${opts.name}" is not offered here and this control cannot create one. Add it to the codebook first.`,
    );
  }
  await opts.scope
    .getByRole('button', { name: opts.createLabel, exact: true })
    .click();
  const editor = page.getByRole('dialog', {
    name: opts.createLabel,
    exact: true,
  });
  await editor
    .getByRole('textbox', { name: 'Attribute name', exact: true })
    .fill(opts.name);
  await editor
    .getByRole('button', { name: 'Create attribute', exact: true })
    .click();
  // The write goes to the codebook under its section's own lock and the id
  // comes back afterwards, so the picker holds the new attribute only once the
  // editor has closed.
  await editor.waitFor({ state: 'detached' });
  // The picker states what it holds as a typed pill, not as a selected
  // option.
  await expect(field.locator('[data-attribute-type]')).toHaveText(opts.name);
}

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
      await chooseAttribute(page, editor.field('layoutVariable'), {
        name: spec.layoutVariable,
        createLabel: 'Create a new position attribute',
        scope: editor.section('Node positions'),
      });
      if (spec.groupVariable) {
        await chooseAttribute(page, editor.field('groupVariable'), {
          name: spec.groupVariable,
          scope: editor.section('Node grouping'),
        });
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
