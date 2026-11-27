import { type StageEditor } from '../stage-editor.js';
import { addPrompt } from './prompts.js';
import { chooseOrCreateAttribute } from './variables.js';

// One sociogram prompt, as `@codaco/protocol-builder`'s `SociogramPromptFields`
// renders it inside the shared prompt row dialog ("Create prompt", submitted
// with "Add"). The layout is not a prompt setting: the stage's own "Layout"
// section chooses it once for every prompt (`chooseStageLayout`). Three
// groups:
// - "Participant prompt" holds the rich-text field "Prompt text" (`text`).
// - "Task" holds one choice, "Task type" (`task`), between "Position nodes"
//   (the default), "Highlight nodes" and "Connect nodes". Choosing "Connect
//   nodes" reveals the edge-type radiogroup "Created edge type"
//   (`edges.create`); choosing "Highlight nodes" reveals the picker "Boolean
//   attribute" (`highlightVariable`), whose create row makes a `boolean`
//   attribute the same way. The saved prompt keeps only its own task's fields.
// - "Displayed edges" holds the tick list "Edge types"
//   (`edges.display`). Choosing a connection type to CREATE here ticks that
//   type and locks its box, so a displayed-edges list that names it is
//   already satisfied — hence the guarded check rather than a blind one.
export type SociogramPromptSpec = {
  text: string;
  /** Left out, the prompt keeps the default task: positioning nodes. */
  task?:
    | { kind: 'connect'; edgeName: string; createNewEdgeType?: boolean }
    | { kind: 'highlight'; variableName: string };
  displayEdges?: string[];
};

export async function addSociogramPrompt(
  editor: StageEditor,
  spec: SociogramPromptSpec,
): Promise<void> {
  await addPrompt(editor.field('prompts'), async () => {
    await editor.fillRichTextMarkdown('Prompt text', spec.text);

    const task = spec.task;
    if (task) {
      const taskType = editor
        .field('task')
        .getByRole('listbox', { name: 'Task type', exact: true });
      if (task.kind === 'connect') {
        if (task.createNewEdgeType) {
          // The prompt dialog's "Created edge type" control is
          // `EntityTypePickerField`, which chooses among the edge types the
          // codebook already has and offers no way to add one — the "Create a
          // new edge type" button belongs to the stage's own subject section,
          // and a sociogram's subject is a node. An edge type this prompt is
          // to draw has to exist before the prompt is written.
          throw new Error(
            `Cannot create the edge type "${task.edgeName}" from a sociogram prompt: the prompt's connection-type picker only chooses existing types. Create it first (a stage whose subject is an edge, or the codebook screen).`,
          );
        }
        await taskType.getByRole('option', { name: /^Connect nodes/ }).click();
        await editor
          .field('edges.create')
          .getByRole('radio', { name: task.edgeName, exact: true })
          // The chip's own label: the radio inside it is `sr-only`, which is
          // not something a researcher can click.
          .locator('xpath=ancestor::label[1]')
          .click();
      } else {
        await taskType
          .getByRole('option', { name: /^Highlight nodes/ })
          .click();
        // Boolean, so this create row writes the attribute too.
        await chooseOrCreateAttribute(
          editor.field('highlightVariable'),
          task.variableName,
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
