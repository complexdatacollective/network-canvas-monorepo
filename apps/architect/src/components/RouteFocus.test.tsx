import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';

import {
  focusRouteTarget as sharedFocusRouteTarget,
  routeFocusTargetProps as sharedRouteFocusTargetProps,
} from '@codaco/fresco-ui/navigation/RouteFocus';

import RouteFocus, {
  focusRouteTarget,
  routeFocusTargetProps,
} from './RouteFocus';

/**
 * What this file covers is the wrapper, not route-change focus itself: which
 * element a navigation lands on, when it declines to move focus, what it
 * announces, and the inert and no-landing-point refusals are fresco-ui's
 * behaviour, pinned by
 * `packages/fresco-ui/src/navigation/__tests__/RouteFocus.test.tsx` against the
 * component this file renders.
 *
 * The wrapper can only break in two ways, one per test below: it can fail to
 * feed wouter's location to a component that treats a changed location as the
 * whole definition of "a route change happened", and it can stop re-exporting
 * the shared helpers the rest of Architect imports through this module.
 */
const ROUTE_TITLE = 'Codebook';

const renderRoute = () => {
  const { hook, navigate } = memoryLocation({ path: '/protocol/timeline' });

  render(
    <Router hook={hook}>
      <RouteFocus />
      <h1 {...routeFocusTargetProps}>{ROUTE_TITLE}</h1>
    </Router>,
  );

  return {
    heading: () => screen.getByRole('heading', { level: 1, name: ROUTE_TITLE }),
    /**
     * What a route change announces — proof the route-change effect ran.
     *
     * Everything the live regions hold, because there are two of them and
     * which one carries the destination alternates: fresco-ui announces by
     * moving the text between them, so that a route whose title matches the
     * one before it still changes a region and is still announced.
     */
    announcement: () =>
      screen
        .getAllByRole('status')
        .map((region) => region.textContent?.trim() ?? '')
        .join(''),
    navigate: (path: string) => act(() => navigate(path)),
  };
};

describe('RouteFocus', () => {
  it("carries Architect's own router to the shared component, so a navigation lands focus on the route heading and announces it", () => {
    const { announcement, heading, navigate } = renderRoute();
    // Nothing has been announced yet, and the heading does not hold focus:
    // arriving is not navigating.
    expect(announcement()).toBe('');
    expect(document.activeElement).toBe(document.body);

    // A wouter navigation, not a re-render with a new prop. Subscribing to
    // anything but the router — or reading the location once and never
    // re-reading it — leaves the shared component at its first location, and
    // no route change ever reaches it.
    navigate('/protocol/codebook');

    expect(heading()).toHaveFocus();
    expect(announcement()).toBe(ROUTE_TITLE);
  });

  it("re-exports fresco-ui's helpers rather than a local copy of them", () => {
    // Identity, not behaviour: nine call sites across Architect import these
    // through this module — `routeFocusTargetProps` on every route's landing
    // heading, `focusRouteTarget` in `ProtocolRouteGuard` — and they have to
    // be the values the shared component itself queries and spreads. A local
    // re-declaration would pass every behavioural test in this file on the day
    // it was written and drift the first time fresco-ui changes either one.
    expect(focusRouteTarget).toBe(sharedFocusRouteTarget);
    expect(routeFocusTargetProps).toBe(sharedRouteFocusTargetProps);
  });
});
