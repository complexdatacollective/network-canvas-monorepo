import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { trimTextContent } from './textLabel';

describe('trimTextContent', () => {
  it('wraps a string in a cap-trimmed span', () => {
    const { container } = render(<>{trimTextContent('Add person')}</>);

    const span = container.querySelector('span');
    expect(span).toHaveClass('text-box-trim');
    expect(span).toHaveTextContent('Add person');
  });

  it('wraps mixed text and numbers, ignoring nothing-rendering children', () => {
    const { container } = render(
      <>{trimTextContent([null, 'Page ', 3, false, undefined])}</>,
    );

    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')).toHaveTextContent('Page 3');
  });

  it('returns content with its own markup untouched', () => {
    const content = (
      <>
        <svg data-testid="icon" />
        Add person
      </>
    );

    expect(trimTextContent(content)).toBe(content);
  });

  it('returns empty content untouched', () => {
    expect(trimTextContent(null)).toBeNull();
    expect(trimTextContent(undefined)).toBeUndefined();
    expect(trimTextContent(false)).toBe(false);
  });
});
