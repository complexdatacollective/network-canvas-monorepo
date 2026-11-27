'use client';

import { Autocomplete } from '@base-ui/react/autocomplete';
import type { JSONContent } from '@tiptap/react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import { cx } from '../../../utils/cva';

const messages = defineMessages({
  search: {
    id: 'frescoUi.richTextEditor.emojiMenuSearch',
    defaultMessage: 'Search',
    description:
      'Accessible name and placeholder of the search box in the rich text editor’s emoji menu, which filters the emoji that can be inserted into the text.',
  },
  noMatches: {
    id: 'frescoUi.richTextEditor.emojiMenuNoMatches',
    defaultMessage: 'Nothing matches your search.',
    description:
      'Shown in the rich text editor’s emoji menu when the search matches no emoji.',
  },
});

/**
 * An emoji the toolbar's emoji menu offers: what it is called, a second line
 * of its other names, and the text inserted at the caret when it is chosen.
 */
export type RichTextEmojiMenuItem = Readonly<{
  id: string;
  label: string;
  /** A second line under the label, searched as well. */
  description?: string;
  content: JSONContent;
}>;

/** The toolbar's searchable emoji menu. */
export type RichTextEmojiMenu = Readonly<{
  /** Names the toolbar button and the menu. */
  label: string;
  items: readonly RichTextEmojiMenuItem[];
}>;

/**
 * The menu's search box and list, shown inside the popover the editor opens.
 * The list is always shown, filtered as the search is typed, with the first
 * match highlighted so Enter inserts it.
 */
export function EmojiMenuList({
  menu,
  onPick,
  limit,
}: {
  menu: RichTextEmojiMenu;
  onPick: (item: RichTextEmojiMenuItem) => void;
  /** The most items listed at once, for a menu too long to draw whole. */
  limit?: number;
}) {
  const intl = useAppIntl();
  const search = intl.formatMessage(messages.search);

  return (
    <Autocomplete.Root
      items={menu.items}
      inline
      open
      autoHighlight="always"
      {...(limit !== undefined && { limit })}
      itemToStringValue={(item: RichTextEmojiMenuItem) =>
        [item.label, item.description].filter(Boolean).join(' ')
      }
    >
      <div className="flex w-72 max-w-full flex-col gap-2">
        <Autocomplete.Input
          autoFocus
          aria-label={search}
          placeholder={search}
          className={cx(
            'bg-input text-input-contrast h-10 w-full rounded-sm border border-current/20 px-3 text-sm',
            'focusable',
          )}
        />
        <Autocomplete.Empty className="px-2 py-3 text-sm text-current/70 empty:hidden">
          {intl.formatMessage(messages.noMatches)}
        </Autocomplete.Empty>
        <Autocomplete.List
          aria-label={menu.label}
          className="max-h-72 overflow-y-auto outline-none data-empty:hidden"
        >
          {(item: RichTextEmojiMenuItem) => (
            <Autocomplete.Item
              key={item.id}
              value={item}
              onClick={() => onPick(item)}
              className={cx(
                'flex cursor-default flex-col rounded-sm px-2 py-1.5 text-sm select-none',
                'data-highlighted:bg-primary data-highlighted:text-primary-contrast',
              )}
            >
              <span className="font-semibold">{item.label}</span>
              {item.description !== undefined && (
                <span className="text-xs opacity-80">{item.description}</span>
              )}
            </Autocomplete.Item>
          )}
        </Autocomplete.List>
      </div>
    </Autocomplete.Root>
  );
}
