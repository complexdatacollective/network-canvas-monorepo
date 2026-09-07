import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';
import GeospatialPromptsSection from '../GeospatialPromptsSection.tsx';
import MapAppearanceSection from '../MapAppearanceSection.tsx';
import MapSourceSection from '../MapSourceSection.tsx';

/**
 * The geospatial sections read in Spanish.
 *
 * The rest of this directory's suite mounts no provider, so every section
 * renders its English `defaultMessage` and the existing English assertions
 * stand unchanged. This is the test that mounts one, and it exists to prove
 * the wiring rather than the words: that a section formats through
 * `useAppIntl()` rather than holding a string, that the two modules which
 * PRODUCE copy without rendering it — the basemap list and the centre
 * validator — reach the reader's own formatter, and that numbers the package
 * supplies are spliced into the translated sentence rather than into the
 * English one.
 *
 * The words are asserted as literals rather than by re-formatting the same
 * descriptor the component read: `esIntl.formatMessage(messages.x)` would pass
 * whatever the catalog said, including nothing at all.
 */
const openEditor = (): StageEditorHarness =>
  renderStageEditor({
    stageId: 'geospatial-1',
    locale: 'es',
    sections: (
      <>
        <MapSourceSection />
        <GeospatialPromptsSection />
        <MapAppearanceSection />
      </>
    ),
  });

describe('the geospatial sections, read in Spanish', () => {
  it('names each map decision and the controls inside it', async () => {
    const harness = openEditor();

    await waitFor(() => expect(harness.outline()).toHaveLength(5));
    expect(harness.outline().map((entry) => entry.title)).toEqual([
      'Acceso al mapa',
      'Capa del mapa',
      'Preguntas',
      'Apariencia del mapa',
      'Vista inicial del mapa',
    ]);
    expect(
      screen.getByRole('combobox', { name: 'Mapa base' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('spinbutton', { name: 'Zoom inicial' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Permitir buscar en el mapa' }),
    ).toBeInTheDocument();
  });

  /**
   * `mapboxStyles.ts` builds its options rather than declaring them, so this
   * is where a basemap list built through a module-level English formatter
   * would show up: the control would be labelled in Spanish and every choice
   * inside it named in English.
   */
  it('names the basemaps the option builder produces', () => {
    openEditor();

    const basemaps = within(screen.getByRole('combobox', { name: 'Mapa base' }))
      .getAllByRole('option')
      .map((option) => option.textContent ?? '');

    expect(basemaps).toContain('Navegación nocturna');
    expect(basemaps).toContain('Satélite con calles');
  });

  /**
   * Both messages carry numbers this package supplies — the ends of Mapbox's
   * zoom scale — so a placeholder dropped from the Spanish fails here rather
   * than rendering as `{min}`.
   */
  it('splices the package’s own numbers into the Spanish', () => {
    openEditor();

    expect(
      screen.getByText('0 muestra todo el mundo; 22 es el nivel de calle.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: 'Color de resaltado 1' }),
    ).toBeInTheDocument();
  });

  /**
   * The refusal travels as an encoded descriptor through a string-only
   * validation contract and is decoded where it is read, so this covers the
   * whole of that path in a second language — and its two numbers with it.
   */
  it('refuses a centre outside the world in Spanish', async () => {
    const harness = openEditor();

    fireEvent.change(screen.getByLabelText('Longitud'), {
      target: { value: '999' },
    });

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText('La longitud debe estar entre -180 y 180.'),
    ).toBeInTheDocument();
  });

  it('names the geospatial prompt’s own controls', async () => {
    const harness = openEditor();

    await harness.user.click(
      screen.getByRole('button', { name: 'Crear nueva pregunta' }),
    );
    // Scoped to the dialog: `screen` would compute an accessible name for
    // every control in the editor behind it to answer a question about one
    // inside it.
    const dialog = within(await screen.findByRole('dialog'));

    expect(
      dialog.getByRole('combobox', { name: 'Atributo de ubicación' }),
    ).toBeInTheDocument();
    expect(
      dialog.getByRole('button', {
        name: 'Crear un nuevo atributo de ubicación',
      }),
    ).toBeInTheDocument();
  });
});
