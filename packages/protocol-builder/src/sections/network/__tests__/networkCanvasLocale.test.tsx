import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import { loadFixtureStage } from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import AutomaticLayoutSection from '../AutomaticLayoutSection.tsx';
import BackgroundSection from '../BackgroundSection.tsx';
import ComposerEdgeConfigurationSection from '../ComposerEdgeConfigurationSection.tsx';
import ComposerNodeConfigurationSection from '../ComposerNodeConfigurationSection.tsx';
import NarrativeBehavioursSection from '../NarrativeBehavioursSection.tsx';
import { networkCanvasMessages } from '../networkCanvasMessages.ts';

/**
 * The canvas sections read in Spanish.
 *
 * The rest of this directory's suite mounts no provider, so every section
 * renders its English `defaultMessage` and the existing English assertions
 * stand unchanged. This is the file that mounts one, and it exists to prove
 * the wiring rather than the words: that a section formats through
 * `useAppIntl()` rather than holding a string, that a sentence one interface
 * writes for itself travels as a descriptor and is translated too, that copy
 * built outside React — the input-control names — is read in the reader's
 * language, and that a value the protocol supplied is spliced into the
 * translated sentence rather than into the English one.
 *
 * The words are asserted as literals rather than by re-formatting the same
 * descriptor the component read: `esIntl.formatMessage(messages.x)` would pass
 * whatever the catalog said, including nothing at all.
 */

/** The composer fixture draws no connections; this one draws `knows`. */
const openComposerWithEdge = () => {
  const { type, fields } = loadFixtureStage('network-composer-1');
  return {
    stage: {
      id: 'network-composer-locale-edges',
      type,
      fields: {
        ...fields,
        edges: [
          { id: 'composer-edge-1', subject: { entity: 'edge', type: 'knows' } },
        ],
      },
    },
    locale: 'es',
    sections: <ComposerEdgeConfigurationSection />,
  };
};

/** The composer fixture asks nothing about a node; this one asks one thing. */
const CONFIGURED_NODE_FORM: SectionDoc = {
  nodeForm: {
    fields: [
      { id: 'composer-node-field-1', variable: 'name', component: 'Text' },
    ],
  },
};

const openComposerWithNodeForm = () => {
  const { type, fields } = loadFixtureStage('network-composer-1');
  return {
    stage: {
      id: 'network-composer-locale-form',
      type,
      fields: { ...fields, ...CONFIGURED_NODE_FORM },
    },
    locale: 'es',
    sections: <ComposerNodeConfigurationSection />,
  };
};

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

  it('splices a connection type’s name into the Spanish heading', async () => {
    renderStageEditor(openComposerWithEdge());

    // Asserted on the whole rendered heading, so a placeholder left out of the
    // Spanish fails here rather than rendering as `{typeName}`.
    expect(
      await screen.findByRole('heading', {
        name: 'Atributos de los vínculos «knows»',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Crear nuevo campo de atributo para los vínculos «knows»',
      }),
    ).toBeInTheDocument();
  });

  it('reads a form field’s attribute and its input control in Spanish', async () => {
    renderStageEditor(openComposerWithNodeForm());

    // The attribute's own name is the researcher's, and is spliced into the
    // translated sentence rather than into the English one.
    expect(
      await screen.findByText('Registra el atributo «name»'),
    ).toBeInTheDocument();
    // Built by `inputControlOptions`, which produces copy without rendering
    // it — so a module-level English formatter there would show up here.
    expect(
      screen.getByText('Cuadro de texto de una línea'),
    ).toBeInTheDocument();
  });
});
