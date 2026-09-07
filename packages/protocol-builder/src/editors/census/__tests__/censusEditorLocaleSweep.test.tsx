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
import { CategoricalBinStageEditor } from '../CategoricalBinStageEditor.tsx';
import { DyadCensusStageEditor } from '../DyadCensusStageEditor.tsx';
import { OneToManyDyadCensusStageEditor } from '../OneToManyDyadCensusStageEditor.tsx';
import { OrdinalBinStageEditor } from '../OrdinalBinStageEditor.tsx';
import { TieStrengthCensusStageEditor } from '../TieStrengthCensusStageEditor.tsx';

/**
 * What a Spanish researcher reads in a whole census or bin editor.
 *
 * `sections/prompts/__tests__/censusPromptsLocale.test.tsx` is the POSITIVE
 * half: it names a Spanish sentence per family and finds it, which proves the
 * wiring and says nothing about the words beside it. This is the other
 * question, asked of every surface each editor can put on screen: is there
 * anything here a translator has already answered for that the reader is
 * getting in English anyway?
 *
 * The five are swept as whole EDITORS rather than as their prompt sections,
 * because a family is more than its prompts — a census mounts the shared
 * subject, filter, introduction, skip logic and interviewer guidance sections
 * too, and a sweep of the section alone would miss every sentence those put
 * around it.
 *
 * It shares its reading with `src/__tests__/localeSweep.test.tsx`, which is
 * where the sweep is itself proved able to fail.
 */

/** Both bins and all three censuses offer the same three optional sections. */
const OPTIONAL_SECTIONS = [
  'Filtro de la etapa',
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

const closeDialog = async (harness: StageEditorHarness): Promise<void> => {
  await harness.user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
};

/**
 * Everything on screen that belongs to the researcher rather than to this
 * package: the protocol's own sections, the stage's seeded fields, and the
 * codebook the family's attribute pickers read type and attribute names out
 * of.
 *
 * Read out of the harness itself rather than listed by hand, so a fixture
 * that gains an attribute does not quietly widen the sweep's blind spot — or
 * start failing it.
 */
const researcherWords = (harness: StageEditorHarness) =>
  protocolStrings(
    harness.session.getSnapshot().protocolSections,
    harness.seeded.fields,
    harness.hostCodebook(),
  );

/**
 * Turns on everything that is off, and keeps going until nothing is.
 *
 * One pass is not enough: switching a capability on MOUNTS its fields, and
 * some of those are switches of their own — a bin's sort order offers its
 * rules only once the order itself is on. A pass that read the document once
 * would leave the second layer off and sweep a surface the researcher never
 * stops at. Bounded rather than looped to exhaustion so a pair that turn each
 * other off fails as a test rather than hanging.
 */
const switchEverythingOn = async (
  harness: StageEditorHarness,
): Promise<void> => {
  for (let pass = 0; pass < 5; pass += 1) {
    const off = screen
      .queryAllByRole('switch')
      .filter((control) => control.getAttribute('aria-checked') !== 'true');
    if (off.length === 0) return;
    for (const control of off) await switchOn(harness, control);
  }
  expect(
    screen
      .queryAllByRole('switch')
      .filter((control) => control.getAttribute('aria-checked') !== 'true'),
  ).toEqual([]);
};

/**
 * Every surface one family's editor reaches without leaving its own areas.
 *
 * The stage is read at rest, then with each optional section switched on —
 * those sections' fields only exist once they are — and then through the three
 * things a researcher does to the list of prompts. Inside the row dialog every
 * switch is turned on as well, which is how each family's OWN optional fields
 * get read: the bins' sort orders, a census's edge creation, a categorical
 * bin's group for everything else.
 *
 * What it deliberately does not open is the dialog behind "Crear un tipo de
 * nodo nuevo" and its siblings. Those are `codebook/components/`'s, and their
 * own chrome is still English on purpose — "Cancel", "Save entity" and "Could
 * not save this entity" in `CodebookEntityEditor.tsx` have no descriptor at
 * all yet, which `src/locales/ID_MAP.md` records as i18n-2's to finish under
 * `codebookEntity`. Sweeping them here would report that work as this
 * family's, and would have to be deleted rather than fixed when it lands.
 */
const sweepFamily = async (
  family: string,
  harness: StageEditorHarness,
): Promise<void> => {
  await screen.findAllByRole('button');
  expectNoLocaleLeaks(`${family} at rest`, researcherWords(harness));

  // Named rather than found, so a section that stopped saying its own name in
  // Spanish fails here instead of quietly dropping out of the sweep.
  for (const section of OPTIONAL_SECTIONS) {
    await switchOn(harness, screen.getByRole('switch', { name: section }));
  }
  await switchEverythingOn(harness);
  expectNoLocaleLeaks(
    `${family} with every section switched on`,
    researcherWords(harness),
  );

  await harness.user.click(
    screen.getByRole('button', { name: 'Crear nueva pregunta' }),
  );
  await screen.findByRole('dialog');
  expectNoLocaleLeaks(`${family}, adding a prompt`, researcherWords(harness));
  await closeDialog(harness);

  await harness.user.click(
    screen.getByRole('button', { name: 'Editar pregunta' }),
  );
  await screen.findByRole('dialog');
  expectNoLocaleLeaks(`${family}, editing a prompt`, researcherWords(harness));

  await switchEverythingOn(harness);
  expectNoLocaleLeaks(
    `${family}, editing a prompt with every field it offers switched on`,
    researcherWords(harness),
  );
  await closeDialog(harness);

  await harness.user.click(
    screen.getByRole('button', { name: 'Eliminar pregunta' }),
  );
  await screen.findByRole('dialog');
  expectNoLocaleLeaks(`${family}, removing a prompt`, researcherWords(harness));
};

describe('the census and bin editors, swept under es', () => {
  it('sweeps a categorical bin', async () => {
    await sweepFamily(
      'the categorical bin',
      renderStageEditor({
        stageId: 'categorical-bin-1',
        locale: 'es',
        editor: CategoricalBinStageEditor,
      }),
    );
  });

  it('sweeps an ordinal bin', async () => {
    await sweepFamily(
      'the ordinal bin',
      renderStageEditor({
        stageId: 'ordinal-bin-1',
        locale: 'es',
        editor: OrdinalBinStageEditor,
      }),
    );
  });

  it('sweeps a dyad census', async () => {
    await sweepFamily(
      'the dyad census',
      renderStageEditor({
        stageId: 'dyad-census-1',
        locale: 'es',
        editor: DyadCensusStageEditor,
      }),
    );
  });

  it('sweeps a one-to-many dyad census', async () => {
    await sweepFamily(
      'the one-to-many dyad census',
      renderStageEditor({
        stageId: 'one-to-many-dyad-census-1',
        locale: 'es',
        editor: OneToManyDyadCensusStageEditor,
      }),
    );
  });

  it('sweeps a tie-strength census', async () => {
    await sweepFamily(
      'the tie-strength census',
      renderStageEditor({
        stageId: 'tie-strength-census-1',
        locale: 'es',
        editor: TieStrengthCensusStageEditor,
      }),
    );
  });
});
