import { expect, type Locator, type Page } from '@playwright/test';

import { type StageEditor } from '../stage-editor.js';
import { addPrompt } from './prompts.js';

// One sociogram prompt, as `@codaco/protocol-builder`'s `SociogramPromptFields`
// renders it inside the shared prompt row dialog ("Create prompt", submitted
// with "Add"). Four always-open groups, none of them a capability with a
// switch — a prompt says what the canvas does while it is on screen, and every
// part of that is a question the researcher answers rather than one they turn
// on:
// - "Participant prompt" holds the rich-text field "Prompt text" (`text`).
// - "Node layout" holds the picker "Layout attribute"
//   (`layout.layoutVariable`) and, beside it, the button "Create a new
//   position attribute", which opens the codebook's own attribute editor
//   locked to the layout type. The picker is a native `<select>` over the
//   attributes that exist, so it can only ever CHOOSE; creating is the
//   button's job, not the picker's.
// - "Node interaction" holds one choice, "Interaction type", between "Nothing",
//   "Edge creation" and "Attribute toggling" — mutually exclusive, because
//   the stage schema refuses a prompt that both draws edges and toggles an
//   attribute. Choosing "Edge creation" reveals the edge-type
//   radiogroup "Created edge type" (`edges.create`); choosing "Attribute
//   toggling" reveals the picker "Boolean attribute" (`highlight.variable`)
//   with its own "Create a new true-or-false attribute" button, and writes
//   `highlight.allowHighlighting: true` for itself.
// - "Displayed edges" holds the tick list "Edge types"
//   (`edges.display`). Choosing a connection type to CREATE here ticks that
//   type and locks its box, so a displayed-edges list that names it is
//   already satisfied — hence the guarded check rather than a blind one.
export type SociogramPromptSpec = {
  text: string;
  layoutVariable: string;
  interaction?:
    | { kind: 'createEdge'; edgeName: string; createNewEdgeType?: boolean }
    | { kind: 'highlight'; variableName: string };
  displayEdges?: string[];
};

/**
 * Chooses a codebook attribute in one of the dialog's pickers, creating it
 * first when the codebook has none by that name.
 *
 * The picker never invents anything: `VariablePickerField` here is handed
 * options and no `onCreateOption`, so it renders a `<select>` over what exists
 * (or a sentence saying the type has none yet, and no `<select>` at all). The
 * neighbouring `CreateVariableButton` is what adds one, through the codebook's
 * own editor — "Attribute name", submitted with "Create attribute" — under a
 * dialog whose title is the button's own label.
 */
async function chooseOrCreateAttribute(
  page: Page,
  field: Locator,
  opts: { name: string; createLabel: string; scope: Locator },
): Promise<void> {
  const select = field.locator('select');
  if (await select.count()) {
    // Compared whole rather than by substring: an attribute called "layout"
    // must not be answered by an existing "layout_2".
    const offered = await select.locator('option').allInnerTexts();
    if (offered.includes(opts.name)) {
      await select.selectOption({ label: opts.name });
      await expect(field.locator('option:checked')).toHaveText(opts.name);
      return;
    }
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
  // comes back afterwards, so the picker holds the new attribute only once
  // the editor has closed.
  await editor.waitFor({ state: 'detached' });
  await expect(field.locator('option:checked')).toHaveText(opts.name);
}

export async function addSociogramPrompt(
  editor: StageEditor,
  page: Page,
  spec: SociogramPromptSpec,
): Promise<void> {
  await addPrompt(editor.field('prompts'), async () => {
    await editor.fillRichTextMarkdown('Prompt text', spec.text);
    await chooseOrCreateAttribute(page, editor.field('layout.layoutVariable'), {
      name: spec.layoutVariable,
      createLabel: 'Create a new position attribute',
      scope: editor.section('Node layout'),
    });

    const interaction = spec.interaction;
    if (interaction) {
      const tapping = editor.section('Node interaction');
      const behaviour = editor
        .field('tap-behaviour')
        .getByRole('listbox', { name: 'Interaction type', exact: true });
      if (interaction.kind === 'createEdge') {
        if (interaction.createNewEdgeType) {
          // The prompt dialog's "Created edge type" control is
          // `EntityTypePickerField`, which chooses among the edge types the
          // codebook already has and offers no way to add one — the "Create a
          // new edge type" button belongs to the stage's own subject section,
          // and a sociogram's subject is a node. An edge type this prompt is
          // to draw has to exist before the prompt is written.
          throw new Error(
            `Cannot create the edge type "${interaction.edgeName}" from a sociogram prompt: the prompt's connection-type picker only chooses existing types. Create it first (a stage whose subject is an edge, or the codebook screen).`,
          );
        }
        await behaviour.getByRole('option', { name: /^Edge creation/ }).click();
        await editor
          .field('edges.create')
          .getByRole('radio', { name: interaction.edgeName, exact: true })
          // The chip's own label: the radio inside it is `sr-only`, which is
          // not something a researcher can click.
          .locator('xpath=ancestor::label[1]')
          .click();
      } else {
        await behaviour
          .getByRole('option', { name: /^Attribute toggling/ })
          .click();
        await chooseOrCreateAttribute(
          page,
          editor.field('highlight.variable'),
          {
            name: interaction.variableName,
            createLabel: 'Create a new true-or-false attribute',
            scope: tapping,
          },
        );
      }
    }

    if (spec.displayEdges) {
      for (const edgeName of spec.displayEdges) {
        const checkbox = editor
          .field('edges.display')
          .getByRole('checkbox', { name: edgeName, exact: true });
        if (!(await checkbox.isChecked())) {
          await checkbox.check();
        }
      }
    }
  });
}
