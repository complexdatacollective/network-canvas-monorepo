import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { sectionId } from '@codaco/studio-sync/taxonomy';

import { shimMarkdownEditorMeasurement } from '../../../editors/pedigree/__tests__/editorFixtures.tsx';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import BoundaryOptionsSection from '../BoundaryOptionsSection.tsx';
import FramingConfigSection from '../FramingConfigSection.tsx';
import NominationPromptsSection from '../NominationPromptsSection.tsx';
import PedigreeNodeConfigurationSection from '../PedigreeNodeConfigurationSection.tsx';
import {
  familyPedigreeStageWith,
  familyPedigreeStageWithout,
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

  it('names each attribute slot and the control that creates one', async () => {
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
    // Awaited: a stage the host has not answered for yet offers no way to
    // create anything, because nobody may write to it.
    expect(
      await screen.findByRole('button', {
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
   * The note a slot picker shows about a held attribute whose values moved is
   * formatted by the slot field, not by the picker — the picker is handed
   * finished words — so this is where a section that handed it English would
   * show up.
   */
  it('names a held attribute whose values changed, in Spanish', async () => {
    const harness = renderStageEditor({
      stageId: 'family-pedigree-1',
      locale: 'es',
      sections: <PedigreeNodeConfigurationSection />,
    });
    const section =
      harness.protocolSections()[
        sectionId({ kind: 'codebookNode', typeId: 'family_member' })
      ];
    const variables =
      typeof section?.variables === 'object' && section.variables !== null
        ? section.variables
        : {};

    harness.receiveCodebookUpdate({
      node: {
        family_member: {
          ...section,
          variables: {
            ...variables,
            biologicalSex: {
              name: 'biologicalSex',
              type: 'categorical',
              options: [
                { value: 'female', label: 'Female' },
                { value: 'male', label: 'Male' },
              ],
            },
          },
        },
      },
    });

    // The collaborator's revision reaches this control over the protocol
    // channel, which is a microtask: read after it has arrived, not before.
    await screen.findByRole('option', {
      name: 'biologicalSex — ya no ofrece los valores que necesita este control',
    });
    const control = screen.getByRole('combobox', { name: 'Sexo biológico' });
    expect(control).toHaveValue('biologicalSex');
    expect(
      within(control).getByRole('option', {
        name: 'biologicalSex — ya no ofrece los valores que necesita este control',
      }),
    ).toHaveValue('biologicalSex');
    expect(
      screen.getByText(
        'Este atributo ya no ofrece exactamente los valores que necesita este control, porque se cambiaron en otro sitio. Elige otro.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * The one sentence in this area that leaves React before it is read.
   *
   * A pedigree's refusals have no formatter where they are decided, so they
   * are encoded and handed to the field as plain strings; `FieldErrors`
   * decodes them where they render. A refusal frozen into English at the
   * moment the save was judged would pass every other test in this file and
   * fail here.
   *
   * Read through the nomination prompts, whose switch-on-and-leave-empty is
   * the refusal a researcher can still reach: every slot refusal is now
   * withheld by the picker before a pick can earn it — see
   * `slotWiring.test.ts`, which asks the gate for those sentences directly.
   */
  it('reads a refused save back in Spanish', async () => {
    // The fixture pedigree already asks one question, so the switch below
    // would turn it OFF (and ask for confirmation) rather than on: open a
    // pedigree that asks nothing, which is the one whose empty switch-on is
    // the refusal this test reads.
    const harness = renderStageEditor({
      stage: familyPedigreeStageWithout(['nominationPrompts']),
      locale: 'es',
      sections: <NominationPromptsSection />,
    });

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Preguntas de nominación' }),
    );

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(
        'Añade al menos una pregunta de nominación, o desactiva esta sección.',
      ),
    ).toBeInTheDocument();
  });
});
