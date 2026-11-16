import type { RichTextInsertMenuItem } from './InsertMenu';

/**
 * How many letters after a colon open the emoji menu, as `:sm` does. A colon
 * in a sentence ("Note: ...", "10:30") is never followed by two letters at
 * once, so it never opens it.
 */
const EMOJI_TRIGGER_LETTERS = 2;

/** The most emoji the menu lists at once; a search narrows them. */
export const EMOJI_MENU_LIMIT = 60;

const TYPED_SHORTCODE = new RegExp(
  `(?:^|[\\s(])(:[a-z]{${EMOJI_TRIGGER_LETTERS}})$`,
  'i',
);

/**
 * The start of an emoji's name that `before` (the text of the line up to the
 * caret) ends with, colon included: `:sm` in "Thanks :sm". Undefined unless
 * the colon opens a word and exactly the letters that open the menu follow
 * it, so the menu opens once, as the last of them is typed.
 */
export const typedEmojiSearch = (before: string): string | undefined =>
  TYPED_SHORTCODE.exec(before)?.[1];

type Gemoji = Readonly<{
  emoji: string;
  names: readonly string[];
  tags: readonly string[];
  description: string;
  category: string;
}>;

/**
 * The menu's items for a list of emoji: each is named by the emoji and what
 * it shows, searched also by its `:names:` and tags, listed under its
 * category, and inserts the emoji itself as text.
 */
export const emojiMenuItems = (
  emoji: readonly Gemoji[],
): RichTextInsertMenuItem[] =>
  emoji.map((each) => ({
    id: each.emoji,
    label: `${each.emoji} ${each.description}`,
    group: each.category,
    description: [
      ...each.names.map((name) => `:${name}:`),
      ...each.tags.filter((tag) => !each.names.includes(tag)),
    ].join(' '),
    content: { type: 'text', text: each.emoji },
  }));

let loading: Promise<RichTextInsertMenuItem[]> | undefined;

/**
 * Every emoji the menu offers: the list GitHub's `:shortcodes:` name, which
 * is also the one text is rendered with. Loaded the first time it is asked
 * for, so a page that never opens the menu never carries the list.
 */
export const loadEmojiMenuItems = (): Promise<RichTextInsertMenuItem[]> => {
  loading ??= import('gemoji').then(({ gemoji }) => emojiMenuItems(gemoji));
  return loading;
};
