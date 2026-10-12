import { afterEach, describe, expect, it } from 'vitest';

import {
  measureHorizontalOverflow,
  measureRestingScrollWidth,
} from '../horizontalOverflow';

// jsdom has no layout, so each box's offset geometry is pinned by hand.
const box = (
  parent: HTMLElement,
  offsetLeft: number,
  offsetWidth: number,
  style = '',
) => {
  const child = document.createElement('div');
  child.setAttribute('style', style);
  Object.defineProperty(child, 'offsetLeft', { get: () => offsetLeft });
  Object.defineProperty(child, 'offsetWidth', { get: () => offsetWidth });
  parent.append(child);
  return child;
};

const lane = (style = 'padding: 0 5px') => {
  const element = document.createElement('div');
  element.setAttribute('style', style);
  document.body.append(element);
  return element;
};

afterEach(() => {
  document.body.replaceChildren();
});

describe('measureRestingScrollWidth', () => {
  it('spans the in-flow children and adds the inline padding', () => {
    const element = lane();
    box(element, 5, 248);
    box(element, 257, 152);

    // 5 → 409 is 404 wide, plus 5px of padding on each side.
    expect(measureRestingScrollWidth(element)).toBe(414);
  });

  it('ignores the transforms that inflate scrollWidth mid-animation', () => {
    const element = lane();
    box(element, 5, 248, 'transform: scale(1.29)');
    box(element, 257, 152, 'transform: translateX(80px)');

    expect(measureRestingScrollWidth(element)).toBe(414);
  });

  it('skips children taken out of flow and children with no box', () => {
    const element = lane();
    box(element, 5, 248);
    box(element, 257, 152);
    box(element, 409, 110, 'position: absolute');
    box(element, 0, 0, 'display: none');

    expect(measureRestingScrollWidth(element)).toBe(414);
  });

  it('measures a right-to-left row that overflows to negative offsets', () => {
    const element = lane('padding: 0 5px; direction: rtl');
    box(element, 197, 152);
    box(element, -151, 344);

    // -151 → 349 is 500 wide, plus the padding.
    expect(measureRestingScrollWidth(element)).toBe(510);
  });

  it('is only the padding when nothing is in flow', () => {
    const element = lane();
    box(element, 5, 248, 'position: absolute');

    expect(measureRestingScrollWidth(element)).toBe(10);
  });
});

describe('measureHorizontalOverflow', () => {
  const scrolled = (scrollWidth: number, scrollLeft: number) => {
    const element = lane();
    Object.defineProperty(element, 'clientWidth', { get: () => 350 });
    Object.defineProperty(element, 'scrollWidth', { get: () => scrollWidth });
    Object.defineProperty(element, 'scrollLeft', { get: () => scrollLeft });
    return element;
  };

  it('measures against the element scrollWidth by default', () => {
    expect(measureHorizontalOverflow(scrolled(430, 30))).toEqual({
      left: 30,
      right: 50,
      inlineEnd: 50,
    });
  });

  it('measures against a supplied scrollWidth instead', () => {
    const element = scrolled(430, 80);

    expect(measureHorizontalOverflow(element, { scrollWidth: 350 })).toEqual({
      left: 0,
      right: 0,
      inlineEnd: 0,
    });
    expect(measureHorizontalOverflow(element, { scrollWidth: 400 })).toEqual({
      left: 50,
      right: 0,
      inlineEnd: 0,
    });
  });
});
