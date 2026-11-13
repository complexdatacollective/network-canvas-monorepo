import { DirectionProvider } from '@base-ui/react/direction-provider';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import FancyHeading from '../FancyHeading';

function units(direction: 'ltr' | 'rtl', text: string) {
  const { container } = render(
    <DirectionProvider direction={direction}>
      <FancyHeading level="h1">{text}</FancyHeading>
    </DirectionProvider>,
  );
  return [...container.querySelectorAll('h1 > span')].map((span) =>
    (span.textContent ?? '').replaceAll(' ', ' ').trim(),
  );
}

describe('FancyHeading', () => {
  it('animates a Latin name inside a right-to-left heading as one unit', () => {
    expect(units('rtl', 'حول Network Canvas')).toEqual([
      'حول',
      'Network Canvas',
    ]);
  });

  it('still animates a left-to-right heading word by word', () => {
    expect(units('ltr', 'About Network Canvas')).toEqual([
      'About',
      'Network',
      'Canvas',
    ]);
  });
});
