import { describe, expect, it } from 'vitest';

import { createAppIntl } from '@codaco/app-i18n/messages';
import { architectCatalogs } from '~/locales/catalogs';
import en from '~/locales/en.json';
import { createValidations } from '~/utils/validations';

const NAME_HINT = 'architect.typeEditor.typeEditor.thisNameIdentifiesTheTypeIn';

// Quoted spans in every quotation style the catalogs use: "…", “…”, „…“,
// «…» (with or without inner spacing) and 「…」.
const quotedExamples = (text: string) =>
  [...text.matchAll(/["“„«「]\s*([^"“”„«»「」]+?)\s*["“”»」]/g)].map(
    ([, example]) => example,
  );

const cases = ['en', ...Object.keys(architectCatalogs)].flatMap((locale) =>
  (['node', 'edge'] as const).map((entity) => ({ locale, entity })),
);

// The rule TypeEditor puts on its name field.
const isAllowedTypeName = createValidations().allowedNMToken();

/**
 * The hint under the type-name field suggests example names. Each one has to
 * be a name the field accepts, in every language: a researcher who types an
 * example in should not be told it is invalid. The English once suggested
 * "Works With", and translations followed it with spaces, accents and CJK
 * characters, none of which the field allows.
 */
describe('example names in the type name hint', () => {
  it.each(cases)(
    'suggests only valid $entity type names in $locale',
    ({ locale, entity }) => {
      const intl = createAppIntl({
        locale,
        messages: architectCatalogs[locale],
      });
      const hint = intl.formatMessage(
        {
          id: NAME_HINT,
          defaultMessage: en[NAME_HINT].defaultMessage,
          description: en[NAME_HINT].description,
        },
        { entity },
      );
      const examples = quotedExamples(hint);

      expect(examples.length).toBeGreaterThan(0);
      expect(
        examples.filter((example) => isAllowedTypeName(example) !== undefined),
      ).toEqual([]);
    },
  );
});
