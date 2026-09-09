import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { protocolBuilderCatalogs } from '../../locales/catalogs.ts';
import BuilderSection from '../../sections/BuilderSection.tsx';
import { esIntl, readMessage } from '../../testing/i18n.ts';
import {
  expectNoLocaleLeaks,
  protocolStrings,
} from '../../testing/localeSweep.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import Options, { optionsValidation } from '../arrayFields/Options.tsx';
import { READ_ONLY_MESSAGE } from '../readOnlyRefusal.ts';

/**
 * An options list and the shell around it, read in Spanish.
 *
 * The rest of this directory's suite mounts no provider, so every component
 * renders its English `defaultMessage` and the existing English assertions
 * stand unchanged. This is the one test that mounts one, and it covers the
 * routes the copy in `src/form` takes:
 *
 * - the shell's own markup, which formats with `useAppIntl()` (the outline's
 *   landmark);
 * - a list's markup, which does the same and also splices the researcher's own
 *   row number into it (`Editar opción 1`);
 * - a refusal, which is encoded where it is decided and decoded where it is
 *   read — the only route where an English word could survive a translated
 *   sentence, because the row noun travels inside it as a nested reference.
 *
 * The words are asserted as literals rather than by re-formatting the same
 * descriptor the component read: `esIntl.formatMessage(messages.x)` would pass
 * whatever the catalog said, including nothing at all.
 */
const optionsFields: SectionDoc = {
  label: 'Detalles',
  title: 'Detalles',
  items: [],
  options: [
    { label: 'Sí', value: 'si' },
    { label: 'No', value: 'no' },
  ],
};

const optionsSection = (
  <BuilderSection title="Opciones de respuesta">
    <Field
      name="options"
      label="Opciones de respuesta"
      component={Options}
      addButtonLabel="Crear una opción nueva"
      {...optionsValidation}
    />
  </BuilderSection>
);

/**
 * Everything on screen that is the researcher's rather than this package's:
 * the option list the stage is seeded with, read out of the same document the
 * harness mounts so a fixture that gains a row cannot quietly widen the
 * sweep's blind spot — or start failing it.
 */
const researcherWords = (fields: SectionDoc = optionsFields) =>
  protocolStrings(fields);

const renderInSpanish = (fields: SectionDoc = optionsFields) =>
  renderStageEditor({
    stage: { type: 'Information', fields },
    sections: optionsSection,
    locale: 'es',
  });

describe('a stage form read in Spanish', () => {
  it('ships Spanish for the ids this directory declares', () => {
    // Checked first so a merge that has not landed this directory's catalog
    // entries fails saying so, rather than as an unexplained English string.
    expect(Object.keys(protocolBuilderCatalogs.es ?? {})).toEqual(
      expect.arrayContaining([
        'protocolBuilder.outline.landmarkLabel',
        'protocolBuilder.option.editOption',
        'protocolBuilder.option.emptyState',
        'protocolBuilder.shell.readOnlyRefusal',
      ]),
    );
  });

  it('names the shell and the rows of a list in Spanish', async () => {
    renderInSpanish();

    expect(
      await screen.findByRole('navigation', { name: 'Secciones de la etapa' }),
    ).toBeInTheDocument();
    // The row's own number is spliced into the row's name, so this also fails
    // if the position stops reaching the message.
    expect(
      screen.getByRole('button', { name: 'Editar opción 1' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Eliminar opción 2' }),
    ).toBeInTheDocument();
    // The assertions above name what this surface is supposed to say; the sweep
    // reports whatever else it said — including a sentence rebuilt out of an
    // English pattern, which matches no whole message and so is invisible to
    // every assertion written as a literal.
    expectNoLocaleLeaks('the shell around a list', researcherWords());
  });

  it('says a list is empty in Spanish', async () => {
    const emptied: SectionDoc = {
      label: 'Detalles',
      title: 'Detalles',
      items: [],
    };
    renderInSpanish(emptied);

    expect(
      await screen.findByText('Todavía no se han añadido opciones.'),
    ).toBeInTheDocument();
    expectNoLocaleLeaks('an empty list', researcherWords(emptied));
  });

  it('reads a refused row save back through the decode a caller uses', () => {
    // The encoding half on its own: what a host reading this package's
    // refusals out of a result — rather than rendering them — gets back. It is
    // the sentence a row dialog shows above the draft it is keeping open when
    // the list will not take the row.
    expect(readMessage(READ_ONLY_MESSAGE, esIntl)).toBe(
      'Esta etapa es de solo lectura, así que tu cambio no se ha hecho. Otra persona la está editando.',
    );
  });
});
