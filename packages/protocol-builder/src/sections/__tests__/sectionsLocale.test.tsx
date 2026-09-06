import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import FormFieldsSection from '../FormFieldsSection.tsx';
import IntroductionSection from '../IntroductionSection.tsx';
import PageContentSection from '../PageContentSection.tsx';
import PromptsSection from '../PromptsSection.tsx';
import StageNameSection from '../StageNameSection.tsx';
import SubjectSection from '../SubjectSection.tsx';
import {
  TestItemEditor,
  TestItemPreview,
  TestPromptEditor,
  TestPromptPreview,
} from './rowFixtures.tsx';

/**
 * The shared sections read in Spanish.
 *
 * The rest of this directory's suite mounts no provider, so every section
 * renders its English `defaultMessage` and the existing English assertions
 * stand unchanged. These are the tests that mount one, and they exist to prove
 * the wiring rather than the words: that a section formats through
 * `useAppIntl()` rather than holding a string, that the catalog a host merges
 * is the catalog it reads, and that a value the researcher supplied is spliced
 * into the translated sentence rather than into the English one.
 *
 * The words are asserted as literals rather than by re-formatting the same
 * descriptor the component read: `esIntl.formatMessage(messages.x)` would pass
 * whatever the catalog said, including nothing at all.
 */
describe('the shared sections, read in Spanish', () => {
  it('names the page-content section and its controls', async () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      locale: 'es',
      sections: (
        <>
          <StageNameSection />
          <PageContentSection
            ItemEditor={TestItemEditor}
            ItemPreview={TestItemPreview}
          />
        </>
      ),
    });

    expect(
      screen.getByRole('textbox', { name: 'Encabezado de página' }),
    ).toHaveValue('Welcome');
    expect(
      screen.getByRole('button', { name: 'Crear nuevo bloque de contenido' }),
    ).toBeInTheDocument();
    // The outline reads its state out of the same catalog, so a section named
    // in Spanish and reported in English would fail here rather than pass
    // halfway.
    await waitFor(() => expect(harness.outline()).toHaveLength(2));
    expect(harness.outline()[1]).toEqual({
      title: 'Contenido de la página',
      state: 'Terminado',
    });
  });

  it('names the introduction section and its two fields', () => {
    renderStageEditor({
      stageId: 'sociogram-1',
      locale: 'es',
      sections: <IntroductionSection />,
    });

    expect(
      screen.getByRole('textbox', { name: 'Encabezado de la introducción' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Presenta esta tarea al participante antes de que la empiece.',
      ),
    ).toBeInTheDocument();
  });

  it('names the subject section per entity', () => {
    renderStageEditor({
      stageId: 'name-generator-1',
      locale: 'es',
      sections: <SubjectSection entity="node" />,
    });

    expect(screen.getByRole('radio', { name: 'person' })).toBeChecked();
    expect(
      screen.getByText(
        'Todos los nodos que esta etapa cree o muestre serán del tipo que elijas aquí.',
      ),
    ).toBeInTheDocument();
  });

  it('names a prompt list and the affordances on its rows', async () => {
    renderStageEditor({
      stageId: 'name-generator-1',
      locale: 'es',
      sections: (
        <PromptsSection
          PromptEditor={TestPromptEditor}
          PromptPreview={TestPromptPreview}
          requiresSubject={false}
        />
      ),
    });

    expect(
      screen.getByRole('button', { name: 'Crear nueva pregunta' }),
    ).toBeInTheDocument();
    // The row noun travels into the shared list as a descriptor rather than as
    // a word, so this is where an English noun in a Spanish sentence would
    // show up.
    expect(
      await screen.findByRole('button', { name: 'Editar pregunta' }),
    ).toBeInTheDocument();
  });

  it('splices a researcher’s own attribute into the Spanish sentence', async () => {
    renderStageEditor({
      stageId: 'alter-form-1',
      locale: 'es',
      sections: <FormFieldsSection subject="node" hasTitle />,
    });

    expect(
      screen.getByRole('textbox', { name: 'Título del formulario' }),
    ).toBeInTheDocument();
    // `previewCollects` carries two values the protocol supplied. Asserted on
    // the whole rendered sentence, so a placeholder left out of the Spanish
    // fails here rather than rendering as `{name}`.
    expect(
      await screen.findByText('Recoge «relationship_to_ego» como text.'),
    ).toBeInTheDocument();
  });
});
