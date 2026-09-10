import type { MessageDescriptor } from '@codaco/app-i18n/messages';

/**
 * The row noun the dialog-list specs edit their lists with.
 *
 * `DialogArrayField` takes its `itemLabel` as a descriptor rather than a word,
 * because every sentence the noun goes into is resolved somewhere else — so a
 * spec that renders one has to hand it a descriptor too. Written as a plain
 * object rather than through `defineMessages`: the package's own callers name
 * their rows in their own copy, and `prompt` is a fixture, not a message this
 * package ships. It is declared once here rather than in each spec so the six
 * lists that render prompts cannot drift apart about what a row is called.
 */
export const promptItemLabel: MessageDescriptor = {
  id: 'protocolBuilderTesting.arrayField.promptNoun',
  defaultMessage: 'prompt',
};
