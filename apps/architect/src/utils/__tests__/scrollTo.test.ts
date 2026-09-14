import { describe, expect, it, vi } from 'vitest';

import { NAV_HEIGHT_VARIABLE } from '../navHeight';
import scrollTo from '../scrollTo';

const targetIn = (document_: Document) => {
  const element = document_.createElement('div');
  element.scrollIntoView = vi.fn();
  document_.body.append(element);
  return element;
};

/**
 * Arriving at something the researcher was sent to — a control an issue names,
 * a section chosen from the list.
 *
 * The navigation bar is sticky and paints above the page, so a target brought
 * flush to the top of the scroller arrives underneath it. The offset that
 * keeps it clear used to be a hard-coded 200px, which was a guess at a bar
 * that has no fixed height.
 */
describe('scrolling something into view', () => {
  it('lands the target below the navigation bar, measured from the bar itself', () => {
    const target = targetIn(document);

    scrollTo(target);

    const offset = target.style.scrollMarginTop;
    expect(offset).toContain(`var(${NAV_HEIGHT_VARIABLE})`);
    // Clear of the bar AND not flush against it: the offset is the bar's
    // height plus a gap, so what the researcher arrives at reads as being on
    // the page rather than tucked under the chrome.
    expect(offset).toMatch(/^calc\(/);
    expect(target.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
  });

  it('gives the caller’s own offset back on the next frame', async () => {
    const target = targetIn(document);
    target.style.scrollMarginTop = '4rem';

    scrollTo(target);
    expect(target.style.scrollMarginTop).not.toBe('4rem');

    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(target.style.scrollMarginTop).toBe('4rem');
  });
});
