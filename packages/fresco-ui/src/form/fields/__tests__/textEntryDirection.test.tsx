import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { textEntryDirection } from '../../textEntryDirection';
import InputField from '../InputField';
import PasswordField from '../PasswordField';
import RichTextEditorField from '../RichTextEditor';
import TextAreaField from '../TextArea';

const OWN = { dir: undefined, className: 'text-own-direction' };
const LEFT_TO_RIGHT = { dir: 'ltr', className: 'text-match-parent' };
const BROWSER = { dir: undefined, className: undefined };

describe('textEntryDirection', () => {
  it.each([
    ['a text area or an editor', {}, OWN],
    ['text', { type: 'text' }, OWN],
    ['search', { type: 'search' }, OWN],
    ['email', { type: 'email' }, LEFT_TO_RIGHT],
    ['number', { type: 'number' }, LEFT_TO_RIGHT],
    ['password', { type: 'password' }, LEFT_TO_RIGHT],
    ['tel', { type: 'tel' }, LEFT_TO_RIGHT],
    ['url', { type: 'url' }, LEFT_TO_RIGHT],
    [
      'text declared numeric',
      { type: 'text', inputMode: 'numeric' },
      LEFT_TO_RIGHT,
    ],
    [
      'text declared decimal',
      { type: 'text', inputMode: 'decimal' },
      LEFT_TO_RIGHT,
    ],
    [
      'text declared a phone number',
      { type: 'text', inputMode: 'tel' },
      LEFT_TO_RIGHT,
    ],
    ['text declared text', { type: 'text', inputMode: 'text' }, OWN],
    ['date', { type: 'date' }, BROWSER],
    ['time', { type: 'time' }, BROWSER],
    [
      'a known direction on text',
      { type: 'text', dir: 'rtl' },
      { dir: 'rtl', className: undefined },
    ],
    [
      'a known direction on a number',
      { type: 'number', dir: 'rtl' },
      { dir: 'rtl', className: undefined },
    ],
  ] as const)('%s', (_label, entry, expected) => {
    expect(textEntryDirection(entry)).toEqual(expected);
  });
});

describe('the fields lay out what is typed', () => {
  it('reads a text field’s text in its own direction', () => {
    render(<InputField aria-label="Name" />);
    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input).toHaveClass('text-own-direction');
    expect(input).not.toHaveAttribute('dir');
  });

  it.each(['email', 'tel', 'url', 'number'])(
    'fixes a %s field left to right, on the interface’s side',
    (type) => {
      const { container } = render(
        <InputField type={type} aria-label="Value" />,
      );
      const input = container.querySelector('input');
      expect(input).toHaveAttribute('dir', 'ltr');
      expect(input).toHaveClass('text-match-parent');
      expect(input).not.toHaveClass('text-own-direction');
    },
  );

  it('leaves a date field to the browser', () => {
    const { container } = render(<InputField type="date" aria-label="When" />);
    const input = container.querySelector('input');
    expect(input).not.toHaveAttribute('dir');
    expect(input).not.toHaveClass('text-own-direction');
  });

  it('keeps a direction the caller knows', () => {
    render(<InputField aria-label="Arabic name" dir="rtl" />);
    const input = screen.getByRole('textbox', { name: 'Arabic name' });
    expect(input).toHaveAttribute('dir', 'rtl');
    expect(input).not.toHaveClass('text-own-direction');
  });

  it('keeps a password left to right when it is revealed as text', async () => {
    const { container } = render(
      <PasswordField aria-label="Password" value="abc" onChange={() => {}} />,
    );
    const input = () => container.querySelector('input');
    expect(input()).toHaveAttribute('type', 'password');
    expect(input()).toHaveAttribute('dir', 'ltr');

    await userEvent.click(screen.getByRole('button'));

    expect(input()).toHaveAttribute('type', 'text');
    expect(input()).toHaveAttribute('dir', 'ltr');
    expect(input()).not.toHaveClass('text-own-direction');
  });

  it('reads a text area’s lines in their own direction', () => {
    render(<TextAreaField aria-label="Notes" />);
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveClass(
      'text-own-direction',
    );
  });

  it('reads each of an editor’s paragraphs in its own direction', () => {
    render(<RichTextEditorField name="prompt" aria-label="Prompt" />);
    const editor = screen.getByRole('textbox', { name: 'Prompt' });
    expect(editor).toHaveClass(
      '[&_:is(p,h1,h2,h3,h4,h5,h6)]:text-own-direction',
    );
    expect(editor).not.toHaveAttribute('dir');
  });

  it('gives an editor the direction the caller knows', () => {
    render(<RichTextEditorField name="prompt" aria-label="Prompt" dir="rtl" />);
    const editor = screen.getByRole('textbox', { name: 'Prompt' });
    expect(editor).toHaveAttribute('dir', 'rtl');
    expect(editor).not.toHaveClass(
      '[&_:is(p,h1,h2,h3,h4,h5,h6)]:text-own-direction',
    );
  });
});
