import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ItemPreview from '../ItemPreview';

describe('ItemPreview', () => {
  it('shows markdown link text without rendering an interactive anchor', () => {
    const { container } = render(
      <ItemPreview.WrappedComponent content="Read [the guide](https://example.com)." />,
    );

    expect(container.textContent).toContain('the guide');
    expect(container.querySelector('a')).toBeNull();
  });
});
