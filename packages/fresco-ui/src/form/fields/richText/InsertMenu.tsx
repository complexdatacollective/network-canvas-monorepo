'use client';

import { Autocomplete } from '@base-ui/react/autocomplete';
import type { JSONContent } from '@tiptap/react';
import { type FocusEvent, useMemo } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import {
  type PresentationalText,
  presentationalTextProps,
  presentationalTextValue,
} from '../../../PresentationalText';
import { cx } from '../../../utils/cva';

const messages = defineMessages({
  search: {
    id: 'frescoUi.richTextEditor.insertMenuSearch',
    defaultMessage: 'Search',
    description:
      'Accessible name and placeholder of the search box in the rich text editor’s insert menu, which filters the things that can be inserted into the text.',
  },
  noMatches: {
    id: 'frescoUi.richTextEditor.insertMenuNoMatches',
    defaultMessage: 'Nothing matches your search.',
    description:
      'Shown in the rich text editor’s insert menu when the search matches nothing that can be inserted.',
  },
});

/**
 * Something the editor's insert menu offers: what it is called, the heading
 * it is listed under, and the content inserted at the caret when it is
 * chosen. The editor knows nothing about what the content means.
 */
export type RichTextInsertMenuItem = Readonly<{
  id: string;
  /**
   * The interface's words for it, or `{ text, dir: 'auto' }` for a name
   * someone wrote (an attribute's), which reads in its own direction.
   */
  label: PresentationalText;
  /** The heading the item is listed under; items without one come first. */
  group?: string;
  /** A second line under the label, such as what kind of thing it is. */
  description?: string;
  /**
   * Listed but not insertable, such as something the text cannot use until
   * it is set up elsewhere; `description` says why.
   */
  disabled?: boolean;
  content: JSONContent | readonly JSONContent[];
  /**
   * For something that has to be set up before it can be inserted (the
   * rules of an "If"): chosen, the menu closes and calls this in place of
   * inserting `content`. Calling `insert` then inserts what it is given
   * where the caret was; never calling it inserts nothing.
   */
  request?: (
    insert: (content: JSONContent | readonly JSONContent[]) => void,
  ) => void;
}>;

/**
 * A searchable menu of things to insert into the text, opened from the
 * toolbar and, when `trigger` is set, by typing that character. Escape after
 * typing the trigger keeps the character as text.
 */
export type RichTextInsertMenu = Readonly<{
  /** Names the toolbar button and the menu. */
  label: string;
  items: readonly RichTextInsertMenuItem[];
  trigger?: string;
}>;

type Group = Readonly<{ value: string; items: RichTextInsertMenuItem[] }>;

const groupsOf = (items: readonly RichTextInsertMenuItem[]): Group[] => {
  const groups = new Map<string, RichTextInsertMenuItem[]>();
  for (const item of items) {
    const key = item.group ?? '';
    const listed = groups.get(key);
    if (listed === undefined) groups.set(key, [item]);
    else listed.push(item);
  }
  return [...groups].map(([value, listed]) => ({ value, items: listed }));
};

/**
 * The menu's search box and list, shown inside the popover the editor opens.
 * The list is always shown, filtered as the search is typed, with the first
 * match highlighted so Enter inserts it.
 */
export function InsertMenuList({
  menu,
  onPick,
  initialSearch,
  limit,
}: {
  menu: RichTextInsertMenu;
  onPick: (item: RichTextInsertMenuItem) => void;
  /** What the search box holds as the menu opens, when it opens on a search. */
  initialSearch?: string;
  /** The most items listed at once, for a menu too long to draw whole. */
  limit?: number;
}) {
  const intl = useAppIntl();
  const groups = useMemo(() => groupsOf(menu.items), [menu.items]);
  const search = intl.formatMessage(messages.search);

  return (
    <Autocomplete.Root
      items={groups}
      inline
      open
      autoHighlight="always"
      {...(initialSearch !== undefined && { defaultValue: initialSearch })}
      {...(limit !== undefined && { limit })}
      itemToStringValue={(item: RichTextInsertMenuItem) =>
        [presentationalTextValue(item.label), item.description, item.group]
          .filter(Boolean)
          .join(' ')
      }
    >
      <div className="flex w-72 max-w-full flex-col gap-2">
        <Autocomplete.Input
          autoFocus
          // Opened on a search already typed, the caret goes after it, so
          // what is typed next goes on with the same word.
          {...(initialSearch !== undefined && {
            onFocus: (event: FocusEvent<HTMLInputElement>) => {
              // A frame on: the popover selects the text of the control it
              // hands focus to, after this.
              const input = event.currentTarget;
              requestAnimationFrame(() => {
                if (input.ownerDocument.activeElement !== input) return;
                const end = input.value.length;
                input.setSelectionRange(end, end);
              });
            },
          })}
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
          {(group: Group) => (
            <Autocomplete.Group
              key={group.value}
              items={group.items}
              className="block pb-2 last:pb-0"
            >
              {group.value !== '' && (
                <Autocomplete.GroupLabel className="px-2 py-1 text-xs font-semibold tracking-wide text-current/70 uppercase select-none">
                  {group.value}
                </Autocomplete.GroupLabel>
              )}
              <Autocomplete.Collection>
                {(item: RichTextInsertMenuItem) => (
                  <Autocomplete.Item
                    key={item.id}
                    value={item}
                    data-insert-item={item.id}
                    disabled={item.disabled}
                    onClick={() => {
                      if (item.disabled !== true) onPick(item);
                    }}
                    className={cx(
                      'flex cursor-default flex-col rounded-sm px-2 py-1.5 text-sm select-none',
                      'not-data-disabled:data-highlighted:bg-primary not-data-disabled:data-highlighted:text-primary-contrast',
                      'data-disabled:cursor-not-allowed',
                    )}
                  >
                    <span
                      {...presentationalTextProps(item.label)}
                      className={cx(
                        'font-semibold in-data-disabled:opacity-60',
                        // A name in its own direction stays on the
                        // interface's side.
                        typeof item.label !== 'string' && 'text-match-parent',
                      )}
                    >
                      {presentationalTextValue(item.label)}
                    </span>
                    {item.description !== undefined && (
                      <span className="text-xs opacity-80">
                        {item.description}
                      </span>
                    )}
                  </Autocomplete.Item>
                )}
              </Autocomplete.Collection>
            </Autocomplete.Group>
          )}
        </Autocomplete.List>
      </div>
    </Autocomplete.Root>
  );
}
