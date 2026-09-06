import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { shimMarkdownEditorMeasurement } from '../../../editors/pedigree/__tests__/editorFixtures.tsx';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import BoundaryOptionsSection from '../BoundaryOptionsSection.tsx';
import FramingConfigSection from '../FramingConfigSection.tsx';
import NominationPromptsSection from '../NominationPromptsSection.tsx';
import PedigreeNodeConfigurationSection from '../PedigreeNodeConfigurationSection.tsx';
import {
  addFamilyMemberVariable,
  familyPedigreeStageWith,
} from './pedigreeFixtures.tsx';

shimMarkdownEditorMeasurement();

/**
 * The pedigree sections read in Spanish.
 *
 * The rest of this directory's suite mounts no provider, so every section
 * renders its English `defaultMessage` and the English assertions beside these
 * stand unchanged. These are the tests that mount one, and they exist to prove
 * the wiring rather than the words: that a section formats through
 * `useAppIntl()` rather than holding a string, that the catalog a host merges
 * is the catalog it reads, that a value the researcher supplied is spliced into
 * the translated sentence rather than into the English one, and that a refusal
 * which left React as an encoded descriptor comes back in the reader's own
 * language.
 *
 * The words are asserted as literals rather than by re-formatting the same
 * descriptor the component read: `esIntl.formatMessage(messages.x)` would pass
 * whatever the catalog said, including nothing at all.
 */
describe('the pedigree’s own configuration, read in Spanish', () => {
  it('names the framing section, its controls and the framings it explains', async () => {
    const harness = renderStageEditor({
      stageId: 'family-pedigree-1',
      locale: 'es',
      sections: <FramingConfigSection />,
    });

    await waitFor(() =>
      expect(harness.outline().map((section) => section.title)).toEqual([
        'Enfoque de la genealogía',
      ]),
    );
    expect(
      screen.getByRole('radio', { name: 'Permitir que el participante elija' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'Terminología del enfoque fijo' }),
    ).toHaveValue('gamete');
    // The framing's own name is a rich-text tag INSIDE the translated
    // sentence, so this is where a Spanish translation that dropped the tag —
    // or moved the emphasis onto the wrong words — shows up. Scoped to the
    // `strong` the tag renders as, because the same words label the option
    // above.
    expect(
      screen.getByText('Basado en gametos', { selector: 'strong' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/describe a cada progenitor por su contribución/),
    ).toBeInTheDocument();
  });

  it('names the boundary section, its controls and its enforcement levels', async () => {
    const harness = renderStageEditor({
      stageId: 'family-pedigree-1',
      locale: 'es',
      sections: <BoundaryOptionsSection />,
    });

    await waitFor(() =>
      expect(harness.outline().map((section) => section.title)).toEqual([
        'Límites de la genealogía',
      ]),
    );
    expect(
      screen.getByRole('combobox', {
        name: 'Requisito de la familia del otro progenitor',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Desactivado', { selector: 'strong' }),
    ).toBeInTheDocument();
    // Every level and the empty option, in the order the schema offers them.
    // The levels are read off the same descriptors the explanations above name
    // them by, so a level translated in one place and not the other fails
    // here — and so does a placeholder left in English.
    expect(
      [
        ...screen
          .getByRole('combobox', { name: 'Requisito de abuelos' })
          .querySelectorAll('option'),
      ].map((option) => option.textContent),
    ).toEqual([
      'Selecciona una opción',
      'Obligatorio',
      'Recomendado',
      'Desactivado',
    ]);
  });

  it('names each attribute slot and the control that creates one', () => {
    renderStageEditor({
      stageId: 'family-pedigree-1',
      locale: 'es',
      sections: <PedigreeNodeConfigurationSection />,
    });

    expect(
      screen.getByRole('combobox', { name: 'Etiqueta visible' }),
    ).toHaveValue('fm_name');
    expect(
      screen.getByRole('combobox', { name: 'Identificador del participante' }),
    ).toHaveValue('is_ego');
    expect(
      screen.getByRole('button', {
        name: 'Crear un nuevo atributo de sexo biológico',
      }),
    ).toBeInTheDocument();
  });

  it('splices an attribute the researcher chose into the Spanish preview', async () => {
    renderStageEditor({
      stage: familyPedigreeStageWith({
        nominationPrompts: [
          {
            id: 'nomination-1',
            text: 'Who has been unwell?',
            variable: 'hasConditionX',
          },
        ],
      }),
      locale: 'es',
      sections: <NominationPromptsSection />,
    });

    expect(
      await screen.findByRole('button', {
        name: 'Crear nueva pregunta de nominación',
      }),
    ).toBeInTheDocument();
    // The attribute's codebook name is the researcher's own word and is not
    // translated; the sentence around it is. Asserted whole, so a placeholder
    // left out of the Spanish fails here rather than rendering as
    // `{attributeName}`.
    expect(
      await screen.findByText('Registra el atributo booleano «hasConditionX»'),
    ).toBeInTheDocument();
  });

  /**
   * The one sentence in this area that leaves React before it is read.
   *
   * `slotCrossClassIssue` has no formatter, so it encodes its refusal and
   * hands it to the field as a plain string; `FieldErrors` decodes it where it
   * renders. A refusal frozen into English at the moment the pick was judged
   * would pass every other test in this file and fail here.
   */
  it('reads a refused slot pick back in Spanish, with the attribute in it', async () => {
    const harness = renderStageEditor({
      stageId: 'family-pedigree-1',
      locale: 'es',
      sections: <PedigreeNodeConfigurationSection />,
    });
    addFamilyMemberVariable(harness, 'preferred_name', {
      name: 'preferred_name',
      type: 'text',
    });

    await harness.user.selectOptions(
      await screen.findByRole('combobox', { name: 'Etiqueta visible' }),
      'preferred_name',
    );
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Relación con el participante' }),
      'preferred_name',
    );

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(
        '«preferred_name» lo escribe sin validación otra ranura de esta etapa, así que tampoco puede recogerse aquí (los valores que escribe esa ranura se saltan la validación de este atributo)',
      ),
    ).toBeInTheDocument();
  });
});
