import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Breadcrumb from '../ProjectNav/Breadcrumb';

// #1397 AC3. `truncate` clips the LOGICAL end of a string. Under the app's LTR
// base direction, bidi reordering puts the logical START of an RTL name at the
// visual right, so the 320px slice on screen came from the MIDDLE of the name
// with the ellipsis on the wrong side (measured: scrollWidth 2048 in a 320px
// box, `direction: ltr`, all 342 characters in the DOM). `dir="auto"` is what
// makes an RTL name truncate from its own end.
const ARABIC = 'مشروع بحث الشبكات الاجتماعية الحضرية والريفية';

describe('Breadcrumb', () => {
  it('gives a static label its own base direction and the full value on hover', () => {
    render(<Breadcrumb items={[{ label: ARABIC }]} />);

    const label = screen.getByText(ARABIC);
    expect(label).toHaveAttribute('dir', 'auto');
    expect(label).toHaveAttribute('title', ARABIC);
    expect(label).toHaveClass('truncate');
  });

  it('gives a clickable label the same treatment', () => {
    render(<Breadcrumb items={[{ label: ARABIC, onClick: vi.fn() }]} />);

    const label = screen.getByRole('button', { name: ARABIC });
    expect(label).toHaveAttribute('dir', 'auto');
    expect(label).toHaveAttribute('title', ARABIC);
    expect(label).toHaveClass('truncate');
  });
});
