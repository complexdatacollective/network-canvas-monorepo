import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ScrollSignalProgress } from '../ScrollSignalProgress';

describe('ScrollSignalProgress', () => {
  it('positions the progress head from the start edge, not from the left', () => {
    const { container } = render(<ScrollSignalProgress />);
    const spans = container.querySelectorAll('span');
    const head = spans.item(spans.length - 1);

    expect(head.getAttribute('style')).toContain('inset-inline-start: 0%');
    expect(head.style.left).toBe('');
  });
});
