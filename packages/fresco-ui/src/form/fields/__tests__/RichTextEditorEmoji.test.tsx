import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSONContent } from '@tiptap/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { withSafeTypingIntoRichText } from '../../../testing/withSafeTypingIntoRichText';
import { emojiMenuItems, typedEmojiSearch } from '../richText/emojiMenu';
import RichTextEditorField from '../RichTextEditor';

const EMPTY: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

function Host({ emojiMenu }: { emojiMenu?: boolean }) {
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
      value={value}
      onChange={setValue}
    />
  );
}

describe('typedEmojiSearch', () => {
  it('finds a colon that opens a word, once two letters follow it', () => {
    expect(typedEmojiSearch(':sm')).toBe(':sm');
    expect(typedEmojiSearch('Thanks :he')).toBe(':he');
    expect(typedEmojiSearch('(:th')).toBe(':th');
  });

  it('finds nothing after one letter, or after a third', () => {
    expect(typedEmojiSearch(':s')).toBeUndefined();
    expect(typedEmojiSearch(':smi')).toBeUndefined();
  });

  it('finds nothing at a colon in a sentence or a time', () => {
    expect(typedEmojiSearch('Note: an')).toBeUndefined();
    expect(typedEmojiSearch('Note:an')).toBeUndefined();
    expect(typedEmojiSearch('10:30')).toBeUndefined();
    expect(typedEmojiSearch('at 10:ab')).toBeUndefined();
  });
});

describe('emojiMenuItems', () => {
  it('names an emoji by what it shows, searched by its names and tags, and inserts the character', () => {
    expect(
      emojiMenuItems([
        {
          emoji: '😄',
          names: ['smile'],
          tags: ['happy', 'smile'],
          description: 'grinning face with smiling eyes',
          category: 'Smileys & Emotion',
        },
      ]),
    ).toEqual([
      {
        id: '😄',
        label: '😄 grinning face with smiling eyes',
        group: 'Smileys & Emotion',
        description: ':smile: happy',
        content: { type: 'text', text: '😄' },
      },
    ]);
  });
});

describe('the emoji menu of a RichTextEditorField', () => {
  it('inserts the emoji picked from the toolbar as text', async () => {
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

  it('opens searching for what was typed after a colon, and replaces it with the pick', async () => {
    const user = withSafeTypingIntoRichText(userEvent.setup());
    render(<Host />);
    const editor = await screen.findByRole('textbox', { name: 'Note' });

    await user.click(editor);
    await user.keyboard('Hi :ro');
    const search = await screen.findByRole('combobox', { name: 'Search' });
    expect(search).toHaveValue('ro');
    await waitFor(() => expect(search).toHaveFocus());
    await user.keyboard('cket');
    await user.click(await screen.findByRole('option', { name: /🚀/ }));

    await waitFor(() => expect(editor.textContent).toBe('Hi 🚀'));
  });

  it('keeps what was typed when the menu is dismissed', async () => {
    const user = withSafeTypingIntoRichText(userEvent.setup());
    render(<Host />);
    const editor = await screen.findByRole('textbox', { name: 'Note' });

    await user.click(editor);
    await user.keyboard(':ro');
    const search = await screen.findByRole('combobox', { name: 'Search' });
    await waitFor(() => expect(search).toHaveFocus());
    await user.keyboard('{Escape}');

    await waitFor(() => expect(editor).toHaveFocus());
    expect(editor.textContent).toBe(':ro');
  });

  it('does not open at a colon in a sentence', async () => {
    const user = withSafeTypingIntoRichText(userEvent.setup());
    render(<Host />);
    const editor = await screen.findByRole('textbox', { name: 'Note' });

    await user.click(editor);
    await user.keyboard('Note: and 10:30');

    expect(screen.queryByRole('combobox', { name: 'Search' })).toBeNull();
    expect(editor.textContent).toBe('Note: and 10:30');
  });

  it('is left out of a field that turns it off', async () => {
    const user = withSafeTypingIntoRichText(userEvent.setup());
    render(<Host emojiMenu={false} />);
    const editor = await screen.findByRole('textbox', { name: 'Note' });

    expect(screen.queryByRole('button', { name: 'Insert emoji' })).toBeNull();
    await user.click(editor);
    await user.keyboard(':ro');
    expect(screen.queryByRole('combobox', { name: 'Search' })).toBeNull();
  });
});
