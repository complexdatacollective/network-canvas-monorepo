import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import AnonymisationExplanationSection from '../AnonymisationExplanationSection.tsx';
import AnonymisationValidationSection from '../AnonymisationValidationSection.tsx';
import EncryptedVariablesSection from '../EncryptedVariablesSection.tsx';

const openEditor = () =>
  renderStageEditor({
    stageId: 'anonymisation-1',
    locale: 'es',
    sections: (
      <>
        <AnonymisationExplanationSection />
        <AnonymisationValidationSection />
        <EncryptedVariablesSection />
      </>
    ),
  });

/**
 * The anonymisation sections read in Spanish.
 *
 * The rest of this directory's suite mounts no provider, so every section
 * renders its English `defaultMessage` and the English assertions there stand
 * unchanged. This is the file that mounts one, and it exists to prove the
 * wiring rather than the words: that each section formats through
 * `useAppIntl()` rather than holding a string, that a value the protocol
 * supplied is spliced into the translated sentence rather than the English
 * one, and that a refusal crossing the form's string-only contract is decoded
 * in the reader's language rather than delivered as its encoding.
 *
 * The words are asserted as literals rather than by re-formatting the same
 * descriptor the component read: `intl.formatMessage(messages.x)` would pass
 * whatever the catalog said, including nothing at all.
 */
describe('the anonymisation sections, read in Spanish', () => {
  it('names the explanation section and both of its fields', () => {
    openEditor();

    expect(
      screen.getByRole('heading', {
        name: 'Explicación de la frase de contraseña',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Encabezado de la explicación' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'El encabezado que aparece arriba en la pantalla donde se pide la frase de contraseña.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * The type's own name is the researcher's, and the sentence around it is the
   * catalog's. Asserted on the whole accessible name, so a `{typeName}` left
   * out of the Spanish fails here rather than reading as a plausible heading.
   */
  it('splices a codebook type into the Spanish group name', async () => {
    openEditor();

    expect(
      await screen.findByRole('group', {
        name: 'Atributos cifrados de person',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Atributos cifrados' }),
    ).toBeInTheDocument();
  });

  /**
   * The confirmation is the one thing this family says through somebody else's
   * component — `BuilderSection` renders it — so it is where a string handed
   * over instead of a descriptor would still be English here.
   */
  it('warns in Spanish before the passphrase rules are discarded', async () => {
    const harness = openEditor();

    await harness.user.click(
      screen.getByRole('switch', { name: 'Reglas de la frase de contraseña' }),
    );

    expect(
      await screen.findByText(
        'Se descartarán las longitudes que has definido y los participantes podrán elegir cualquier frase de contraseña.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Quitar las reglas' }),
    ).toBeInTheDocument();
  });

  /**
   * The refusal crosses the field's string-only `custom` contract encoded, so
   * this is where a descriptor that had been flattened to an English sentence
   * on the way through would show up.
   *
   * The field is found by its Spanish name: `VariableValidationEditor` labels
   * every rule's control with `rule.label`, which is `maxLengthLabel` read
   * through this harness's `intl` — so under `locale: 'es'` the accessible
   * name is "Longitud máxima", not the English default.
   */
  it('refuses impossible passphrase lengths in Spanish', async () => {
    const harness = openEditor();

    const maximum = screen.getByRole('spinbutton', {
      name: 'Longitud máxima',
    });
    await harness.user.clear(maximum);
    await harness.user.type(maximum, '2');

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(
        'La frase de contraseña más corta que permites no puede ser más larga que la más larga.',
      ),
    ).toBeInTheDocument();
  });
});
