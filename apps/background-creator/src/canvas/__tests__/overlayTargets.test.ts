import { describe, expect, it } from 'vitest';

import {
  INLINE_EDITOR_ATTR,
  isOverlayControlTarget,
  RESIZE_HANDLE_ATTR,
  ZONE_PILL_ATTR,
} from '../overlayTargets';

function elementWith(attr: string): HTMLElement {
  const el = document.createElement('button');
  el.setAttribute(attr, '');
  return el;
}

describe('isOverlayControlTarget', () => {
  it('matches a resize handle, a zone pill, and the inline editor', () => {
    expect(isOverlayControlTarget(elementWith(RESIZE_HANDLE_ATTR))).toBe(true);
    expect(isOverlayControlTarget(elementWith(ZONE_PILL_ATTR))).toBe(true);
    expect(isOverlayControlTarget(elementWith(INLINE_EDITOR_ATTR))).toBe(true);
  });

  it('matches a descendant of a tagged control (e.g. the visible dot)', () => {
    const handle = elementWith(RESIZE_HANDLE_ATTR);
    const dot = document.createElement('span');
    handle.append(dot);
    expect(isOverlayControlTarget(dot)).toBe(true);
  });

  it('does not match a plain stage element', () => {
    expect(isOverlayControlTarget(document.createElement('div'))).toBe(false);
  });

  it('does not match null or a non-Element target', () => {
    expect(isOverlayControlTarget(null)).toBe(false);
    expect(isOverlayControlTarget(new EventTarget())).toBe(false);
  });
});
