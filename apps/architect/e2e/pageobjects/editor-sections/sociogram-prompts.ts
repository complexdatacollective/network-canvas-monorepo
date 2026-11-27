import { type StageEditor } from '../stage-editor.js';
import { addPrompt } from './prompts.js';
import { chooseOrCreateAttribute } from './variables.js';

// One sociogram prompt, as `@codaco/protocol-builder`'s `SociogramPromptFields`
// renders it inside the shared prompt row dialog ("Create prompt", submitted
// with "Add"). The layout is not a prompt setting: the stage's own "Layout"
// section chooses it once for every prompt (`chooseStageLayout`). Three
// groups; only "Node interaction" carries a switch, because
// a prompt that does nothing when a node is tapped is how a sociogram says so
// — the rest are questions the researcher answers rather than ones they turn
// on:
// - "Participant prompt" holds the rich-text field "Prompt text" (`text`).
// - "Node interaction" is toggleable, and switched off is how a prompt says
//   tapping does nothing. Switched on it holds one choice, "Interaction type",
//   between "Edge creation" and "Attribute toggling" — mutually exclusive,
//   because the stage schema refuses a prompt that both draws edges and
//   toggles an attribute. Choosing "Edge creation" reveals the edge-type
//   radiogroup "Created edge type" (`edges.create`); choosing "Attribute
//   toggling" reveals the picker "Boolean attribute" (`highlight.variable`),
//   whose create row makes a `boolean` attribute the same way, and writes
//   `highlight.allowHighlighting: true` for itself.
// - "Displayed edges" holds the tick list "Edge types"
//   (`edges.display`). Choosing a connection type to CREATE here ticks that
//   type and locks its box, so a displayed-edges list that names it is
//   already satisfied — hence the guarded check rather than a blind one.
export type SociogramPromptSpec = {
  text: string;
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

    const interaction = spec.interaction;
    if (interaction) {
      const tapping = editor.section('Node interaction');
      // Switched off is "tapping does nothing", so the choice is only on
      // screen once the section is on.
      await tapping
        .getByRole('switch', { name: 'Node interaction', exact: true })
        .click();
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

/**
 * Chooses the layout a sociogram or network composer stage stores positions
 * in, from the stage's `layout` field, creating it when the codebook has no
 * layout of that name. A layout is finished by its name, so the picker's create
 * row writes it with the stage's draft and no editor opens.
 */
export async function chooseStageLayout(
  editor: StageEditor,
  layoutName: string,
): Promise<void> {
  await chooseOrCreateAttribute(editor.field('layout'), layoutName);
}
