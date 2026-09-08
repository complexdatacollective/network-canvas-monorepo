import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  expectNoLocaleLeaks,
  protocolStrings,
} from '../../../testing/localeSweep.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';
import { AlterEdgeFormStageEditor } from '../AlterEdgeFormStageEditor.tsx';
import { EgoFormStageEditor } from '../EgoFormStageEditor.tsx';

/**
 * What a Spanish researcher reads in a whole ego form or per-alter edge form.
 *
 * The sibling sweep in `src/__tests__/localeSweep.test.tsx` reaches this
 * family through the per-alter form and the information page, both mounted as
 * SECTIONS. That leaves the two form interfaces whose SUBJECT is not a node
 * unswept — and the subject is what the rest of the form is read against: an
 * ego form has no subject section at all and tells its fields they collect
 * against the interview's ego, while a per-alter edge form's subject is an
 * edge type and its filter narrows relationships rather than people. Each
 * renders sentences of its own that no node-subject sweep can produce.
 *
 * Whole editors rather than the sections alone, for the reason the census
 * sweep gives: an interface is more than the sections it adds, and the shared
 * introduction, skip logic and interviewer guidance sections around them say
 * sentences a section-only sweep never sees in this composition.
 */

/**
 * The two sections both fixture stages leave switched off.
 *
 * The task introduction is not among them: both stages are seeded with an
 * `introductionPanel`, so that section is already open at rest and has no
 * switch to find. It is asserted present below instead, which is what keeps it
 * inside the reading rather than merely absent from this list.
 */
const OPTIONAL_SECTIONS = [
  'Lógica de salto',
  'Guía para quien realiza la entrevista',
] as const;

const switchOn = async (
  harness: StageEditorHarness,
  control: HTMLElement,
): Promise<void> => {
  if (control.getAttribute('aria-checked') === 'true') return;
  await harness.user.click(control);
  await waitFor(() => expect(control).toBeChecked());
};

/**
 * Everything on screen that belongs to the researcher rather than to this
 * package: the whole protocol the harness mounted, the stage's own seeded
 * fields, and the codebook the form fields read attribute names out of.
 *
 * Read out of the harness rather than listed by hand, exactly as the sibling
 * sweeps do, so a fixture that gains an attribute cannot quietly widen the
 * blind spot — or start failing.
 */
const researcherWords = (harness: StageEditorHarness) =>
  protocolStrings(
    harness.session.getSnapshot().protocolSections,
    harness.seeded.fields,
    harness.hostCodebook(),
  );

/**
 * Mounted, and finished mounting.
 *
 * Both editors render the interviewer guidance section last, so an outline
 * that has reached it is the editor's own answer that no section is still
 * arriving.
 */
const settled = async (harness: StageEditorHarness): Promise<void> => {
  await screen.findByRole('textbox', { name: 'Nombre de la etapa' });
  await waitFor(() =>
    expect(harness.outline().map((entry) => entry.title)).toContain(
      'Guía para quien realiza la entrevista',
    ),
  );
};

/**
 * Every surface one form editor reaches without leaving its own areas: the
 * stage at rest, then with each optional section switched on because those
 * sections' fields do not exist until they are, and then the dialog that adds
 * a form field — which is where this family's attribute picker, and everything
 * it says about the subject it was given, is read.
 *
 * The optional sections are NAMED rather than found, so a section that stopped
 * saying its own name in Spanish fails here instead of quietly dropping out of
 * the sweep.
 */
const sweepEditor = async (
  what: string,
  harness: StageEditorHarness,
): Promise<void> => {
  await settled(harness);
  // Named rather than assumed: the seeded introduction is the one section here
  // that is open before anything is clicked, so a stage that stopped carrying
  // one would drop it out of the reading with nothing else saying so.
  expect(harness.outline().map((entry) => entry.title)).toContain(
    'Introducción a la tarea',
  );
  expectNoLocaleLeaks(`${what} at rest`, researcherWords(harness));

  for (const section of OPTIONAL_SECTIONS) {
    await switchOn(harness, screen.getByRole('switch', { name: section }));
  }
  expectNoLocaleLeaks(
    `${what} with every optional section switched on`,
    researcherWords(harness),
  );

  await harness.user.click(
    screen.getByRole('button', { name: 'Crear nuevo campo de formulario' }),
  );
  await screen.findByRole('dialog');
  await waitFor(() =>
    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0),
  );
  expectNoLocaleLeaks(`${what}, adding a form field`, researcherWords(harness));
};

describe('the ego and edge form editors, swept under es', () => {
  it('sweeps an ego form', async () => {
    await sweepEditor(
      'the ego form',
      renderStageEditor({
        stageId: 'ego-form-1',
        locale: 'es',
        editor: EgoFormStageEditor,
      }),
    );
  });

  it('sweeps a per-alter edge form', async () => {
    await sweepEditor(
      'the per-alter edge form',
      renderStageEditor({
        stageId: 'alter-edge-form-1',
        locale: 'es',
        editor: AlterEdgeFormStageEditor,
      }),
    );
  });
});
