import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import { expectNoLocaleLeaks } from '../../testing/localeSweep.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../testing/renderStageEditor.tsx';
import { nameGeneratorStageEditors } from '../nameGeneratorStageEditors.ts';

/**
 * What a Spanish researcher reads when a WHOLE name-generator editor is on
 * screen — the shell, the stage heading, this family's own sections, and the
 * shared ones the frame puts under them.
 *
 * The sibling sweep in `src/__tests__/localeSweep.test.tsx` asks the same
 * question of individual sections. This one asks it of the COMPOSITION,
 * because that is the only place several of these defects can appear at all: a
 * shell control no section test mounts, an outline entry naming a section from
 * outside it, a section rendering English between two that do not. Each editor
 * is reached through its family's registry, so what is swept is also what a
 * host would dispatch to.
 *
 * Three stages rather than eight: between them the three name generators mount
 * every section this family added — the roster's data file, cards, order and
 * search; the form-based generator's form fields, prompt stamps and side
 * panels; quick add's single attribute — plus the nomination window and the
 * frame all three share. The four form editors mount `FormFieldsSection` and
 * `PageContentSection`, which the sibling sweep already drives, and the
 * form-based generator below mounts the first of them again in composition.
 */

/**
 * The form-based generator seeded with the two capabilities its fixture stage
 * leaves off.
 *
 * `name-generator-1` carries no `panels` and no `behaviours`, so both sections
 * render their waiting state and the sweep would never reach the copy inside
 * a panel row or beside a nomination limit — which is most of what those two
 * sections say. Seeded rather than switched on by clicking, so what is swept
 * is a configured stage at rest rather than a stage mid-edit.
 */
const PANELLED_NAME_GENERATOR: SectionDoc = {
  label: 'Name Generator',
  subject: { entity: 'node', type: 'person' },
  form: {
    title: 'Add a person',
    fields: [{ variable: 'name', prompt: "What is this person's name?" }],
  },
  prompts: [
    {
      id: 'prompt-1',
      text: 'Who are the people you know?',
      additionalAttributes: [{ variable: 'flagged', value: true }],
    },
  ],
  panels: [
    {
      id: 'panel-1',
      title: 'People you named earlier',
      dataSource: 'existing',
    },
  ],
  behaviours: { minNodes: 1, maxNodes: 8 },
};

/**
 * Mounted, and finished mounting.
 *
 * Every section registers with the outline as it mounts, and the frame's own
 * interviewer guidance is the last one every editor here renders — so an
 * outline that has reached it is the editor's own answer that no section is
 * still arriving. Asked of the outline rather than of a count, because the
 * count differs per interface and a wrong one would be a wait that passed
 * before the sections it was meant to wait for.
 */
const settled = async (harness: StageEditorHarness) => {
  await screen.findByRole('textbox', { name: 'Nombre de la etapa' });
  await waitFor(() =>
    expect(harness.outline().map((entry) => entry.title)).toContain(
      'Guía para quien realiza la entrevista',
    ),
  );
};

/**
 * The one leak a roster stage still has, and whose it is.
 *
 * `ExternalDataSourceSection` mounts the shared resource picker, and the
 * summary it shows of the chosen file writes its own terms as JSX attributes
 * — `<Detail term="Attributes">` among them, which is the English of an id
 * this package already translates. `src/resources` is the localisation
 * branch's to convert and is listed as such in `NOT_CONVERTED_YET`, so the
 * fix belongs there rather than here; recorded instead, so that a Spanish
 * researcher reading "Attributes" inside a Spanish stage is a fact this
 * suite states rather than one it passes over.
 */
const RESOURCE_SUMMARY_IS_ENGLISH = [
  'protocolBuilder.codebookEntity.attributesHeading rendered in English: Attributes',
];

describe('the name-generator editors under es, at rest', () => {
  it('sweeps a roster name generator', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-roster-1',
      locale: 'es',
      registry: nameGeneratorStageEditors,
    });
    await settled(harness);
    // The columns of the data file arrive after the mount, and the four
    // sections describing the roster say nothing until they do.
    await screen.findByRole('list', {
      name: /Atributos mostrados en una tarjeta/,
    });

    expectNoLocaleLeaks('a roster name generator at rest', harness, {
      stillEnglish: RESOURCE_SUMMARY_IS_ENGLISH,
    });
  });

  it('sweeps a form-based name generator', async () => {
    const harness = renderStageEditor({
      stage: { type: 'NameGenerator', fields: PANELLED_NAME_GENERATOR },
      locale: 'es',
      registry: nameGeneratorStageEditors,
    });
    await settled(harness);
    await screen.findByRole('list', { name: /Paneles/ });

    expectNoLocaleLeaks('a form-based name generator at rest', harness);
  });

  it('sweeps a quick-add name generator', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      locale: 'es',
      registry: nameGeneratorStageEditors,
    });
    await settled(harness);

    expectNoLocaleLeaks('a quick-add name generator at rest', harness);
  });
});
