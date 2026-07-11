import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import RichTextEditorField from '../RichTextEditor';

const documentWithText = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Existing content' }],
    },
  ],
};

describe('RichTextEditorField', () => {
  it('clears editor content when its controlled value becomes undefined', async () => {
    const { rerender } = render(
      <RichTextEditorField
        id="bio"
        name="bio"
        aria-describedby="bio-hint"
        aria-label="Biography"
        value={documentWithText}
        onChange={() => undefined}
      />,
    );

    const editor = await screen.findByRole('textbox', { name: 'Biography' });
    expect(editor).toHaveTextContent('Existing content');

    rerender(
      <RichTextEditorField
        id="bio"
        name="bio"
        aria-describedby="bio-hint"
        aria-label="Biography"
        value={undefined}
        onChange={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(editor).not.toHaveTextContent('Existing content');
    });
  });

  it('uses the visible field label and disables every editing control when readonly', async () => {
    render(
      <>
        <span id="bio-label">Biography</span>
        <span id="bio-hint">Tell us about yourself</span>
        <RichTextEditorField
          id="bio"
          name="bio"
          aria-labelledby="bio-label"
          aria-describedby="bio-hint"
          value={documentWithText}
          onChange={() => undefined}
          readOnly
        />
      </>,
    );

    const editor = await screen.findByRole('textbox', { name: 'Biography' });
    expect(editor).toHaveAccessibleDescription('Tell us about yourself');
    expect(editor).toHaveAttribute('aria-readonly', 'true');
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Italic' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('forwards container class, focus, and blur callbacks', async () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    const { container } = render(
      <RichTextEditorField
        id="bio"
        name="bio"
        aria-describedby="bio-description"
        aria-label="Biography"
        className="max-w-full"
        value={documentWithText}
        onChange={() => undefined}
        onFocus={onFocus}
        onBlur={onBlur}
      />,
    );

    const editor = await screen.findByRole('textbox', { name: 'Biography' });
    expect(container.querySelector('.max-w-full')).toBeInTheDocument();

    fireEvent.focus(editor);
    fireEvent.blur(editor, { relatedTarget: null });
    expect(onFocus).toHaveBeenCalled();
    expect(onBlur).toHaveBeenCalled();
  });
});
