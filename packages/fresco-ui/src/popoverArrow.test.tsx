import { DirectionProvider } from '@base-ui/react/direction-provider';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { type PopupSide, usePhysicalSide } from './popoverArrow';

function ResolvedSide({ side }: { side: PopupSide }) {
  return <output>{usePhysicalSide(side)}</output>;
}

afterEach(cleanup);

describe('usePhysicalSide', () => {
  // A popup at the end of the line opens on the right of left-to-right text
  // and on the left of right-to-left text, so it is always beside the text.
  it.each([
    ['ltr', 'inline-start', 'left'],
    ['ltr', 'inline-end', 'right'],
    ['rtl', 'inline-start', 'right'],
    ['rtl', 'inline-end', 'left'],
    ['rtl', 'left', 'left'],
    ['rtl', 'right', 'right'],
    ['rtl', 'top', 'top'],
  ] as const)('in %s, %s opens on the %s', (direction, side, physical) => {
    render(
      <DirectionProvider direction={direction}>
        <ResolvedSide side={side} />
      </DirectionProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(physical);
  });
});
