import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import { loadFixtureStage } from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import AtRiskStatusesSection from '../AtRiskStatusesSection.tsx';
import DiseasesSection from '../DiseasesSection.tsx';
import SourceStageSection from '../SourceStageSection.tsx';

const narrativePedigreeSections = (
  <>
    <SourceStageSection />
    <DiseasesSection />
    <AtRiskStatusesSection />
  </>
);

/**
 * The fixture narrative pedigree, with whatever the test needs replaced.
 *
 * Built from the fixture stage rather than a hand-written one, so a test still
 * fails when the fixture and the schema disagree about what this interface
 * holds.
 */
function narrativePedigreeStageWith(extra: SectionDoc): Readonly<{
  id: string;
  type: 'NarrativePedigree';
  fields: SectionDoc;
}> {
  const seeded = loadFixtureStage('narrative-pedigree-1');
  if (seeded.type !== 'NarrativePedigree') {
    throw new Error(
      'The fixture stage "narrative-pedigree-1" changed interface.',
    );
  }
  return {
    id: seeded.id,
    type: 'NarrativePedigree',
    fields: { ...seeded.fields, ...extra },
  };
}

/**
 * The narrative pedigree sections read in Spanish.
 *
 * The rest of this directory's suite mounts no provider, so every section
 * renders its English `defaultMessage` and the existing English assertions
 * stand unchanged. These are the tests that mount one, and they exist to prove
 * the wiring rather than the words: that a section formats through
 * `useAppIntl()` rather than holding a string, that a noun handed to a shared
 * list travels as a descriptor, and that a value read out of the protocol is
 * spliced into the translated sentence rather than into the English one.
 *
 * The words are asserted as literals rather than by re-formatting the same
 * descriptor the component read: `intl.formatMessage(messages.x)` would pass
 * whatever the catalog said, including nothing at all.
 */
describe('the narrative pedigree sections, read in Spanish', () => {
  it('names each section and the controls inside it', async () => {
    const harness = renderStageEditor({
      stageId: 'narrative-pedigree-1',
      locale: 'es',
      sections: narrativePedigreeSections,
    });

    expect(
      screen.getByRole('combobox', { name: 'Etapa de origen' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', {
        name: 'Mostrar estados posibles (de riesgo)',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Cada enfermedad se asigna a un atributo booleano de los familiares de la genealogía de origen. Arrástralas para reordenarlas en la leyenda.',
      ),
    ).toBeInTheDocument();
    // The outline reads its headings out of the same catalog, so a section
    // named in Spanish and listed in English would fail here rather than pass
    // halfway.
    await waitFor(() =>
      expect(harness.outline().map((section) => section.title)).toEqual([
        'Origen de la genealogía',
        'Enfermedades',
        'Estados de riesgo',
      ]),
    );
  });

  /**
   * The stored source is spliced into the option that keeps it visible, and
   * the sentence saying what is wrong with it is a whole sentence rather than
   * a frame with a clause glued in — so a placeholder dropped from the Spanish
   * shows up here as a missing stage id rather than as prose that still reads.
   */
  it('splices the stored stage into the Spanish label for a source that has gone', () => {
    renderStageEditor({
      locale: 'es',
      stage: narrativePedigreeStageWith({
        sourceStageId: 'a-pedigree-that-was-deleted',
      }),
      sections: narrativePedigreeSections,
    });

    expect(
      screen.getByText(
        'La etapa de genealogía familiar que lee esta ya no forma parte de la entrevista. Elige otra, o restáurala, antes de poder guardar esta etapa.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'Etapa de origen' }),
    ).toHaveTextContent(
      'a-pedigree-that-was-deleted — esta etapa ya no se puede usar',
    );
  });

  it('names the disease dialog, its row affordance and its counted colours', async () => {
    const harness = renderStageEditor({
      stageId: 'narrative-pedigree-1',
      locale: 'es',
      sections: narrativePedigreeSections,
    });

    // The row noun travels into the shared list as a descriptor rather than as
    // a word, so this is where an English noun in a Spanish sentence would
    // show up.
    await harness.user.click(
      screen.getByRole('button', { name: 'Editar enfermedad' }),
    );
    // Scoped to the dialog: `screen` would compute an accessible name for
    // every control in the editor behind it to answer a question about one
    // inside it.
    const disease = within(await screen.findByRole('dialog'));
    expect(
      disease.getByRole('textbox', { name: 'Nombre de la enfermedad' }),
    ).toBeInTheDocument();
    // The palette has no names, so each swatch is counted — the one message in
    // this dialog carrying a placeholder.
    expect(
      disease.getByRole('option', { name: 'Color 2' }),
    ).toBeInTheDocument();
  });
});
