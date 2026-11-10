import type { LocalizationDeclaration } from '../../localization/localeTag.ts';
import { findMissingInterfaceText } from './interface-text.ts';

type Issue = Readonly<{ message: string; path: (string | number)[] }>;

const quoted = (keys: readonly string[]) =>
  keys.map((key) => `"${key}"`).join(', ');

/**
 * The interface text a protocol shows but does not hold, as validation
 * issues: one at each missing group, naming the entries it must hold, and one
 * at each missing entry of a group it holds.
 */
export const missingInterfaceTextIssues = (
  protocol: Readonly<{
    localization: LocalizationDeclaration;
    codebook?: unknown;
    stages?: readonly unknown[];
    interfaceText?: unknown;
  }>,
): readonly Issue[] =>
  findMissingInterfaceText(protocol).map(({ group, key, entries }) =>
    key === undefined
      ? {
          message: `The interview shows text from the "${group}" interface text group, so the protocol must hold this group, with these entries in its languages: ${quoted(entries)}.`,
          path: ['interfaceText', group],
        }
      : {
          message: `The interview shows the "${key}" text of the "${group}" interface text group, so the group must hold it in the protocol's languages.`,
          path: ['interfaceText', group, key],
        },
  );
