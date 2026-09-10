import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import {
  narrativeEditor,
  narrativeHolding,
  narrativeSections,
  openPreset,
} from './narrativeFixtures.tsx';

/**
 * The narrative sections read in Spanish.
 *
 * The rest of this editor's suite mounts no provider, so every section renders
 * its English `defaultMessage` and the existing English assertions stand
 * unchanged. This is the file that mounts one, and it exists to prove the
 * wiring rather than the words: that a section formats through `useAppIntl()`
 * rather than holding a string, that the sentence this interface writes for
 * the shared layout-mode card travels to it as a descriptor and is translated
 * too, and that a value the protocol supplied is spliced into the translated
 * sentence rather than into the English one.
 *
 * The words are asserted as literals rather than by re-formatting the same
 * descriptor the component read: `esIntl.formatMessage(messages.x)` would pass
 * whatever the catalog said, including nothing at all.
 */
describe('the narrative sections, read in Spanish', () => {
  it('names the presets and the canvas permissions', async () => {
    const harness = renderStageEditor({
      stageId: 'narrative-1',
      locale: 'es',
      sections: narrativeSections,
    });

    // The outline reads its titles out of the same catalog, so a section named
    // in Spanish and listed in English would fail here rather than pass
    // halfway.
    await waitFor(() => expect(harness.outline()).toHaveLength(2));
    expect(harness.outline().map((section) => section.title)).toEqual([
      'Vistas predefinidas de visualización',
      'Interacción con el lienzo',
    ]);
    expect(
      screen.getByRole('switch', { name: 'Permitir dibujar en el lienzo' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Construye las formas de ver la red entre las que se puede alternar durante la entrevista.',
      ),
    ).toBeInTheDocument();
  });

  it('names what one preset decides, inside its own dialog', async () => {
    const harness = renderStageEditor({
      stageId: 'narrative-1',
      locale: 'es',
      sections: narrativeSections,
    });

    const preset = await openPreset(harness, 0, 'Editar vista predefinida');
    expect(
      preset.getByRole('combobox', { name: 'Atributo de posición' }),
    ).toBeInTheDocument();
    expect(
      preset.getByRole('button', {
        name: 'Crear un nuevo atributo de posición',
      }),
    ).toBeInTheDocument();
    expect(preset.getByText('Nodos resaltados')).toBeInTheDocument();
  });

  /**
   * The sentence this interface hands the shared layout-mode card, which is
   * where a descriptor passed across that seam as a resolved string would show
   * up: the shared section would render the generic wording in Spanish beside
   * the narrative's English.
   */
  it('reads the narrative’s own manual-mode sentence in Spanish', async () => {
    renderStageEditor({
      stageId: 'narrative-1',
      locale: 'es',
      editor: narrativeEditor,
    });

    expect(
      await screen.findByText(
        'Muestra cada nodo en la posición ya guardada en el atributo con el que la vista predefinida los coloca. Un nodo para el que ese atributo no tenga posición se queda fuera del lienzo.',
      ),
    ).toBeInTheDocument();
  });

  /** The same seam, for the automatic-mode card's own sentence. */
  it('reads the narrative’s own automatic-mode sentence in Spanish', async () => {
    renderStageEditor({
      stageId: 'narrative-1',
      locale: 'es',
      editor: narrativeEditor,
    });

    expect(
      await screen.findByText(
        'Organiza los nodos mediante una simulación de fuerzas físicas, como atracción y repulsión. Solo se organizan los nodos para los que el atributo con el que la vista predefinida los coloca tenga posición; el resto se queda fuera del lienzo, igual que en el modo manual. El participante puede pausar y reanudar la simulación, y solo puede mover los nodos manualmente si «Permitir mover nodos» está activado.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * An attribute the codebook has lost is named by the id it left behind,
   * spliced into the Spanish sentence rather than into the English one.
   */
  it('splices a lost highlight attribute’s id into the Spanish tick list', async () => {
    const LOST_HIGHLIGHT = 'former_flag';
    const harness = renderStageEditor({
      ...narrativeHolding({
        id: 'narrative-preset-1',
        label: 'Vista por defecto',
        layoutVariable: 'layout',
        highlight: [LOST_HIGHLIGHT],
      }),
      locale: 'es',
    });

    const preset = await openPreset(harness, 0, 'Editar vista predefinida');
    // Asserted on the whole rendered name, so a placeholder left out of the
    // Spanish fails here rather than rendering as `{attributeId}`.
    expect(
      preset.getByRole('checkbox', {
        name: `${LOST_HIGHLIGHT} — este atributo no está disponible aquí`,
      }),
    ).toBeChecked();
  });
});
