import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ResizableFlexPanel } from '../ResizableFlexPanel';

describe('ResizableFlexPanel', () => {
  it.each(['horizontal', 'vertical'] as const)(
    'stretches its panes and handle across the %s cross axis',
    (orientation) => {
      render(
        <ResizableFlexPanel
          storageKey={`cross-axis-${orientation}`}
          orientation={orientation}
          className="items-start"
        >
          <div>First pane</div>
          <div>Second pane</div>
        </ResizableFlexPanel>,
      );

      expect(screen.getByText('First pane').parentElement).toHaveClass(
        'self-stretch',
      );
      expect(screen.getByText('Second pane').parentElement).toHaveClass(
        'self-stretch',
      );
      expect(screen.getByRole('slider')).toHaveClass('self-stretch');
    },
  );

  it.each([
    {
      orientation: 'horizontal' as const,
      handleClasses: ['sticky', 'top-1/2', '-translate-y-1/2'],
    },
    {
      orientation: 'vertical' as const,
      handleClasses: ['sticky', 'left-1/2', '-translate-x-1/2'],
    },
  ])(
    'keeps the $orientation grip centred in its scroll viewport',
    ({ orientation, handleClasses }) => {
      render(
        <ResizableFlexPanel
          storageKey={`sticky-handle-${orientation}`}
          orientation={orientation}
          stickyHandle
        >
          <div>First pane</div>
          <div>Second pane</div>
        </ResizableFlexPanel>,
      );

      const handle = screen.getByRole('slider');
      const grip = handle.firstElementChild;
      expect(handle).toHaveClass(...handleClasses);
      expect(handle).not.toHaveClass('self-stretch');
      expect(grip).not.toHaveClass('sticky');
    },
  );
});
