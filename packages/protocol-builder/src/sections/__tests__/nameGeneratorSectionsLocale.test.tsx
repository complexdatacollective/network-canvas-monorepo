import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import AlterLimitsSection from '../AlterLimitsSection.tsx';
import CardDisplaySection from '../CardDisplaySection.tsx';
import ExternalDataSourceSection from '../ExternalDataSourceSection.tsx';
import NameGeneratorPromptsSection from '../NameGeneratorPromptsSection.tsx';
import NodePanelsSection from '../NodePanelsSection.tsx';
import QuickAddSection from '../QuickAddSection.tsx';
import SearchOptionsSection from '../SearchOptionsSection.tsx';
import SortOptionsSection from '../SortOptionsSection.tsx';

/**
 * The form and name-generator sections read in Spanish.
 *
 * The rest of this directory's suite mounts no provider, so every section
 * renders its English `defaultMessage` and the existing English assertions
 * stand unchanged. These are the tests that mount one, and they exist to prove
 * the wiring rather than the words: that a section formats through
 * `useAppIntl()` rather than holding a string, that the catalog a host merges
 * is the catalog it reads, and that a value the researcher supplied — a data
 * file's own column headings, a count of rules — is spliced into the
 * translated sentence rather than into the English one.
 *
 * The words are asserted as literals rather than by re-formatting the same
 * descriptor the component read: `esIntl.formatMessage(messages.x)` would pass
 * whatever the catalog said, including nothing at all.
 */

/** A name generator carrying the panels a test needs it to start with. */
const nameGeneratorWith = (panels: SectionDoc[]) => ({
  id: 'name-generator-with-panels',
  type: 'NameGenerator' as const,
  fields: {
    label: 'Name Generator',
    subject: { entity: 'node', type: 'person' },
    form: {
      title: 'Add a person',
      fields: [{ variable: 'name', prompt: "What is this person's name?" }],
    },
    prompts: [{ id: 'prompt-1', text: 'Who are the people you know?' }],
    panels,
  },
});

describe('the form and name-generator sections, read in Spanish', () => {
  it('names the nomination limits and both ends of the range', () => {
    renderStageEditor({
      stageId: 'name-generator-roster-1',
      locale: 'es',
      sections: <AlterLimitsSection />,
    });

    expect(
      screen.getByRole('spinbutton', { name: /Número mínimo de personas/ }),
    ).toHaveValue(1);
    expect(
      screen.getByRole('spinbutton', { name: /Número máximo de personas/ }),
    ).toHaveValue(8);
    expect(
      screen.getByText('Deja el campo vacío para no establecer un máximo.'),
    ).toBeInTheDocument();
  });

  it('names the roster source and lists the file’s own columns', async () => {
    renderStageEditor({
      stageId: 'name-generator-roster-1',
      locale: 'es',
      sections: <ExternalDataSourceSection />,
    });

    expect(
      screen.getByText(
        'Elige el archivo de datos con las personas que esta etapa ofrece al participante.',
      ),
    ).toBeInTheDocument();
    // The column headings are the researcher's own words and are never
    // translated — but the list they are joined into is, so an English "and"
    // here would be an English clause inside a Spanish sentence.
    expect(
      await screen.findByText(
        'Las personas que contiene tienen estos atributos: age y name.',
      ),
    ).toBeInTheDocument();
  });

  it('names the card details and the columns of its list', async () => {
    renderStageEditor({
      stageId: 'name-generator-roster-1',
      locale: 'es',
      sections: <CardDisplaySection />,
    });

    expect(
      await screen.findByRole('button', {
        name: 'Añadir nuevo detalle de tarjeta',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: /Atributos mostrados en una tarjeta/ }),
    ).toBeInTheDocument();
  });

  it('names the roster order and both of its lists', async () => {
    renderStageEditor({
      stageId: 'name-generator-roster-1',
      locale: 'es',
      sections: <SortOptionsSection />,
    });

    expect(
      await screen.findByRole('list', { name: /Orden inicial/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('list', {
        name: /Atributos por los que el participante puede ordenar/,
      }),
    ).toBeInTheDocument();
  });

  it('names the roster search and the tolerances it offers', async () => {
    renderStageEditor({
      stageId: 'name-generator-roster-1',
      locale: 'es',
      sections: <SearchOptionsSection />,
    });

    expect(
      await screen.findByRole('group', {
        name: /Atributos con los que se compara una búsqueda/,
      }),
    ).toBeInTheDocument();
    // The tolerances are the tick labels of a scale rather than named
    // controls, so they are read as text — and the scale draws each of them
    // twice, once for the tick and once for the value it announces.
    expect(
      screen.getAllByText('Permitir pequeñas diferencias').length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText('Permitir erratas y faltas de ortografía').length,
    ).toBeGreaterThan(0);
  });

  it('names the quick-add attribute and the offer to invent one', () => {
    renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      locale: 'es',
      sections: <QuickAddSection />,
    });

    expect(
      screen.getByRole('combobox', { name: /Atributo que se rellena/ }),
    ).toHaveValue('name');
    expect(
      screen.getByRole('button', { name: 'Crear el atributo' }),
    ).toBeInTheDocument();
  });

  it('names a prompt’s two halves and counts its stamps in Spanish', async () => {
    const harness = renderStageEditor({
      stage: {
        id: 'name-generator-with-stamps',
        type: 'NameGenerator',
        fields: {
          label: 'Name Generator',
          subject: { entity: 'node', type: 'person' },
          prompts: [
            {
              id: 'prompt-1',
              text: 'Who are the people you know?',
              additionalAttributes: [{ variable: 'closeFriend', value: true }],
            },
          ],
        },
      },
      locale: 'es',
      sections: <NameGeneratorPromptsSection />,
    });

    // The count is an ICU plural rather than a ternary over two sentences, so
    // this is where a language with different plural rules would break.
    expect(
      await screen.findByText('Asigna 1 atributo adicional.'),
    ).toBeInTheDocument();

    await harness.user.click(
      await screen.findByRole('button', { name: 'Editar pregunta' }),
    );
    const dialog = within(await screen.findByRole('dialog'));
    expect(
      dialog.getByRole('textbox', { name: /Texto de la pregunta/ }),
    ).toBeInTheDocument();
    expect(dialog.getByText('Atributos adicionales')).toBeInTheDocument();
  });

  it('names the side panels and summarises one in Spanish', async () => {
    renderStageEditor({
      stage: nameGeneratorWith([
        {
          id: 'panel-1',
          title: 'People you named earlier',
          dataSource: 'existing',
          filter: {
            join: 'AND',
            rules: [
              {
                id: 'rule-1',
                type: 'edge',
                options: { type: 'knows', operator: 'EXISTS' },
              },
            ],
          },
        },
      ]),
      locale: 'es',
      sections: <NodePanelsSection />,
    });

    expect(
      await screen.findByRole('button', { name: 'Crear nuevo panel' }),
    ).toBeInTheDocument();
    // The panel's source is a clause of the same sentence rather than a
    // fragment concatenated onto it, so an English source phrase inside the
    // Spanish sentence would fail here.
    expect(
      screen.getByText(
        'Muestra las personas nombradas hasta ahora, limitado por 1 regla.',
      ),
    ).toBeInTheDocument();
  });
});
