import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Dialog from '../Dialog';
import type { DialogSize } from '../DialogPopup';

const expectedSizeClass: Record<DialogSize, string> = {
  readable: 'max-w-2xl',
  editor: 'max-w-4xl',
  workspace: 'max-w-7xl',
  fullscreen: 'max-w-[100rem]',
};

describe('Dialog sizing', () => {
  it.each(Object.entries(expectedSizeClass))(
    'renders the %s semantic size',
    (size, className) => {
      render(
        <Dialog
          open
          title="Dialog title"
          size={size as DialogSize}
          closeDialog={vi.fn()}
        />,
      );

      expect(screen.getByRole('dialog')).toHaveClass(
        'w-full',
        'min-w-0',
        className,
      );
    },
  );

  it('caps generated descriptions at a readable measure', () => {
    render(
      <Dialog
        open
        title="Dialog title"
        description="A generated description"
        closeDialog={vi.fn()}
      />,
    );

    expect(screen.getByText('A generated description')).toHaveClass(
      'max-w-[75ch]',
    );
  });

  it('allows className to override the semantic width', () => {
    render(
      <Dialog
        open
        title="Dialog title"
        size="editor"
        className="max-w-5xl"
        closeDialog={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog')).toHaveClass('max-w-5xl');
    expect(screen.getByRole('dialog')).not.toHaveClass('max-w-4xl');
  });
});
