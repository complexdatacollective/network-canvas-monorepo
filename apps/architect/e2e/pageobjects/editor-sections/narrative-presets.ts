import { type Page } from '@playwright/test';

import { type StageEditor } from '../stage-editor.js';
import { addPrompt } from './prompts.js';
import { createVariableViaSpotlight } from './variables.js';

// NarrativePresets + NarrativeBehaviours sections. Facts verified against
// source (sections/NarrativePresets/*, sections/NarrativeBehaviours.tsx):
// - The preset dialog ('Edit Preset') exposes: label (by placeholder — the
//   narrative.spec.ts precedent), layoutVariable (VariablePicker; typing an
//   existing variable's exact name Enter-selects it), and three toggleable
//   subsections — Group Variable (disallowCreation picker), Display Edges
//   and Highlight Node Attributes (checkbox groups whose accessible names
//   are the codebook entity/variable names; arrays fill in click order).
// - normalizePreset drops groupVariable/edges/highlight when empty, so only
//   configured keys persist.
// - Behaviour switches are named by their field labels (NOT the headings):
//   freeDraw → 'Allow drawing on the canvas', automaticLayout → 'Position
//   nodes automatically using a force-directed layout'. The Narrative
//   template seeds automaticLayout:true/allowRepositioning:true and the
//   Toggle mount effect adds freeDraw:false.
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
    editor.section('Narrative Presets'),
    async () => {
      await page
        .getByPlaceholder('Enter a label for the preset...')
        .fill(spec.label);
      await createVariableViaSpotlight(page, {
        variableName: spec.layoutVariable,
        scope: editor.field('layoutVariable'),
        until: editor
          .field('layoutVariable')
          .getByRole('button', { name: 'Change variable' }),
      });
      if (spec.groupVariable) {
        await editor
          .section('Group Variable')
          .getByRole('switch', { name: 'Turn this feature on or off' })
          .click();
        await createVariableViaSpotlight(page, {
          variableName: spec.groupVariable,
          scope: editor.field('groupVariable'),
          until: editor
            .field('groupVariable')
            .getByRole('button', { name: 'Change variable' }),
        });
      }
      if (spec.displayEdges) {
        await editor
          .section('Display Edges')
          .getByRole('switch', { name: 'Turn this feature on or off' })
          .click();
        for (const edgeName of spec.displayEdges) {
          await editor
            .field('edges.display')
            .getByRole('checkbox', { name: edgeName, exact: true })
            .check();
        }
      }
      if (spec.highlight) {
        await editor
          .section('Highlight Node Attributes')
          .getByRole('switch', { name: 'Turn this feature on or off' })
          .click();
        for (const variableName of spec.highlight) {
          await editor
            .field('highlight')
            .getByRole('checkbox', { name: variableName, exact: true })
            .check();
        }
      }
    },
    {
      freshSign: (candidate) =>
        candidate
          .locator('[data-field-name="layoutVariable"]')
          .getByRole('button', { name: 'Select variable' }),
    },
  );
}

export async function setNarrativeBehaviours(
  editor: StageEditor,
  opts: { freeDraw?: boolean; automaticLayout?: boolean },
): Promise<void> {
  const section = editor.section('Narrative Behaviours');
  // Template defaults: automaticLayout true, allowRepositioning true,
  // freeDraw false (mount effect) — only click switches that must change.
  if (opts.freeDraw) {
    await section
      .getByRole('switch', { name: 'Allow drawing on the canvas' })
      .click();
  }
  if (opts.automaticLayout === false) {
    await section
      .getByRole('switch', {
        name: 'Position nodes automatically using a force-directed layout',
      })
      .click();
  }
}
