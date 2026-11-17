import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSONContent } from '@tiptap/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { withSafeTypingIntoRichText } from '../../../testing/withSafeTypingIntoRichText';
import {
  emojiMenuItems,
  suggestEmoji,
  typedEmojiName,
} from '../richText/emojiMenu';
import RichTextEditorField from '../RichTextEditor';

const EMPTY: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

function Host({
  emojiMenu,
  readOnly,
}: {
  emojiMenu?: boolean;
  readOnly?: boolean;
}) {
  const [value, setValue] = useState<JSONContent | undefined>(EMPTY);
  return (
    <RichTextEditorField
      id="note"
      name="note"
      aria-describedby="note-hint"
      aria-label="Note"
      singleLine
      changeMode="input"
      toolbarOptions={{ bold: false, italic: false, history: false }}
      {...(emojiMenu !== undefined && { emojiMenu })}
      {...(readOnly !== undefined && { readOnly })}
      value={value}
      onChange={setValue}
    />
  );
}

const SMILE = { emoji: '😄', names: ['smile'], tags: ['happy', 'joy'] };
const SMIRK = { emoji: '😏', names: ['smirk'], tags: ['smug'] };
const CAT = { emoji: '😸', names: ['smile_cat'], tags: [] };
const SWEAT = { emoji: '😅', names: ['sweat_smile'], tags: ['hot'] };
const SUN = { emoji: '☀️', names: ['sunny'], tags: ['smiling'] };

describe('typedEmojiName', () => {
  it('finds a colon that opens a word, once two characters follow it, and on as more do', () => {
    expect(typedEmojiName(':sm')).toBe(':sm');
    expect(typedEmojiName('Thanks :smile_c')).toBe(':smile_c');
    expect(typedEmojiName('(:+1')).toBe(':+1');
  });

  it('finds nothing after one character, or once the name has ended', () => {
    expect(typedEmojiName(':s')).toBeUndefined();
    expect(typedEmojiName(':smile ')).toBeUndefined();
    expect(typedEmojiName(':smile:')).toBeUndefined();
  });

  it('finds nothing at a colon in a sentence or a time', () => {
    expect(typedEmojiName('Note: an')).toBeUndefined();
    expect(typedEmojiName('Note:an')).toBeUndefined();
    expect(typedEmojiName('10:30')).toBeUndefined();
    expect(typedEmojiName('at 10:ab')).toBeUndefined();
  });
});

describe('suggestEmoji', () => {
  const all = [SUN, SWEAT, CAT, SMIRK, SMILE];

  it('puts names that begin with what was typed first, then names that hold it, then tags', () => {
    expect(suggestEmoji(all, 'smi').map((each) => each.emoji)).toEqual([
      '😸',
      '😏',
      '😄',
      '😅',
      '☀️',
    ]);
  });

  it('matches whatever case was typed, and stops at its limit', () => {
    expect(suggestEmoji(all, 'SMI', 2).map((each) => each.emoji)).toEqual([
      '😸',
      '😏',
    ]);
  });

  it('suggests nothing for nothing typed, or for what no emoji is called', () => {
    expect(suggestEmoji(all, '')).toEqual([]);
    expect(suggestEmoji(all, 'zzz')).toEqual([]);
  });
});

describe('emojiMenuItems', () => {
  it('names an emoji by its shortcode, searched by its other names and tags, and inserts the character', () => {
    expect(
      emojiMenuItems([
        { emoji: '👍', names: ['+1', 'thumbsup'], tags: ['approve', 'ok'] },
      ]),
    ).toEqual([
      {
        id: '👍',
        label: '👍 :+1:',
        description: ':thumbsup: approve ok',
        content: { type: 'text', text: '👍' },
      },
    ]);
  });
});

describe('emoji suggested as a name is typed in a RichTextEditorField', () => {
  const suggestionsShown = () =>
    screen.findByRole('listbox', { name: 'Emoji suggestions' });

  it('suggests emoji beside the caret, with the keyboard left in the text', async () => {
    const user = withSafeTypingIntoRichText(userEvent.setup());
    render(<Host />);
    const editor = await screen.findByRole('textbox', { name: 'Note' });

    await user.click(editor);
    await user.keyboard('Hi :rocke');
    const list = await suggestionsShown();

    expect(editor).toHaveFocus();
    // Each is the emoji and the name to type for it; no search box, and
    // nothing grouping them.
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(within(list).queryByRole('group')).toBeNull();
    const [first] = within(list).getAllByRole('option');
    expect(first).toHaveTextContent('🚀:rocket:');
    expect(first).toHaveAttribute('aria-selected', 'true');
  });

  it('narrows as more of the name is typed, and Enter takes the one highlighted', async () => {
    const user = withSafeTypingIntoRichText(userEvent.setup());
    render(<Host />);
    const editor = await screen.findByRole('textbox', { name: 'Note' });

    await user.click(editor);
    await user.keyboard('Hi :ho');
    const list = await suggestionsShown();
    const before = within(list).getAllByRole('option').length;
    await user.keyboard('spital');
    await waitFor(() =>
      expect(within(list).getAllByRole('option').length).toBeLessThan(before),
    );
    await user.keyboard('{Enter}');

    await waitFor(() => expect(editor.textContent).toBe('Hi 🏥'));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(editor).toHaveFocus();
  });

  it('moves through the list with the arrow keys, and Tab takes one too', async () => {
    const user = withSafeTypingIntoRichText(userEvent.setup());
    render(<Host />);
    const editor = await screen.findByRole('textbox', { name: 'Note' });

    await user.click(editor);
    await user.keyboard(':roc');
    const list = await suggestionsShown();
    const options = within(list).getAllByRole('option');
    await user.keyboard('{ArrowDown}');
    await waitFor(() =>
      expect(options[1]).toHaveAttribute('aria-selected', 'true'),
    );
    await user.keyboard('{ArrowUp}{ArrowUp}');
    await waitFor(() =>
      expect(options.at(-1)).toHaveAttribute('aria-selected', 'true'),
    );
    const second = options.at(-1)?.textContent ?? '';
    await user.keyboard('{Tab}');

    await waitFor(() =>
      expect(second.startsWith(editor.textContent ?? '-')).toBe(true),
    );
    expect(editor.textContent).not.toContain(':roc');
  });

  it('takes the one clicked, without the caret leaving the text', async () => {
    const user = withSafeTypingIntoRichText(userEvent.setup());
    render(<Host />);
    const editor = await screen.findByRole('textbox', { name: 'Note' });

    await user.click(editor);
    await user.keyboard(':rocket');
    const list = await suggestionsShown();
    await user.click(within(list).getAllByRole('option')[0] ?? list);

    await waitFor(() => expect(editor.textContent).toBe('🚀'));
    expect(editor).toHaveFocus();
  });

  // A field can go read-only under the list — while its form submits, say.
  // A command would change the text all the same, so the list goes with it.
  it('is withdrawn when the field becomes read-only, and changes nothing', async () => {
    const user = withSafeTypingIntoRichText(userEvent.setup());
    const { rerender } = render(<Host />);
    const editor = await screen.findByRole('textbox', { name: 'Note' });

    await user.click(editor);
    await user.keyboard(':rocke');
    await suggestionsShown();
    rerender(<Host readOnly />);

    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(editor.textContent).toBe(':rocke');
  });

  it('is put away by Escape, keeping what was typed, and stays away for that name', async () => {
    const user = withSafeTypingIntoRichText(userEvent.setup());
    render(<Host />);
    const editor = await screen.findByRole('textbox', { name: 'Note' });

    await user.click(editor);
    await user.keyboard(':ro');
    await suggestionsShown();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    await user.keyboard('ck');

    expect(editor.textContent).toBe(':rock');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(editor).toHaveFocus();
  });

  // The Escape that puts the list away is spent on it: a dialog around the
  // field must not also take it as a request to close.
  it('keeps the Escape that dismisses it from whatever is around the field', async () => {
    const user = withSafeTypingIntoRichText(userEvent.setup());
    const escapes: string[] = [];
    render(
      // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- stands in for a dialog that closes on Escape
      <div
        onKeyDown={(event) => {
          if (event.key === 'Escape') escapes.push('seen');
        }}
      >
        <Host />
      </div>,
    );
    const editor = await screen.findByRole('textbox', { name: 'Note' });
    await user.click(editor);
    await user.keyboard(':rocket');
    await screen.findByRole('listbox');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(escapes).toEqual([]);

    // With nothing to dismiss, Escape is the surrounding dialog's again.
    await user.keyboard('{Escape}');
    expect(escapes).toEqual(['seen']);
  });

  it('goes once the name is ended, and leaves Enter to the text when nothing matches', async () => {
    const user = withSafeTypingIntoRichText(userEvent.setup());
    render(<Host />);
    const editor = await screen.findByRole('textbox', { name: 'Note' });

    await user.click(editor);
    await user.keyboard(':ro');
    await suggestionsShown();
    await user.keyboard(' ');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    await user.keyboard(':zzzz');
    expect(screen.queryByRole('listbox')).toBeNull();

    expect(editor.textContent).toBe(':ro :zzzz');
  });

  it('does not open at a colon in a sentence', async () => {
    const user = withSafeTypingIntoRichText(userEvent.setup());
    render(<Host />);
    const editor = await screen.findByRole('textbox', { name: 'Note' });

    await user.click(editor);
    await user.keyboard('Note: and 10:30');

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(editor.textContent).toBe('Note: and 10:30');
  });

  it('is left out of a field that turns emoji off', async () => {
    const user = withSafeTypingIntoRichText(userEvent.setup());
    render(<Host emojiMenu={false} />);
    const editor = await screen.findByRole('textbox', { name: 'Note' });

    expect(screen.queryByRole('button', { name: 'Insert emoji' })).toBeNull();
    await user.click(editor);
    await user.keyboard(':rocket');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('the emoji menu in the toolbar', () => {
  it('inserts the emoji picked from it as text', async () => {
    const user = withSafeTypingIntoRichText(userEvent.setup());
    render(<Host />);
    const editor = await screen.findByRole('textbox', { name: 'Note' });

    await user.click(editor);
    await user.click(screen.getByRole('button', { name: 'Insert emoji' }));
    const search = await screen.findByRole('combobox', { name: 'Search' });
    await user.type(search, 'hospital');
    await user.click(await screen.findByRole('option', { name: /🏥/ }));

    await waitFor(() => expect(editor).toHaveTextContent('🏥'));
    // The character itself, not an element standing for it.
    expect(editor.querySelector('[data-token], img')).toBeNull();
    await waitFor(() => expect(editor).toHaveFocus());
  });
});

// A version's own editor uses the arrow keys to move between rows and Escape
// to fold the element. While emoji are being suggested there, those keys are
// the list's.
describe('emoji suggestions inside a version', () => {
  function VersionsHost() {
    const [value, setValue] = useState<JSONContent | undefined>({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello' },
            {
              type: 'versions',
              attrs: {
                label: 'Depending on the name',
                versions: [
                  { key: 'known', label: 'If known', content: [] },
                  { key: 'missing', label: 'If not known', content: [] },
                ],
              },
            },
          ],
        },
      ],
    });
    return (
      <RichTextEditorField
        id="note"
        name="note"
        aria-describedby="note-hint"
        aria-label="Note"
        singleLine
        versions
        changeMode="input"
        value={value}
        onChange={setValue}
      />
    );
  }

  const openFirstVersion = async (user: ReturnType<typeof userEvent.setup>) => {
    await screen.findByRole('textbox', { name: 'Note' });
    await user.click(
      await screen.findByRole('button', { name: 'Depending on the name' }),
    );
    const version = await screen.findByRole('textbox', { name: 'If known' });
    await user.click(version);
    await user.keyboard(':roc');
    return { version, list: await screen.findByRole('listbox') };
  };

  it('moves through the list with the arrow keys, not on to the next version', async () => {
    const user = withSafeTypingIntoRichText(userEvent.setup());
    render(<VersionsHost />);
    const { version, list } = await openFirstVersion(user);

    const options = within(list).getAllByRole('option');
    expect(options.length).toBeGreaterThan(1);
    await user.keyboard('{ArrowDown}');
    await waitFor(() =>
      expect(options[1]).toHaveAttribute('aria-selected', 'true'),
    );
    expect(version).toHaveFocus();

    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(version.textContent).not.toContain(':roc');
    expect(version.textContent).not.toBe('');
  });

  it('is put away by Escape, which leaves the version open', async () => {
    const user = withSafeTypingIntoRichText(userEvent.setup());
    render(<VersionsHost />);
    const { version } = await openFirstVersion(user);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(version).toHaveFocus();
    expect(version).toHaveTextContent(':roc');
  });
});
