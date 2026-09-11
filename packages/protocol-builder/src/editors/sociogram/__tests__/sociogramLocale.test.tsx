import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { attributeField } from '../../../testing/attributePicker.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import {
  openPrompt,
  sociogramSections,
} from '../sections/prompts/__tests__/canvasFixtures.tsx';

/**
 * The canvas sections read in Spanish.
 *
 * The rest of this editor's suite mounts no provider, so every section renders
 * its English `defaultMessage` and the existing English assertions stand
 * unchanged. This is the file that mounts one, and it exists to prove the
 * wiring rather than the words: that a section formats through `useAppIntl()`
 * rather than holding a string, that a sentence this interface writes for
 * itself travels to the shared prompt list as a descriptor and is translated
 * too, that copy built outside the markup — the mode and tap cards — is read
 * in the reader's language, and that a value the protocol supplied is spliced
 * into the translated sentence rather than into the English one.
 *
 * The words are asserted as literals rather than by re-formatting the same
 * descriptor the component read: `esIntl.formatMessage(messages.x)` would pass
 * whatever the catalog said, including nothing at all.
 */
describe('the canvas sections, read in Spanish', () => {
  it('names the layout and background sections and their controls', async () => {
    const harness = renderStageEditor({
      stageId: 'sociogram-1',
      locale: 'es',
      sections: sociogramSections,
    });

    // The outline reads its titles out of the same catalog, so a section named
    // in Spanish and listed in English would fail here rather than pass
    // halfway.
    await waitFor(() => expect(harness.outline()).toHaveLength(3));
    expect(harness.outline().map((section) => section.title)).toEqual([
      'Preguntas',
      'Disposición de nodos',
      'Fondo',
    ]);
    expect(
      screen.getByRole('spinbutton', {
        name: 'Número de círculos concéntricos',
      }),
    ).toBeInTheDocument();
    // A card built inside the field rather than beside the markup, so this is
    // where an option list left in English would show up.
    expect(screen.getByText('Modo manual')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Elige lo que el participante ve detrás de los nodos en este lienzo: círculos concéntricos o una imagen tuya.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * The four sentences this interface hands the shared prompt list, which is
   * where a descriptor passed across that seam as a resolved string would show
   * up: the shared section would render its own generic wording in Spanish
   * beside the sociogram's English.
   */
  it('reads the sociogram’s own words for the shared prompt list in Spanish', () => {
    renderStageEditor({
      stageId: 'sociogram-1',
      locale: 'es',
      sections: sociogramSections,
    });

    expect(
      screen.getByText(
        'Escribe las tareas que el participante realiza en el lienzo y arrástralas al orden en que las hace.',
      ),
    ).toBeInTheDocument();
  });

  it('names what one task decides, inside its own dialog', async () => {
    const harness = renderStageEditor({
      stageId: 'sociogram-1',
      locale: 'es',
      sections: sociogramSections,
    });

    const prompt = await openPrompt(harness, 0, 'Editar pregunta');
    // The picker is a labelled field holding a trigger, so the label and the
    // words on the button are two separate translations and both are asserted.
    // This prompt already positions by an attribute, which is the state the
    // trigger says "change" rather than "select" in.
    expect(
      within(
        attributeField('Atributo de posición', screen.getByRole('dialog')),
      ).getByRole('button', { name: 'Cambiar atributo' }),
    ).toBeInTheDocument();
    expect(
      prompt.getByRole('button', {
        name: 'Crear un nuevo atributo de posición',
      }),
    ).toBeInTheDocument();
    expect(prompt.getByText('Marcar el nodo')).toBeInTheDocument();
  });

  /**
   * A connection type the codebook has lost is named by the id it left behind,
   * spliced into the Spanish sentence rather than into the English one.
   */
  it('splices a lost connection type’s id into the Spanish tick list', async () => {
    const LOST_EDGE = 'former_edge';
    const harness = renderStageEditor({
      stage: {
        type: 'Sociogram' as const,
        fields: {
          label: 'Sociogram',
          subject: { entity: 'node', type: 'person' },
          background: { concentricCircles: 4 },
          prompts: [
            {
              id: 'sociogram-prompt-1',
              text: 'Coloca a las personas que se conocen cerca',
              layout: { layoutVariable: 'layout' },
              edges: { display: [LOST_EDGE] },
            },
          ],
        },
      },
      locale: 'es',
      sections: sociogramSections,
    });

    const prompt = await openPrompt(harness, 0, 'Editar pregunta');
    // Asserted on the whole rendered name, so a placeholder left out of the
    // Spanish fails here rather than rendering as `{edgeTypeId}`.
    expect(
      prompt.getByRole('checkbox', {
        name: `${LOST_EDGE} — este tipo de vínculo ya no está en el libro de códigos`,
      }),
    ).toBeChecked();
  });
});
