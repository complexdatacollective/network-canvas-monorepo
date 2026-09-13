import { type StageEditor } from '../stage-editor.js';
import { addPrompt } from './prompts.js';
import { chooseOrCreateAttribute } from './variables.js';

// One sociogram prompt, as `@codaco/protocol-builder`'s `SociogramPromptFields`
// renders it inside the shared prompt row dialog ("Create prompt", submitted
// with "Add"). Four always-open groups, none of them a capability with a
// switch — a prompt says what the canvas does while it is on screen, and every
// part of that is a question the researcher answers rather than one they turn
// on:
// - "Participant prompt" holds the rich-text field "Prompt text" (`text`).
// - "Node layout" holds the picker "Layout attribute"
//   (`layout.layoutVariable`). There is no create control beside it: the slot
//   binds a `layout` attribute, which a name finishes, so the picker's own
//   create row writes it straight to the codebook and no editor opens.
// - "Node interaction" holds one choice, "Interaction type", between "Nothing",
//   "Edge creation" and "Attribute toggling" — mutually exclusive, because
//   the stage schema refuses a prompt that both draws edges and toggles an
//   attribute. Choosing "Edge creation" reveals the edge-type
//   radiogroup "Created edge type" (`edges.create`); choosing "Attribute
//   toggling" reveals the picker "Boolean attribute" (`highlight.variable`),
//   whose create row writes a `boolean` attribute the same way, and writes
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

export async function addSociogramPrompt(
  editor: StageEditor,
  spec: SociogramPromptSpec,
): Promise<void> {
  await addPrompt(editor.field('prompts'), async () => {
    await editor.fillRichTextMarkdown('Prompt text', spec.text);
    // A position attribute is finished by its name, so the create row writes
    // it and binds it with no editor in between.
    await chooseOrCreateAttribute(
      editor.field('layout.layoutVariable'),
      spec.layoutVariable,
    );

    const interaction = spec.interaction;
    if (interaction) {
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
        // Boolean, so this create row writes the attribute too.
        await chooseOrCreateAttribute(
          editor.field('highlight.variable'),
          interaction.variableName,
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
