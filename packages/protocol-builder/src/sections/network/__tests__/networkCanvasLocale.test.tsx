import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import AutomaticLayoutSection from '../AutomaticLayoutSection.tsx';
import BackgroundSection from '../BackgroundSection.tsx';
import NarrativeBehavioursSection from '../NarrativeBehavioursSection.tsx';
import { networkCanvasMessages } from '../networkCanvasMessages.ts';

/**
 * The canvas sections read in Spanish.
 *
 * The rest of this directory's suite mounts no provider, so every section
 * renders its English `defaultMessage` and the existing English assertions
 * stand unchanged. This is the file that mounts one, and it exists to prove
 * the wiring rather than the words: that a section formats through
 * `useAppIntl()` rather than holding a string, and that a sentence one
 * interface writes for itself travels as a descriptor and is translated too.
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
      sections: (
        <>
          <AutomaticLayoutSection />
          <BackgroundSection allowsImage />
        </>
      ),
    });

    // The outline reads its titles out of the same catalog, so a section named
    // in Spanish and listed in English would fail here rather than pass
    // halfway.
    await waitFor(() => expect(harness.outline()).toHaveLength(2));
    expect(harness.outline().map((section) => section.title)).toEqual([
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

  it('says the sociogram’s own words for the same two permissions', () => {
    renderStageEditor({
      stageId: 'sociogram-1',
      locale: 'es',
      // Exactly what `SociogramStageEditor` hands it: descriptors rather than
      // strings, so the one place an interface cared enough to write its own
      // sentence is not the one place that stays English.
      sections: (
        <NarrativeBehavioursSection
          description={
            networkCanvasMessages.sociogramCanvasInteractionDescription
          }
          repositioningHint={networkCanvasMessages.sociogramRepositioningHint}
        />
      ),
    });

    expect(
      screen.getByText(
        'Elige lo que el participante puede hacer con el lienzo mientras trabaja en las preguntas.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'El participante puede arrastrar los nodos a nuevas posiciones. Cada posición se guarda en el atributo que indica la pregunta que está respondiendo, así que mover un nodo aquí lo cambia en todos los sitios donde se use ese atributo.',
      ),
    ).toBeInTheDocument();
  });
});
