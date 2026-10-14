import { z } from 'zod/mini';

import type { IntlShape } from '@codaco/app-i18n/messages';
import type { CustomFieldValidation } from '@codaco/fresco-ui/form/store/types';
import { makeValidationFunction } from '@codaco/fresco-ui/form/validation/helpers';
import {
  type MessageNode,
  messageStructure,
  messageText,
} from '@codaco/protocol-validation';

import { asLocalizedString } from '../localization/localizedText.ts';

/**
 * How many characters a value the interview fills in is counted as.
 *
 * What a value shows is not known until the interview: a first name, a date,
 * a count. A limit is there to keep text short enough to lay out, so a value
 * is counted as a typical short answer rather than as its name in the stored
 * message, or as nothing.
 */
export const VALUE_LENGTH = 10;

const nodesLength = (nodes: readonly MessageNode[]): number =>
  nodes.reduce((total, node) => {
    switch (node.kind) {
      case 'text':
        return total + node.text.length;
      case 'argument':
      case 'count':
        return total + VALUE_LENGTH;
      case 'switch':
        return (
          total +
          Math.max(
            0,
            ...node.versions.map((version) => nodesLength(version.nodes)),
          )
        );
    }
  }, 0);

/**
 * The length of the longest text a participant can be shown for `message`:
 * its words, each value counted as `VALUE_LENGTH`, and of each set of versions
 * the longest. The ICU syntax around values and versions is never shown, so it
 * is never counted.
 */
const visibleLength = (message: string): number => {
  if (!message.includes('{')) return messageText(message).length;
  const structure = messageStructure(message);
  return 'nodes' in structure
    ? nodesLength(structure.nodes)
    : messageText(message).length;
};

/**
 * A character limit that holds for every translation of a localized string.
 *
 * `Field`'s own `maxLength` judges the field's value as text, and a localized
 * field's value is the map of translations, which it does not read as text at
 * all — so on a localized field it is a rule that never fails. This runs the
 * same rule, and says it in the same words, against each translation in turn.
 *
 * Counted on the text a participant can be shown, not the stored message:
 * escaping a brace or an apostrophe lengthens the message without lengthening
 * the text, and the syntax that shows a value or chooses between versions of
 * the text is never shown at all.
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
          // Measured as a stand-in of the visible length, so the rule's own
          // words say what is wrong.
          const result = await translation.safeParseAsync(
            'x'.repeat(visibleLength(message)),
          );
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
