import { describe, expect, it } from 'vitest';

import { fieldBlockMarkdown } from '../fieldBlock.ts';
import {
  fieldIdsInDocument,
  formFieldPlacement,
  localesPlacingFieldText,
} from '../formFieldLocales.ts';

const NAME = 'f-name';
const AGE = 'f-age';

const documentOf = (...fieldIds: string[]) =>
  ['Intro', ...fieldIds.map(fieldBlockMarkdown)].join('\n\n');

const TRILINGUAL = { defaultLocale: 'en', locales: ['en', 'es', 'fr'] };

const placed = (
  placement: ReadonlyMap<string, ReadonlySet<string>>,
  locale: string,
) => [...(placement.get(locale) ?? [])];

describe('fieldIdsInDocument', () => {
  it('lists the fields of one document in order, and none of no document', () => {
    expect(fieldIdsInDocument(documentOf(AGE, NAME))).toEqual([AGE, NAME]);
    expect(fieldIdsInDocument('Only words.')).toEqual([]);
    expect(fieldIdsInDocument('')).toEqual([]);
    expect(fieldIdsInDocument(undefined)).toEqual([]);
  });
});

describe('formFieldPlacement', () => {
  it('places the fields of a language’s own document', () => {
    const placement = formFieldPlacement(
      { en: documentOf(NAME, AGE), es: documentOf(NAME) },
      TRILINGUAL,
    );
    expect(placed(placement, 'en')).toEqual([NAME, AGE]);
    expect(placed(placement, 'es')).toEqual([NAME]);
  });

  it('gives a declared language without a document the fields of the document it falls back to', () => {
    const placement = formFieldPlacement(
      { en: documentOf(NAME, AGE), es: documentOf(NAME) },
      TRILINGUAL,
    );
    expect(placed(placement, 'fr')).toEqual([NAME, AGE]);
  });

  it('places nothing in a declared language when no declared language has a document', () => {
    const placement = formFieldPlacement({ de: documentOf(NAME) }, TRILINGUAL);
    for (const locale of TRILINGUAL.locales) {
      expect(placed(placement, locale)).toEqual([]);
    }
  });

  // The interview never shows it, and validation reports it; an editor that
  // saves the form keeps what it places until the researcher removes it.
  it('places the fields of a document in a language that the protocol does not declare', () => {
    const placement = formFieldPlacement(
      { en: documentOf(NAME), de: documentOf(AGE) },
      TRILINGUAL,
    );
    expect(placed(placement, 'de')).toEqual([AGE]);
    expect(placed(placement, 'fr')).toEqual([NAME]);
  });

  it('lets nothing fall back without the protocol’s languages', () => {
    const placement = formFieldPlacement({ en: documentOf(NAME) }, undefined);
    expect([...placement.keys()]).toEqual(['en']);
  });

  it('places nothing for a form without documents', () => {
    expect(placed(formFieldPlacement(undefined, TRILINGUAL), 'en')).toEqual([]);
  });
});

describe('localesPlacingFieldText', () => {
  const protocol = {
    stages: [
      {
        form: {
          content: { en: documentOf(NAME, AGE), es: documentOf(NAME) },
          fields: [
            { id: NAME, variable: 'name' },
            { id: AGE, variable: 'age' },
          ],
        },
      },
    ],
  };

  it('names the declared languages whose form places the field', () => {
    expect(
      localesPlacingFieldText(
        ['stages', 0, 'form', 'fields', 1, 'prompt'],
        protocol,
        TRILINGUAL,
      ),
    ).toEqual(['en', 'fr']);
    expect(
      localesPlacingFieldText(
        ['stages', 0, 'form', 'fields', 0, 'hint'],
        protocol,
        TRILINGUAL,
      ),
    ).toEqual(['en', 'es', 'fr']);
  });

  it('says nothing of a text that is not a field’s question or hint', () => {
    expect(
      localesPlacingFieldText(
        ['stages', 0, 'form', 'content'],
        protocol,
        TRILINGUAL,
      ),
    ).toBeUndefined();
  });
});
