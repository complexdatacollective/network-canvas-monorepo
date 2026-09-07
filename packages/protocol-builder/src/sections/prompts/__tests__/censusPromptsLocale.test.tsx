import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import CategoricalBinPromptsSection from '../CategoricalBinPromptsSection.tsx';
import DyadCensusPromptsSection from '../DyadCensusPromptsSection.tsx';
import OneToManyDyadCensusPromptsSection from '../OneToManyDyadCensusPromptsSection.tsx';
import OrdinalBinPromptsSection from '../OrdinalBinPromptsSection.tsx';
import TieStrengthCensusPromptsSection from '../TieStrengthCensusPromptsSection.tsx';

/**
 * The census and bin prompt sections read in Spanish.
 *
 * The rest of this directory's suite mounts no provider, so every section
 * renders its English `defaultMessage` and the existing English assertions
 * stand unchanged. These are the tests that mount one, and they exist to prove
 * the wiring rather than the words: that each family formats through
 * `useAppIntl()` rather than holding a string, and that the two kinds of
 * message a family renders both arrive — the sentence it hands the shared
 * prompts section as a descriptor, and the copy inside its own row dialog.
 *
 * One test per family, and each asserts BOTH kinds: a family whose own words
 * were converted and whose shared ones were not would otherwise pass.
 *
 * The words are asserted as literals rather than by re-formatting the same
 * descriptor the component read: `esIntl.formatMessage(messages.x)` would pass
 * whatever the catalog said, including nothing at all.
 */
describe('the census and bin prompt sections, read in Spanish', () => {
  it('words a categorical bin around its groups', async () => {
    const harness = renderStageEditor({
      stageId: 'categorical-bin-1',
      locale: 'es',
      sections: <CategoricalBinPromptsSection />,
    });

    // Handed to the shared section as a descriptor, so an English sentence
    // here would mean the seam resolved a word too early.
    expect(
      screen.getByText(
        'Escribe las preguntas que hace esta etapa sobre cada persona y arrástralas al orden en que las responde el participante.',
      ),
    ).toBeInTheDocument();

    await harness.user.click(
      screen.getByRole('button', { name: 'Editar pregunta' }),
    );

    expect(
      await screen.findByText(
        'El participante arrastra a cada persona a uno de los grupos de abajo, así que escribe una pregunta cuyas respuestas sean esos grupos: «¿qué tipo de contacto tienes con esta persona?» en lugar de una pregunta de sí o no.',
      ),
    ).toBeInTheDocument();
    // Declared in `censusPromptsMessages.ts` rather than beside this family,
    // which is the other half of the wiring.
    expect(
      screen.getByRole('combobox', { name: 'Atributo' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Un grupo para todo lo demás' }),
    ).toBeInTheDocument();
  });

  it('words an ordinal bin around its scale and its gradient', async () => {
    const harness = renderStageEditor({
      stageId: 'ordinal-bin-1',
      locale: 'es',
      sections: <OrdinalBinPromptsSection />,
    });

    expect(
      screen.getByText(
        'El participante clasifica a todas las personas en grupos ordenados para una pregunta cada vez, en este orden.',
      ),
    ).toBeInTheDocument();

    await harness.user.click(
      screen.getByRole('button', { name: 'Editar pregunta' }),
    );

    expect(
      await screen.findByText(
        'Los grupos se sombrean a lo largo de este degradado en el orden en que el atributo lista sus valores.',
      ),
    ).toBeInTheDocument();
    // The swatch names are the gradient picker's own, and a coloured circle
    // has nothing else a screen reader can read.
    expect(
      screen.getByRole('radio', { name: 'Verde mar' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Orden dentro de cada grupo' }),
    ).toBeInTheDocument();
  });

  it('words a dyad census around the pair and the connection it records', async () => {
    const harness = renderStageEditor({
      stageId: 'dyad-census-1',
      locale: 'es',
      sections: <DyadCensusPromptsSection />,
    });

    expect(
      screen.getByText(
        'Al participante se le muestra una pareja de personas cada vez y responde estas preguntas sobre ella, en este orden.',
      ),
    ).toBeInTheDocument();

    await harness.user.click(
      screen.getByRole('button', { name: 'Editar pregunta' }),
    );

    expect(
      await screen.findByText(
        'Se crea un vínculo de este tipo entre las dos personas siempre que el participante responde que sí.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Crear un tipo de vínculo nuevo' }),
    ).toBeInTheDocument();
  });

  it('words a one-to-many dyad census around its two orderings', async () => {
    const harness = renderStageEditor({
      stageId: 'one-to-many-dyad-census-1',
      locale: 'es',
      sections: <OneToManyDyadCensusPromptsSection />,
    });

    expect(
      screen.getByText(
        'Al participante se le muestra una persona cada vez y elige a cuáles de las demás se aplica la pregunta.',
      ),
    ).toBeInTheDocument();

    await harness.user.click(
      screen.getByRole('button', { name: 'Editar pregunta' }),
    );

    expect(
      await screen.findByRole('switch', {
        name: 'Orden de las personas por las que se pregunta',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Se crea un vínculo de este tipo desde la persona por la que se pregunta hasta cada persona que elija el participante.',
      ),
    ).toBeInTheDocument();
  });

  it('words a tie-strength census around its scale and its decline answer', async () => {
    const harness = renderStageEditor({
      stageId: 'tie-strength-census-1',
      locale: 'es',
      sections: <TieStrengthCensusPromptsSection />,
    });

    expect(
      screen.getByText(
        'Escribe las preguntas que hace esta etapa sobre cada pareja y arrástralas al orden en que las responde el participante.',
      ),
    ).toBeInTheDocument();

    await harness.user.click(
      screen.getByRole('button', { name: 'Editar pregunta' }),
    );

    expect(
      await screen.findByRole('textbox', { name: 'Respuesta negativa' }),
    ).toBeInTheDocument();
    // The scale's own group is titled from the shared file.
    expect(
      screen.getByText(
        'Elige el atributo en cuyos valores ordenados responde el participante.',
      ),
    ).toBeInTheDocument();
  });
});
