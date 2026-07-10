import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Dialog from '../Dialog';
import type { DialogSize } from '../DialogPopup';

const expectedSizeClass: Record<DialogSize, string> = {
  readable: 'max-w-2xl',
  editor: 'max-w-4xl',
  workspace: 'max-w-7xl',
  fullscreen: 'max-w-[100rem]',
};

describe('Dialog', () => {
  it.each(Object.entries(expectedSizeClass))(
    'applies the %s semantic size',
    (size, expectedClass) => {
      render(
        <Dialog open title="Test dialog" size={size as DialogSize}>
          Content
        </Dialog>,
      );

      expect(screen.getByRole('dialog')).toHaveClass(expectedClass);
      expect(screen.getByRole('dialog')).toHaveClass('w-full', 'min-w-0');
    },
  );

  it('defaults to the readable size', () => {
    render(
      <Dialog open title="Test dialog">
        Content
      </Dialog>,
    );

    expect(screen.getByRole('dialog')).toHaveClass('max-w-2xl');
  });

  it('caps generated descriptions at a readable line length', () => {
    render(
      <Dialog open title="Test dialog" description="A long description" />,
    );

    expect(screen.getByText('A long description')).toHaveClass('max-w-[75ch]');
  });

  it('lets className override a semantic size', () => {
    render(
      <Dialog open title="Test dialog" size="editor" className="max-w-5xl">
        Content
      </Dialog>,
    );

    expect(screen.getByRole('dialog')).toHaveClass('max-w-5xl');
    expect(screen.getByRole('dialog')).not.toHaveClass('max-w-4xl');
  });
});
