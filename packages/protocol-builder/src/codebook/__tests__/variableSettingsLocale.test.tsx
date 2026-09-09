import { describe, expect, it } from 'vitest';

import type { IntlShape } from '@codaco/app-i18n/messages';
import { DATE_RESOLUTION } from '@codaco/protocol-validation';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { enIntl, esIntl, readMessage } from '../../testing/i18n.ts';
import { codebookRefusalMessage } from '../compoundFailureCopy.ts';
import {
  DuplicateVariableNameError,
  MissingVariableError,
} from '../editing.ts';
import { validateBooleanAnswers } from '../variableOptions.ts';
import {
  dateResolutionOptions,
  validateParameters,
} from '../variableParameters.ts';

/**
 * The producers under `codebook/` that answer with words but render none,
 * read in Spanish.
 *
 * All of them are asked where there is no reader and no language, so they
 * ENCODE a descriptor with `createMessageError` and the render site decodes it
 * — which is what lets a refusal already on screen follow a change of language
 * while it waits for the next save. Reading them back with
 * `readMessage(…, esIntl)` is therefore the same operation the render site
 * performs, and a producer that reached for a formatter of its own would
 * freeze its sentence in whatever language the researcher happened to be
 * reading when they pressed save.
 */
const readAll = (
  issues: Readonly<Record<string | number, readonly string[]>>,
  intl: IntlShape,
): Record<string, string[]> =>
  Object.fromEntries(
    Object.entries(issues).map(([key, messages]) => [
      key,
      messages.map((message) => readMessage(message, intl)),
    ]),
  );

describe('codebook copy produced outside React, read in Spanish', () => {
  it('refuses an unnamed boolean answer in the reader’s language', () => {
    expect(
      readAll(
        validateBooleanAnswers([
          { label: 'Sí', value: true },
          { label: '', value: false },
        ]),
        esIntl,
      ),
    ).toEqual({
      1: [
        'Escribe lo que dice esta respuesta, o borra ambas para ofrecer Sí y No.',
      ],
    });
  });

  it('refuses a scale with no end labels in the reader’s language', () => {
    expect(readAll(validateParameters('scalar', {}), esIntl)).toEqual({
      minLabel: ['Escribe qué significa el extremo bajo de la escala.'],
      maxLabel: ['Escribe qué significa el extremo alto de la escala.'],
    });
  });

  /**
   * The protocol's own parameter schemas raise hard-coded English about a
   * control name and a key — `DatePicker "min" must not be after "max"` — which
   * is written for whoever reads a log and names neither of the two fields on
   * screen. The editor asks the relations it knows about first, in its own
   * words, and the schema only afterwards.
   */
  it('refuses a reversed date range in the reader’s language, against the date that ends it', () => {
    expect(
      readAll(
        validateParameters('datePicker', {
          type: 'full',
          min: '2020-01-01',
          max: '2019-01-01',
        }),
        esIntl,
      ),
    ).toEqual({
      max: [
        'La fecha más tardía no puede ser anterior a la fecha más temprana.',
      ],
    });
  });

  it('names the format a bound has to be written in, without translating it', () => {
    expect(
      readAll(
        validateParameters('datePicker', { type: 'month', min: '2020-01-01' }),
        esIntl,
      ),
    ).toEqual({
      min: [
        'Escribe esta fecha como YYYY-MM, para que coincida con la resolución elegida arriba.',
      ],
    });
  });

  it('refuses a negative day offset in the reader’s language', () => {
    expect(
      readAll(validateParameters('relativeDatePicker', { before: -3 }), esIntl),
    ).toEqual({
      before: ['Escribe un número entero de días, cero o más.'],
    });
  });

  /**
   * The same refusal about the other thing a day-count field can hold. A
   * fraction reaches the draft as the text it was typed as — see
   * `asDayOffset`, which drops nothing it cannot store, so that this is asked
   * about it rather than about an absent setting nobody would refuse.
   *
   * Read in both languages: the English proves the refusal is the one under
   * the field, and the Spanish proves it comes from a catalog rather than a
   * literal written into the check.
   */
  it('refuses a day count written as a fraction in the reader’s language', () => {
    expect(
      readAll(
        validateParameters('relativeDatePicker', { before: '1.5' }),
        enIntl,
      ),
    ).toEqual({
      before: ['Write a whole number of days, zero or more.'],
    });
    expect(
      readAll(
        validateParameters('relativeDatePicker', { before: '1.5' }),
        esIntl,
      ),
    ).toEqual({
      before: ['Escribe un número entero de días, cero o más.'],
    });
  });

  /**
   * What the schema still refuses after the authored checks pass, said as this
   * package's own sentence about the block rather than as the schema's about a
   * path. `0099-01` is a real month the interview's own date control could
   * never offer, so nothing above it complains and the belt-and-braces parse
   * is what catches it.
   */
  it('reports what only the protocol schema refuses against the block, in its own words', () => {
    expect(
      readAll(
        validateParameters('datePicker', { type: 'month', min: '0099-01' }),
        esIntl,
      ),
    ).toEqual({
      '': [
        'Estos ajustes no se pueden guardar tal como están escritos. Revisa los valores de abajo.',
      ],
    });
  });

  /**
   * The format a date is stored in is not a word, so it is not translated.
   *
   * Each of these three ids says so in its own `description` ("The bracketed
   * pattern is the literal format the protocol stores and is not translated"),
   * and the refusal under the bound beside them names the same literal. A
   * Spanish reader told the field collects `AAAA-MM-DD` is told about a format
   * nothing in the protocol, the schema or the interview uses.
   *
   * Read off the schema's own table rather than written out, so a resolution
   * whose stored format changes takes this with it.
   */
  it('offers each date resolution with the literal format the protocol stores', () => {
    expect(
      dateResolutionOptions(esIntl).map(({ value, label }) => ({
        value,
        endsWithPattern: label.endsWith(`(${DATE_RESOLUTION[value].label})`),
      })),
    ).toEqual([
      { value: 'full', endsWithPattern: true },
      { value: 'month', endsWithPattern: true },
      { value: 'year', endsWithPattern: true },
    ]);
    // And the words around it really are Spanish, so the assertion above
    // cannot pass by the label having stayed English.
    expect(dateResolutionOptions(esIntl)[0]?.label).toBe(
      'Año, mes y día (YYYY-MM-DD)',
    );
  });

  it('says why a codebook save was refused in the reader’s language', () => {
    expect(
      readMessage(codebookRefusalMessage({ kind: 'sectionGone' }), esIntl),
    ).toBe(
      'Esta parte del libro de códigos ya no existe, así que no se ha guardado nada. Cierra este editor y empieza de nuevo.',
    );
  });

  it('names the collaborator holding a section it needs', () => {
    expect(
      readMessage(
        codebookRefusalMessage({
          kind: 'held',
          holder: {
            sessionId: 'session-1',
            userId: 'user-1',
            displayName: 'Ana',
            sectionId: sectionId({ kind: 'codebookNode', typeId: 'person' }),
            mode: 'editing',
          },
        }),
        esIntl,
      ),
    ).toBe(
      'Ana está editando ahora mismo una sección necesaria para este cambio.',
    );
  });
});

/**
 * The two refusals a researcher can reach that cross as an `Error.message`.
 *
 * `editing.ts` encodes both with `createMessageError`, and `writes.ts` passes
 * them through untouched so the surface showing them decodes them. Read in
 * both languages: the English proves the decoder is reached, and the Spanish
 * proves what it reaches is a catalog rather than a literal.
 */
describe('a thrown refusal a researcher can act on', () => {
  it.each([
    {
      caseName: 'a duplicate attribute name',
      error: new DuplicateVariableNameError('Age'),
      english: 'Attribute with name "Age" already exists',
      spanish: 'Ya existe un atributo con el nombre «Age»',
    },
    {
      caseName: 'an attribute a collaborator deleted',
      error: new MissingVariableError('variable-1'),
      english: 'Attribute record id "variable-1" does not exist',
      spanish: 'No existe ningún atributo con el id de registro «variable-1»',
    },
  ])(
    'reads $caseName in the reader’s language',
    ({ error, english, spanish }) => {
      expect(readMessage(error.message, enIntl)).toBe(english);
      expect(readMessage(error.message, esIntl)).toBe(spanish);
    },
  );

  /**
   * Everything else that throws keeps the generic copy: a transport error's own
   * words and a schema's sentence about a path are written for whoever reads a
   * log, so `writes.ts` replaces them rather than passing them on.
   */
  it('still says nothing about a failure whose words were not written for a researcher', () => {
    expect(
      readMessage(codebookRefusalMessage({ kind: 'unexplained' }), enIntl),
    ).toBe(
      'This change could not be saved, and nothing was altered. Wait a moment and try again.',
    );
  });
});
