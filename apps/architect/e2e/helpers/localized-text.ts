import type { LocalizedString } from '@codaco/protocol-validation';

// The page objects locate rows and controls by the text a researcher sees, so
// a spec holding a schema `LocalizedString` reads the default-language
// translation the fixtures author.
export function englishText(value: LocalizedString): string {
  const text = value.en;
  if (text === undefined) {
    throw new Error('expected an English translation in the fixture');
  }
  return text;
}
