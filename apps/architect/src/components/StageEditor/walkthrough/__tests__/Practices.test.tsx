import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Practices from '../Practices';

describe('Practices', () => {
  // A practice is the walkthrough's own text, which links to the
  // documentation and may link to a page of Architect itself.
  it.each([
    [
      'the documentation',
      'https://documentation.networkcanvas.com/design-protocols/key-concepts/input-controls',
    ],
    ['a page of Architect', '/protocol'],
  ])('keeps a link to %s', (_where, address) => {
    render(
      <Practices
        items={[
          {
            kind: 'avoid',
            text: `Collect it with a toggle [input control](${address}) instead.`,
          },
        ]}
      />,
    );

    expect(screen.getByRole('link', { name: 'input control' })).toHaveAttribute(
      'href',
      address,
    );
  });
});
