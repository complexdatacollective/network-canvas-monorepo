import type { RichTextInsertMenuItem } from './InsertMenu';

/**
 * How many characters of an emoji's name, typed after a colon, open the
 * list of suggestions, as `:sm` does. A colon in a sentence ("Note: ...",
 * "10:30") is never followed by them at the start of a word, so it never
 * opens it.
 */
const EMOJI_TRIGGER_LETTERS = 2;

/** The most emoji suggested at once while a name is typed. */
export const EMOJI_SUGGESTION_LIMIT = 8;

/** The most emoji the toolbar's menu lists at once; a search narrows them. */
export const EMOJI_MENU_LIMIT = 60;

const TYPED_NAME = new RegExp(
  `(?:^|[\\s(])(:[a-z0-9_+-]{${EMOJI_TRIGGER_LETTERS},})$`,
  'i',
);

/**
 * The start of an emoji's name that `before` (the text of the line up to the
 * caret) ends with, colon included: `:smi` in "Thanks :smi". Undefined
 * unless the colon opens a word and at least the characters that open the
 * suggestions follow it with nothing between.
 */
export const typedEmojiName = (before: string): string | undefined =>
  TYPED_NAME.exec(before)?.[1];

type Gemoji = Readonly<{
  emoji: string;
  names: readonly string[];
  tags: readonly string[];
  description: string;
  category: string;
}>;

/** An emoji as it is suggested: the character, and the names it goes by. */
export type EmojiSuggestion = Readonly<{
  emoji: string;
  /** Its `:shortcode:` names, without their colons; the first is shown. */
  names: readonly string[];
  tags: readonly string[];
}>;

/**
 * The emoji whose names begin with what was `typed` after the colon, then
 * those whose names hold it, then those tagged with a word that begins with
 * it: at most `limit`, in the list's own order within each.
 */
export const suggestEmoji = (
  emoji: readonly EmojiSuggestion[],
  typed: string,
  limit: number = EMOJI_SUGGESTION_LIMIT,
): EmojiSuggestion[] => {
  const query = typed.toLowerCase();
  if (query === '') return [];
  const begins: EmojiSuggestion[] = [];
  const holds: EmojiSuggestion[] = [];
  const tagged: EmojiSuggestion[] = [];
  for (const each of emoji) {
    if (each.names.some((name) => name.startsWith(query))) begins.push(each);
    else if (each.names.some((name) => name.includes(query))) holds.push(each);
    else if (each.tags.some((tag) => tag.startsWith(query))) tagged.push(each);
    if (begins.length >= limit) break;
  }
  return [...begins, ...holds, ...tagged].slice(0, limit);
};

/**
 * The toolbar menu's items for a list of emoji: each named by the emoji and
 * its first `:shortcode:`, searched also by its other names and its tags,
 * in one list, and inserting the emoji itself as text.
 */
export const emojiMenuItems = (
  emoji: readonly EmojiSuggestion[],
): RichTextInsertMenuItem[] =>
  emoji.map((each) => ({
    id: each.emoji,
    label: `${each.emoji} :${each.names[0] ?? ''}:`,
    description: [
      ...each.names.slice(1).map((name) => `:${name}:`),
      ...each.tags.filter((tag) => !each.names.includes(tag)),
    ].join(' '),
    content: { type: 'text', text: each.emoji },
  }));

let loading: Promise<readonly EmojiSuggestion[]> | undefined;

/**
 * Every emoji offered: the list GitHub's `:shortcodes:` name, which is also
 * the one text is rendered with. Loaded the first time it is asked for, so a
 * page that never asks never carries the list.
 */
export const loadEmoji = (): Promise<readonly EmojiSuggestion[]> => {
  loading ??= import('gemoji').then(({ gemoji }) =>
    gemoji.map(({ emoji, names, tags }: Gemoji): EmojiSuggestion => ({
      emoji,
      names,
      tags,
    })),
  );
  return loading;
};
