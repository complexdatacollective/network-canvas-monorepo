import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BIOLOGICAL_SEX_OPTIONS } from '@codaco/protocol-validation';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  attributeField,
  createRowIn,
} from '../../../../testing/attributePicker.ts';
import { renderStageEditor } from '../../../../testing/renderStageEditor.tsx';
import { shimMarkdownEditorMeasurement } from '../../__tests__/editorFixtures.ts';
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
    const harness = renderStageEditor({
      stageId: 'family-pedigree-1',
      locale: 'es',
      sections: <PedigreeNodeConfigurationSection />,
    });

    // The slot's own label is what names it, and the attribute it holds is
    // shown beside the control rather than selected inside it — the codebook
    // name is the researcher's word and stays as they wrote it.
    expect(
      within(attributeField('Etiqueta visible')).getByText('fm_name'),
    ).toBeVisible();
    expect(
      within(attributeField('Identificador del participante')).getByText(
        'is_ego',
      ),
    ).toBeVisible();
    // The control that opens the attribute window says what pressing it does,
    // in Spanish, and says it differently once something has been chosen.
    expect(
      within(attributeField('Etiqueta visible')).getByRole('button', {
        name: 'Cambiar atributo',
      }),
    ).toBeInTheDocument();
    // Inventing one is offered from inside the window, on the term the
    // researcher typed, and in their language.
    expect(
      await createRowIn(
        harness.user,
        attributeField('Sexo biológico'),
        'Busca o crea un atributo',
        (term) => `Crear un atributo nuevo llamado “${term}”.`,
      ),
    ).not.toBeNull();
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
            // A replacement carrying the values the interface owns, so this
            // slot has something left to offer. Without one the picker has
            // nothing to choose and nothing to create, and stands the whole
            // control down behind its empty-state sentence — taking the note
            // about the held attribute with it. Never chosen here: what is
            // read below is the attribute the slot is still bound to.
            recordedSex: {
              name: 'recordedSex',
              type: 'categorical',
              options: BIOLOGICAL_SEX_OPTIONS,
            },
          },
        },
      },
    });

    const control = attributeField('Sexo biológico');
    // The collaborator's revision reaches this control over the protocol
    // channel, which is a microtask: read after it has arrived, not before.
    await within(control).findByText(
      'biologicalSex — ya no ofrece los valores que necesita este control',
    );
    // Still the researcher's stored choice, and the control says so: the
    // button offers to CHANGE an attribute rather than to choose a first one.
    expect(
      within(control).getByRole('button', { name: 'Cambiar atributo' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Este atributo ya no ofrece exactamente los valores que necesita este control, porque se cambiaron en otro sitio. Elige otro.',
      ),
    ).toBeInTheDocument();
    // And never listed as one that can be picked. Opened by clicking the
    // Spanish trigger rather than through `openAttributePicker`, which knows
    // the English one: this file is the only place the window is opened in
    // another language.
    await harness.user.click(
      within(control).getByRole('button', { name: 'Cambiar atributo' }),
    );
    const picker = await screen.findByRole('dialog');
    expect(
      [...picker.querySelectorAll('[role="option"]')].map((row) =>
        row.getAttribute('data-attribute-id'),
      ),
    ).toEqual(['recordedSex']);
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
