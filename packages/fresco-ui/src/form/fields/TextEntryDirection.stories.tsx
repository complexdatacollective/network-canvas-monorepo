import type { Meta, StoryObj } from '@storybook/react-vite';
import type { JSONContent } from '@tiptap/react';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import Paragraph from '../../typography/Paragraph';
import InputField from './InputField';
import RichTextEditorField from './RichTextEditor';
import TextAreaField from './TextArea';

/**
 * What a person types is laid out in its own direction, whatever the
 * interface's (`textEntryDirection`): a Latin name typed in a right-to-left
 * interface keeps its punctuation at its end, and so does Arabic typed in a
 * left-to-right one. A value written left to right in every language (a phone
 * number) stays left to right.
 */
const meta: Meta = {
  title: 'Systems/Form/Typed text direction',
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj;

const paragraphs = (...lines: string[]): JSONContent => ({
  type: 'doc',
  content: lines.map((text) => ({
    type: 'paragraph',
    content: [{ type: 'text', text }],
  })),
});

function Fields({ typed }: { typed: string }) {
  const [text, setText] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  return (
    <div className="flex max-w-md flex-col gap-4">
      <Paragraph>{typed}</Paragraph>
      <InputField
        aria-label="Name"
        value={text}
        onChange={(value) => setText(value ?? '')}
      />
      <InputField
        aria-label="Phone"
        type="tel"
        value={phone}
        onChange={(value) => setPhone(value ?? '')}
      />
      <TextAreaField
        aria-label="Notes"
        value={notes}
        onChange={(value) => setNotes(value ?? '')}
      />
      <RichTextEditorField
        id="prompt"
        name="prompt"
        aria-label="Prompt"
        value={paragraphs('مرحبا بكم!', 'Hello, world!')}
      />
      {/* A browser starts a text box's text on its own side, even inside a
          centred block; the boxes keep that. */}
      <div className="text-center">
        <InputField aria-label="Centred block" defaultValue="centred?" />
      </div>
    </div>
  );
}

/** Where one character of a text node is drawn. */
const characterBox = (container: Element, text: string, character: string) => {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = node.nodeValue ?? '';
    if (!value.includes(text)) continue;
    const at = value.indexOf(text) + text.indexOf(character);
    const range = document.createRange();
    range.setStart(node, at);
    range.setEnd(node, at + 1);
    return range.getBoundingClientRect();
  }
  throw new Error(`No text "${text}" in the element`);
};

export const LatinInARightToLeftInterface: Story = {
  globals: { appDirection: 'rtl' },
  render: () => <Fields typed="Latin typed into a right-to-left interface" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(document.documentElement.dir).toBe('rtl');

    const name = canvas.getByRole('textbox', { name: 'Name' });
    await userEvent.type(name, 'team-b!');
    // A text box's lines take the direction of their first letter.
    await expect(getComputedStyle(name).unicodeBidi).toBe('plaintext');
    // …and start on the interface's side.
    await expect(getComputedStyle(name).textAlign).toBe('right');

    // A phone number is left to right whatever starts it.
    const phone = canvas.getByRole('textbox', { name: 'Phone' });
    await userEvent.type(phone, '+1 555-0100');
    await expect(getComputedStyle(phone).direction).toBe('ltr');
    await expect(getComputedStyle(phone).textAlign).toBe('right');

    const notes = canvas.getByRole('textbox', { name: 'Notes' });
    await expect(getComputedStyle(notes).unicodeBidi).toBe('plaintext');

    // The editor's Latin paragraph keeps its "!" at its end, on the right of
    // the last letter; laid out right to left it would be on the left of
    // "Hello". The Arabic paragraph still starts on the right.
    const prompt = canvas.getByRole('textbox', { name: 'Prompt' });
    await waitFor(() => expect(prompt.textContent).toContain('Hello, world!'));
    const bang = characterBox(prompt, 'Hello, world!', '!');
    const lastLetter = characterBox(prompt, 'Hello, world!', 'd');
    await expect(bang.left).toBeGreaterThanOrEqual(lastLetter.right - 1);
    const arabic = prompt.querySelector('p');
    await expect(arabic).not.toBeNull();
    await expect(getComputedStyle(arabic!).direction).toBe('rtl');
  },
};

export const ArabicInALeftToRightInterface: Story = {
  globals: { appDirection: 'ltr' },
  render: () => <Fields typed="Arabic typed into a left-to-right interface" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const prompt = canvas.getByRole('textbox', { name: 'Prompt' });
    await waitFor(() => expect(prompt.textContent).toContain('مرحبا بكم!'));
    await expect(
      getComputedStyle(canvas.getByRole('textbox', { name: 'Centred block' }))
        .textAlign,
    ).toBe('left');
    // The Arabic paragraph's "!" ends it, on the left of its first word.
    const bang = characterBox(prompt, 'مرحبا بكم!', '!');
    const firstLetter = characterBox(prompt, 'مرحبا بكم!', 'م');
    await expect(bang.right).toBeLessThanOrEqual(firstLetter.left + 1);
  },
};
