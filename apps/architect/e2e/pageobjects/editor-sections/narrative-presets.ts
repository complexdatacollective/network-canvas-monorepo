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
// - "Node layout" holds the picker "Layout" (`layout`), which chooses a
//   layout of the codebook and whose create row adds one — a layout is
//   finished by its name, so no editor opens.
// - "Node grouping" holds the picker "Grouping attribute" (`groupVariable`),
//   which offers no creation at all: a preset groups by a categorical
//   attribute the protocol already collects, so a fresh one would draw a
//   single hull holding everybody. Its window has no create row, and its
//   search box says "Find an attribute…" rather than "Find or create".
// - "Displayed edges" holds the tick list "Edge types" (`edges.display`),
//   which names codebook entries and drops the key entirely when nothing is
//   ticked.
// - "Node highlighting" holds the list "Highlights", which adds an entry
//   through "Add a highlight". Each entry is a group "Highlight <number>"
//   holding a required, translatable "Highlight label" box and one boolean
//   attribute picker per node type the stage shows: "Attribute" on a stage
//   with one type, "Attribute for <node type name>" on a stage with several,
//   where each picker is optional but an entry must name one attribute.

export async function addNarrativePreset(
  editor: StageEditor,
  page: Page,
  spec: {
    label: string;
    layout: string;
    groupVariable?: string;
    displayEdges?: string[];
    // `nodeType` names the picker on a stage that shows several node types,
    // and is left out on a stage that shows one.
    highlight?: {
      label: string;
      attributes: { attribute: string; nodeType?: string }[];
    }[];
  },
): Promise<void> {
  await addPrompt(
    editor.field('presets'),
    async () => {
      await page
        .getByRole('textbox', { name: 'Preset label', exact: true })
        .fill(spec.label);
      await chooseOrCreateAttribute(editor.field('layout'), spec.layout);
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
      for (const [index, highlight] of (spec.highlight ?? []).entries()) {
        await page
          .getByRole('button', { name: 'Add a highlight', exact: true })
          .click();
        const entry = page.getByRole('group', {
          name: `Highlight ${index + 1}`,
          exact: true,
        });
        await entry
          .getByRole('textbox', { name: 'Highlight label', exact: true })
          .fill(highlight.label);
        for (const { attribute, nodeType } of highlight.attributes) {
          const pickerLabel =
            nodeType === undefined ? 'Attribute' : `Attribute for ${nodeType}`;
          // The picker's field name holds the entry's generated id, so the
          // field is found by its own label inside the entry.
          await chooseAttribute(
            entry.locator('[data-field-name]').filter({
              has: page
                .locator('label[id$="-label"]')
                .getByText(pickerLabel, { exact: true }),
            }),
            attribute,
          );
        }
      }
    },
    { addButtonLabel: 'Create new preset' },
  );
}
