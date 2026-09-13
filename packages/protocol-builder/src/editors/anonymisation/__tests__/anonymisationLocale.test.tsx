import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { anonymisationStageEditor } from '../AnonymisationStageEditor.ts';
import { alreadyProtecting } from './anonymisationFixtures.tsx';

const openEditor = () =>
  renderStageEditor({
    stageId: 'anonymisation-1',
    locale: 'es',
    registry: anonymisationStageEditor,
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
  it('names the explanation section and both of its fields', async () => {
    openEditor();

    expect(
      await screen.findByRole('heading', {
        name: 'Explicación de la tarea',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Título' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Cuerpo' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Explica el proceso de anonimización a los participantes antes de que introduzcan su frase de contraseña.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * The type's own name is the researcher's, and the sentence around it is the
   * catalog's. Asserted on the whole accessible name, so a `{typeName}` left
   * out of the Spanish fails here rather than reading as a plausible heading.
   */
  it('splices a codebook type into the Spanish group name', async () => {
    const harness = openEditor();
    await harness.user.click(
      await screen.findByRole('switch', { name: 'person' }),
    );

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
   * The two sentences the encrypted-attributes section says about storage and
   * about one type's switch, in Architect's own words.
   *
   * Read in Spanish and as literals, so a catalog that lost either — or an
   * `es` entry left behind at the package's invented sentence — fails here
   * rather than in the fixture alone: the fixture proves the catalog carries
   * the string, this proves the section still puts it on screen.
   */
  it('says where an encrypted value is not kept, and what a type’s switch does', async () => {
    openEditor();

    expect(
      await screen.findByText(
        'Los valores de los atributos cifrados no se guardan en la base de datos.',
      ),
    ).toBeInTheDocument();
    // Read off the switch itself rather than as loose text: every node type
    // carries this sentence, and the one that matters is the one the switch
    // being read announces.
    expect(
      screen.getByRole('switch', { name: 'person' }),
    ).toHaveAccessibleDescription(
      'Activar el cifrado de atributos pertenecientes a este tipo de nodo.',
    );
  });

  /**
   * The three parts of the clear confirmation, in Architect's own Spanish.
   *
   * Read off the screen rather than out of the catalog: the title and the
   * button travel as plain strings through `useDialog().confirm()`, so a
   * section that formatted them once and held the result would still read
   * English here, and the description carries the researcher's own type name
   * spliced into the translated sentence rather than into the English one.
   */
  it('asks in Spanish before it un-encrypts a whole type', async () => {
    const harness = renderStageEditor({
      stageId: 'anonymisation-1',
      locale: 'es',
      registry: anonymisationStageEditor,
      client: alreadyProtecting('name'),
    });
    await waitFor(() =>
      expect(
        within(
          screen.getByRole('group', { name: 'Atributos cifrados de person' }),
        ).getByRole('checkbox', { name: 'name' }),
      ).toBeChecked(),
    );

    await harness.user.click(screen.getByRole('switch', { name: 'person' }));

    expect(
      await screen.findByText('Se borrará la selección de atributos'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Se desmarcarán todos los atributos cifrados del tipo de nodo person. ¿Quieres continuar?',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Borrar atributos cifrados' }),
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
      await screen.findByRole('switch', {
        name: 'Validación de la frase de contraseña',
      }),
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
   * name is "Longitud máxima del texto", not the English default.
   */
  it('refuses impossible passphrase lengths in Spanish', async () => {
    const harness = openEditor();

    const maximum = await screen.findByRole('spinbutton', {
      name: 'Longitud máxima del texto',
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
