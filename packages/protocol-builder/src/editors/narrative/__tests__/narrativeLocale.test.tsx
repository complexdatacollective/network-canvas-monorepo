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
 * rather than holding a string, and that a value the protocol supplied is
 * spliced into the translated sentence rather than into the English one.
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
      'Comportamientos de la narrativa',
    ]);
    expect(
      screen.getByRole('switch', { name: 'Dibujo libre' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Crea visualizaciones entre las que los investigadores puedan alternar durante la entrevista.',
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
      preset.getByRole('combobox', { name: 'Atributo de disposición' }),
    ).toBeInTheDocument();
    expect(
      preset.getByRole('button', {
        name: 'Crear un nuevo atributo de posición',
      }),
    ).toBeInTheDocument();
    expect(preset.getByText('Resaltado de nodos')).toBeInTheDocument();
  });

  /**
   * The switch this interface offers instead of the shared layout-mode cards,
   * which is where a descriptor held as a string rather than formatted through
   * `useAppIntl()` would show up: an English label beside Spanish siblings.
   */
  it('reads the narrative’s automatic-layout switch in Spanish', async () => {
    renderStageEditor({
      stageId: 'narrative-1',
      locale: 'es',
      editor: narrativeEditor,
    });

    expect(
      await screen.findByRole('switch', { name: 'Disposición automática' }),
      // Anchored, so a sentence with anything else in it fails. The trailing
      // gap is the field's own empty error slot, which every hinted control in
      // the package carries.
    ).toHaveAccessibleDescription(
      /^Colocar los nodos automáticamente mediante una disposición dirigida por fuerzas\s*$/,
    );
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
