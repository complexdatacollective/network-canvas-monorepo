import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import {
  expectNoLocaleLeaks,
  protocolStrings,
} from '../../testing/localeSweep.ts';
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
 * outside it, a section rendering English between two that do not. The editor
 * is reached through its family's registry, so what is swept is also what a
 * host would dispatch to.
 *
 * One stage rather than five: the form-based generator mounts every section
 * this branch added — the prompt list and its stamps, the side panels and the
 * nomination window — plus the frame under them. The four form editors mount
 * `FormFieldsSection` and `PageContentSection`, which the sibling sweep
 * already drives, and the generator below mounts the first of them again in
 * composition. The other two name generators join this table with their own
 * sections.
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
 * Everything on screen that belongs to the researcher rather than to this
 * package: the whole protocol the harness is mounted over, the stage's own
 * seeded fields, and the codebook the sections read type and attribute names
 * out of.
 *
 * Mirrors the sibling sweep's `researcherWords` in
 * `src/__tests__/localeSweep.test.tsx` for the same reason: a section can
 * show a researcher's own words from anywhere in the protocol or codebook,
 * not only from the stage under test, so what is exempted from the sweep has
 * to be read out of what the harness actually mounted rather than listed by
 * hand.
 */
const researcherWords = (harness: StageEditorHarness) =>
  protocolStrings(
    harness.session.getSnapshot().protocolSections,
    harness.seeded.fields,
    harness.hostCodebook(),
  );

describe('the name-generator editor under es, at rest', () => {
  it('sweeps a form-based name generator', async () => {
    const harness = renderStageEditor({
      stage: { type: 'NameGenerator', fields: PANELLED_NAME_GENERATOR },
      locale: 'es',
      registry: nameGeneratorStageEditors,
    });
    await settled(harness);
    await screen.findByRole('list', { name: /Paneles/ });

    expectNoLocaleLeaks(
      'a form-based name generator at rest',
      researcherWords(harness),
    );
  });
});
