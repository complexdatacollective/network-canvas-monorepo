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
import { NarrativeStageEditor } from '../NarrativeStageEditor.tsx';
import { NetworkComposerStageEditor } from '../NetworkComposerStageEditor.tsx';

/**
 * What a Spanish researcher reads in a whole narrative or network-composer
 * editor.
 *
 * The sibling sweep in `src/__tests__/localeSweep.test.tsx` reaches this
 * family through the two canvas stages it mounts as SECTIONS — a sociogram and
 * a geospatial stage — which leaves the two interfaces whose sections nothing
 * else mounts unswept: the narrative's saved presets and its own behaviours
 * text, and the composer's node and edge configuration. Those are most of what
 * `sections/network/networkCanvasMessages.ts` says, and until this file
 * existed no sweep rendered any of it.
 *
 * Whole editors rather than the sections alone, for the reason the census
 * sweep gives: an interface is more than the sections it adds, and the shared
 * subject, filter, skip logic and interviewer guidance sections around them
 * say sentences a section-only sweep never sees in this composition.
 */

/** Both editors offer the same two sections switched off by default. */
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
 * fields, and the codebook these sections read type and attribute names out
 * of.
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
 * arriving — the same reading the name-generator sweep takes, and for the same
 * reason: a count would differ per interface and a wrong one would be a wait
 * that passed before the sections it was meant to wait for.
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
 * Every surface one canvas editor reaches without leaving its own areas: the
 * stage at rest, and then with each optional section switched on, because
 * those sections' fields do not exist until they are.
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
  expectNoLocaleLeaks(`${what} at rest`, researcherWords(harness));

  for (const section of OPTIONAL_SECTIONS) {
    await switchOn(harness, screen.getByRole('switch', { name: section }));
  }
  expectNoLocaleLeaks(
    `${what} with every optional section switched on`,
    researcherWords(harness),
  );
};

describe('the narrative and composer editors, swept under es', () => {
  it('sweeps a narrative stage', async () => {
    await sweepEditor(
      'the narrative stage',
      renderStageEditor({
        stageId: 'narrative-1',
        locale: 'es',
        editor: NarrativeStageEditor,
      }),
    );
  });

  it('sweeps a network composer', async () => {
    await sweepEditor(
      'the network composer',
      renderStageEditor({
        stageId: 'network-composer-1',
        locale: 'es',
        editor: NetworkComposerStageEditor,
      }),
    );
  });
});
