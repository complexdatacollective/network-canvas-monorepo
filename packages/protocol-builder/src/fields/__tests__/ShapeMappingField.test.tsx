import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DOCS_BASE_URL } from '../../interfaces/documentation.ts';
import ShapeMappingField from '../ShapeMappingField.tsx';

describe('ShapeMappingField', () => {
  // The hint is text the application wrote, so its link to the
  // documentation is drawn as a link, though a hint from the protocol shows
  // none.
  it('links its hint to the documentation on custom shapes', () => {
    render(
      <ShapeMappingField
        name="shapes"
        label="Shape for each value"
        answers={[{ value: 'a', label: 'A' }]}
        shapeFor={() => undefined}
        onShapeChange={() => undefined}
      />,
    );

    expect(
      screen.getByRole('link', { name: 'Learn about custom shapes' }),
    ).toHaveAttribute(
      'href',
      `${DOCS_BASE_URL}/design-protocols/tutorials/custom-node-shapes`,
    );
  });
});
