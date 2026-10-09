import { z } from 'zod/mini';

import type { IntlShape } from '@codaco/app-i18n/messages';
import type { CustomFieldValidation } from '@codaco/fresco-ui/form/store/types';
import { makeValidationFunction } from '@codaco/fresco-ui/form/validation/helpers';
import { messageText } from '@codaco/protocol-validation';

import { asLocalizedString } from '../localization/localizedText.ts';

/**
 * A character limit that holds for every translation of a localized string.
 *
 * `Field`'s own `maxLength` judges the field's value as text, and a localized
 * field's value is the map of translations, which it does not read as text at
 * all — so on a localized field it is a rule that never fails. This runs the
 * same rule, and says it in the same words, against each translation in turn.
 *
 * Counted on the text the researcher typed, not the stored message: escaping a
 * brace or an apostrophe lengthens the message without lengthening the text.
 */
export function localizedMaxLength(
  max: number,
  intl: IntlShape,
): CustomFieldValidation {
  const translation = makeValidationFunction({ maxLength: max }, intl)({});

  return {
    schema: z.unknown().check(
      z.superRefine(async (value, ctx) => {
        for (const message of Object.values(asLocalizedString(value) ?? {})) {
          const result = await translation.safeParseAsync(messageText(message));
          const issue = result.success ? undefined : result.error.issues[0];
          if (issue !== undefined) {
            ctx.addIssue({
              code: 'custom',
              input: value,
              message: issue.message,
              path: [],
            });
            return;
          }
        }
      }),
    ),
  };
}
