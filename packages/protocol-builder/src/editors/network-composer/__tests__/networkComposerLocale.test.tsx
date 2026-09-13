import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { attributeField } from '../../../testing/attributePicker.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import {
  composerEditor,
  composerHolding,
  openRow,
} from './composerFixtures.tsx';

const KNOWS_ENTRY = {
  id: 'composer-edge-1',
  subject: { entity: 'edge', type: 'knows' },
};

/**
 * The network composer's sections read in Spanish.
 *
 * The rest of this editor's suite mounts no provider, so every section renders
 * its English `defaultMessage` and the existing English assertions stand
 * unchanged. This is the file that mounts one, and it exists to prove the
 * wiring rather than the words: that a section formats through `useAppIntl()`
 * rather than holding a string, that a sentence this interface writes for
 * itself travels to the shared form-field list as a descriptor and is
 * translated too, and that a value the protocol supplied is spliced into the
 * translated sentence rather than into the English one.
 *
 * The words are asserted as literals rather than by re-formatting the same
 * descriptor the component read: `esIntl.formatMessage(messages.x)` would pass
 * whatever the catalog said, including nothing at all.
 */
describe('the network composer sections, read in Spanish', () => {
  it('names both sections and the controls that decide them', async () => {
    const harness = renderStageEditor({
      ...composerHolding({}),
      locale: 'es',
    });

    // The outline reads its titles out of the same catalog, so a section named
    // in Spanish and listed in English would fail here rather than pass
    // halfway.
    await waitFor(() => expect(harness.outline()).toHaveLength(3));
    expect(harness.outline().map((section) => section.title)).toEqual([
      'Configuración de nodos',
      'Atributos editables',
      'Configuración de vínculos',
    ]);
    // Each attribute is chosen in a window its field's trigger opens, so the
    // control is named by the field's own label — which is what
    // `attributeField` finds, and what fails here if a section held an English
    // string instead.
    const quickAdd = attributeField(
      'Crear o seleccionar un atributo para el formulario de adición rápida',
    );
    // The stage arrives holding one, so its trigger says the word for changing
    // that choice rather than the word for making one: the picker's own words
    // come from the same catalog as the label above it. Waited for, because
    // the field is drawn before the stage's own value reaches it.
    await waitFor(() =>
      expect(
        within(quickAdd).getByRole('button', { name: 'Cambiar atributo' }),
      ).toBeInTheDocument(),
    );
    expect(
      attributeField('Crear o seleccionar un atributo categórico para agrupar'),
    ).toBeInTheDocument();
  });

  /**
   * The two sentences this interface writes for the SHARED layout control,
   * which the editor hands over as descriptors. Resolved to English where the
   * editor declares them, they would sit in English under a control named in
   * Spanish — which is exactly the seam a replacement sentence crosses.
   */
  it('reads the composer’s own layout sentences in Spanish', async () => {
    renderStageEditor({
      stageId: 'network-composer-1',
      locale: 'es',
      editor: composerEditor,
    });

    expect(
      await screen.findByText(
        'Coloca cada nodo donde hay sitio para él a medida que el participante lo añade, y deja que lo arrastre a donde quiera.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Inicia la etapa con la simulación en marcha. El participante puede apagarla y encenderla mientras trabaja, y la etapa se reabre tal como la dejó.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * The composer's own words for the shared form-field list, which is where a
   * descriptor passed across that seam as a resolved string would show up: the
   * shared list would render its generic wording in Spanish beside the
   * composer's English.
   */
  it('names one connection type’s form in the reader’s language', async () => {
    renderStageEditor({
      ...composerHolding({ edges: [KNOWS_ENTRY] }),
      locale: 'es',
    });

    // The type's name comes from the protocol, so this is also where a
    // placeholder left out of the Spanish would render as `{typeName}`.
    expect(
      await screen.findByText('Atributos de vínculo: knows'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Crear nuevo atributo para knows',
      }),
    ).toBeInTheDocument();
  });

  it('names what one form field decides, inside its own dialog', async () => {
    const harness = renderStageEditor({
      ...composerHolding({
        nodeForm: {
          fields: [{ id: 'field-1', variable: 'age', component: 'Number' }],
        },
      }),
      locale: 'es',
    });

    const field = await openRow(harness, 'Editar campo del formulario');
    expect(
      field.getByRole('combobox', { name: 'Control de entrada' }),
    ).toBeInTheDocument();
    expect(
      field.getByRole('textbox', { name: 'Texto de ayuda' }),
    ).toBeInTheDocument();
  });

  /**
   * A connection type the codebook has lost is named by the id it left behind,
   * spliced into the Spanish sentence rather than into the English one.
   */
  it('splices a lost connection type’s id into the Spanish list', async () => {
    renderStageEditor({
      ...composerHolding({
        edges: [
          { id: 'gone-1', subject: { entity: 'edge', type: 'former_edge' } },
        ],
      }),
      locale: 'es',
    });

    expect(
      await screen.findByText(
        'former_edge — este tipo de vínculo ya no está en el libro de códigos',
      ),
    ).toBeInTheDocument();
  });
});
