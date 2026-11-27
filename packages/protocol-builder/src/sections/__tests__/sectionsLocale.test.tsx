import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  expectNoLocaleLeaks,
  protocolStrings,
} from '../../testing/localeSweep.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../testing/renderStageEditor.tsx';
import InterviewerGuidanceSection from '../interviewer-guidance/InterviewerGuidanceSection.tsx';
import NetworkFilterSection from '../network-filter/NetworkFilterSection.tsx';
import SkipLogicSection from '../skip-logic/SkipLogicSection.tsx';

/**
 * The three sections every stage editor composes, read in Spanish.
 *
 * The rest of this directory's suite mounts no provider, so each section
 * renders its English `defaultMessage` and the existing English assertions
 * stand unchanged. These are the tests that mount one, and they are what proves
 * the wiring: a section still holding an English literal, or one whose ids
 * never reached `src/locales/es.json`, shows up here as an English string
 * where a Spanish one was asked for. The harness merges the three catalogs a
 * host merges, in the order a host merges them, so a section that takes its
 * confirmation's cancel verb from `common.*` is read here over the layer a host
 * would actually serve it from.
 *
 * The words are asserted as literals rather than by re-formatting the same
 * descriptor the section read. `intl.formatMessage(messages.title)` would pass
 * whatever the catalog said, including nothing at all.
 */

/**
 * Everything on screen that belongs to the researcher rather than to this
 * package: the whole protocol the harness is mounted over, the stage's own
 * seeded fields, and the codebook the sections read type and attribute names
 * out of.
 *
 * Read out of the documents the harness mounts rather than listed by hand, so a
 * fixture that gains a stage or an attribute cannot quietly widen the sweep's
 * blind spot — or start failing it.
 */
const researcherWords = (harness: StageEditorHarness) =>
  protocolStrings(
    harness.protocolSections(),
    harness.seeded.fields,
    harness.hostCodebook(),
  );

/**
 * The fixture's alter form with the three shared sections on it.
 *
 * That stage holds no filter, no skip logic and no guidance, so each of the
 * three opens from the closed state a researcher meets it in — which is what
 * the tests below drive.
 */
const renderInSpanish = () =>
  renderStageEditor({
    stageId: 'alter-form-1',
    locale: 'es',
    sections: (
      <>
        <NetworkFilterSection />
        <SkipLogicSection />
        <InterviewerGuidanceSection />
      </>
    ),
  });

describe('the shared stage-editor sections in Spanish', () => {
  it('names each section in Spanish', () => {
    renderInSpanish();

    expect(
      screen.getByRole('switch', { name: 'Filtrar la red' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Lógica de salto' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', {
        name: 'Guía para la persona entrevistadora',
      }),
    ).toBeInTheDocument();
  });

  it('describes each section in Spanish', () => {
    const harness = renderInSpanish();

    expect(
      screen.getByText(
        'Crea reglas que filtren los nodos o vínculos que se muestran en esta etapa.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Determina si se muestra esta etapa y dónde continúa la entrevista cuando se omite.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Crea notas o una guía para la persona entrevistadora.'),
    ).toBeInTheDocument();
    // The assertions above name what these sections are supposed to say; the
    // sweep reports whatever else they said — including a sentence rebuilt out
    // of an English pattern, which matches no whole message.
    expectNoLocaleLeaks('the closed sections', researcherWords(harness));
  });

  it('labels the controls inside a section in Spanish', async () => {
    const harness = renderInSpanish();

    await harness.user.click(
      screen.getByRole('switch', { name: 'Lógica de salto' }),
    );

    // The section's own words, and the destination field's, which the section
    // hands to a field this directory does not own — so an English label here
    // would mean the section's copy stopped where the field begins.
    expect(await screen.findByText('Acción')).toBeInTheDocument();
    expect(screen.getByText('Mostrar esta etapa')).toBeInTheDocument();
    expect(screen.getByText('Cuando se omita esta etapa')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Elige dónde debe continuar la entrevista. Solo se pueden seleccionar etapas posteriores.',
      ),
    ).toBeInTheDocument();
    expectNoLocaleLeaks(
      'the open skip-logic section',
      researcherWords(harness),
    );
  });

  it('asks in Spanish before throwing a capability’s content away', async () => {
    const harness = renderInSpanish();

    const guidance = screen.getByRole('switch', {
      name: 'Guía para la persona entrevistadora',
    });
    await harness.user.click(guidance);
    const field = await screen.findByRole('textbox', {
      name: 'Texto del guion de la entrevista',
    });
    await harness.user.click(field);
    await harness.user.keyboard('Pregunta con calma.');
    await harness.user.click(guidance);

    // The confirmation is the capability's own words, formatted by
    // BuilderSection out of the descriptors the section handed it — a string
    // prop here would have left this dialog English.
    expect(
      await screen.findByText('Se borrará el guion de la entrevista'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Borrar guion' }),
    ).toBeInTheDocument();
    // And the cancel verb comes from the shared common.* catalog rather than
    // from this package, so this fails if the common layer stopped reaching
    // the merge.
    expect(
      screen.getByRole('button', { name: 'Cancelar' }),
    ).toBeInTheDocument();
    expectNoLocaleLeaks('the discard confirmation', researcherWords(harness));
  });
});
