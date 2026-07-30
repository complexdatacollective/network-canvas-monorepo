import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BaseField } from '../BaseField';

describe('BaseField', () => {
  it('keeps the query container off the element with sibling-dependent spacing', () => {
    const { container } = render(
      <BaseField id="field" name="component" label="Input control">
        <select name="component" aria-labelledby="field-label" />
      </BaseField>,
    );

    const spacingElement = container.querySelector('.not-last\\:mb-8');
    expect(spacingElement).not.toBeNull();
    expect(spacingElement?.classList.contains('@container')).toBe(false);

    const queryContainer = container.querySelector('.\\@container');
    expect(queryContainer).not.toBeNull();
    expect(queryContainer?.contains(container.querySelector('select'))).toBe(
      true,
    );
  });
});
