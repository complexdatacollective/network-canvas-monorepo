import { describe, expect, it } from 'vitest';

import { createCatalogSource } from '@codaco/app-i18n/locales';
import { createAppIntl } from '@codaco/app-i18n/messages';
import { VariableNameSchema } from '@codaco/shared-consts';

import { protocolBuilderCatalogLoaders } from '../../../locales/catalogs';
import en from '../../../locales/en.json';

const NAME_HINT = 'protocolBuilder.codebookEntity.nameHint';

// Quoted spans in every quotation style the catalogs use: "…", “…”, „…“,
// «…» (with or without inner spacing) and 「…」.
const quotedExamples = (text: string) =>
  [...text.matchAll(/["“„«「]\s*([^"“”„«»「」]+?)\s*["“”»」]/g)].map(
    ([, example]) => example,
  );

const translatedLocales = Object.keys(protocolBuilderCatalogLoaders);

const catalogs = createCatalogSource(protocolBuilderCatalogLoaders);
await Promise.all(translatedLocales.map((locale) => catalogs.load(locale)));

const cases = ['en', ...translatedLocales].flatMap((locale) =>
  (['node', 'edge'] as const).map((entity) => ({ locale, entity })),
);

const examplesIn = (locale: string, entity: 'node' | 'edge') =>
  quotedExamples(
    createAppIntl({
      locale,
      messages: catalogs.peek(locale),
    }).formatMessage(
      {
        id: NAME_HINT,
        defaultMessage: en[NAME_HINT].defaultMessage,
        description: en[NAME_HINT].description,
      },
      { entity },
    ),
  );

/**
 * The hint under the type-name field suggests example names. Each one has to
 * be a name the field accepts, in every language: a researcher who types an
 * example in should not be told it is invalid. The English once suggested
 * "Works With", and translations followed it with spaces, accents and CJK
 * characters, none of which the name schema allows.
 */
describe('example names in the entity name hint', () => {
  it.each(cases)(
    'suggests only valid $entity type names in $locale',
    ({ locale, entity }) => {
      const examples = examplesIn(locale, entity);

      expect(examples.length).toBeGreaterThan(0);
      // As many as the English offers, so an example in a quotation style the
      // pattern does not recognise fails here rather than going unchecked.
      expect(examples).toHaveLength(examplesIn('en', entity).length);
      // The schema CodebookEntityEditor's validateFields applies to the name.
      expect(
        examples.filter(
          (example) => !VariableNameSchema.safeParse(example).success,
        ),
      ).toEqual([]);
    },
  );
});
