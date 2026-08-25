import { type Locator, type Page } from '@playwright/test';

import { type StageEditor } from '../stage-editor.js';
import { addPrompt } from './prompts.js';
import { createVariableViaSpotlight } from './variables.js';

// SociogramPrompts prompt dialog (sections/SociogramPrompts/*). Facts
// verified against source:
// - The layout picker (data-field-name="layout.layoutVariable") creates
//   layout-typed variables through the simple spotlight path.
// - 'Node interaction' is toggleable and collapsed for a fresh prompt.
//   Closing it discards its descendant fields, so a layout-only prompt leaves
//   `highlight` absent.
// - The behaviour radios carry long markdown accessible names — matched via
//   a name REGEX (their labels are sibling <label> elements, so the radio
//   buttons have no text content for hasText to match). 'Edge
//   Creation' writes `highlight: { allowHighlighting: false }` as a side
//   effect; selecting a create-edge auto-unions it into `edges.display`
//   (PromptFieldsEdges mount effect), which also auto-expands the Display
//   Edges section — its switch state must be guarded, never blind-clicked.
// - 'Attribute Toggling' writes `highlight.allowHighlighting: true` and
//   reveals the boolean picker (data-field-name="highlight.variable"),
//   which creates boolean variables.
export type SociogramPromptSpec = {
  text: string;
  layoutVariable: string;
  interaction?:
    | { kind: 'createEdge'; edgeName: string; createNewEdgeType?: boolean }
    | { kind: 'highlight'; variableName: string; create?: boolean };
  displayEdges?: string[];
};

export async function addSociogramPrompt(
  editor: StageEditor,
  page: Page,
  spec: SociogramPromptSpec,
): Promise<void> {
  const fresh = (candidate: Page): Locator =>
    candidate
      .locator('[data-field-name="layout.layoutVariable"]')
      .getByRole('button', { name: 'Select attribute' });
  await addPrompt(
    editor.field('prompts'),
    async () => {
      await editor.fillRichTextMarkdown('Prompt text', spec.text);
      await createVariableViaSpotlight(page, {
        variableName: spec.layoutVariable,
        scope: editor.field('layout.layoutVariable'),
        until: editor
          .field('layout.layoutVariable')
          .getByRole('button', { name: 'Change attribute' }),
      });

      const interaction = spec.interaction;
      if (interaction) {
        const section = editor.section('Node interaction');
        const toggle = section.getByRole('switch', {
          name: 'Node interaction',
          exact: true,
        });
        await toggle.click();
        if (interaction.kind === 'createEdge') {
          // The behaviour radios' long markdown labels are SIBLING <label>
          // elements — the radio button itself has no text content, so
          // .filter({hasText}) can never match. The accessible NAME includes
          // the label, so a name regex is the right long-markdown matcher.
          await section.getByRole('radio', { name: /Edge Creation/ }).click();
          if (interaction.createNewEdgeType) {
            await editor
              .field('edges.create')
              .getByRole('button', { name: 'Create new edge type' })
              .click();
            await page
              .getByRole('textbox', { name: 'Edge type name' })
              .fill(interaction.edgeName);
            await page.getByRole('button', { name: 'Save and Close' }).click();
          } else {
            await editor
              .field('edges.create')
              .getByRole('radio', {
                name: `Select edge ${interaction.edgeName}`,
                exact: true,
              })
              .click();
          }
        } else {
          await section
            .getByRole('radio', { name: /Attribute Toggling/ })
            .click();
          await createVariableViaSpotlight(page, {
            variableName: interaction.variableName,
            scope: editor.field('highlight.variable'),
            until: editor
              .field('highlight.variable')
              .getByRole('button', { name: 'Change attribute' }),
          });
        }
      }

      if (spec.displayEdges) {
        const displaySection = editor.section('Displayed edges');
        const displayToggle = displaySection.getByRole('switch', {
          name: 'Displayed edges',
          exact: true,
        });
        // The section auto-expands when edges.create is set (mount-effect
        // union) — guard instead of blind-clicking.
        if ((await displayToggle.getAttribute('aria-checked')) !== 'true') {
          await displayToggle.click();
        }
        for (const edgeName of spec.displayEdges) {
          const checkbox = editor
            .field('edges.display')
            .getByRole('checkbox', { name: edgeName, exact: true });
          if (!(await checkbox.isChecked())) {
            await checkbox.check();
          }
        }
      }
    },
    { freshSign: fresh },
  );
}
