import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';

import RouteFocus, { routeFocusTargetProps } from './RouteFocus';

const ROUTE_TITLE = 'Codebook';

/**
 * The one element in the fixture that is focusable but is NOT an `HTMLElement`.
 *
 * Queried by tag rather than by role and name on purpose: what this fixture
 * contributes is the element's DOM interface. A link inside an inline SVG
 * focuses as an `SVGElement` — as does anything else in an SVG carrying
 * `tabindex` — and no accessible name can express that.
 */
const focusableSvgLink = () => {
  const link = document.querySelector('svg a');
  if (!(link instanceof SVGElement)) {
    throw new Error('the fixture must render a focusable link inside an <svg>');
  }
  return link;
};

const renderRoute = () => {
  const { hook, navigate } = memoryLocation({ path: '/protocol/timeline' });

  render(
    <Router hook={hook}>
      <RouteFocus />
      <h1 {...routeFocusTargetProps}>{ROUTE_TITLE}</h1>
      <button type="button">Add stage</button>
      <svg>
        <a href="/protocol/timeline">
          <text>Protocol map</text>
        </a>
      </svg>
    </Router>,
  );

  return {
    heading: screen.getByRole('heading', { level: 1, name: ROUTE_TITLE }),
    addStage: screen.getByRole('button', { name: 'Add stage' }),
    /** What a route change announces — proof the route-change effect ran. */
    announcement: () => screen.getByRole('status'),
    navigate: (path: string) => act(() => navigate(path)),
  };
};

describe('RouteFocus', () => {
  it('moves focus to the route landing point when the navigation left nothing focused', () => {
    const { announcement, heading, navigate } = renderRoute();
    // Activating a link the new route unmounts drops focus to `<body>`; jsdom
    // starts there, which is the same state.
    expect(document.activeElement).toBe(document.body);

    navigate('/protocol/codebook');

    expect(heading).toHaveFocus();
    expect(announcement()).toHaveTextContent(ROUTE_TITLE);
  });

  it('leaves a control that still owns focus alone', () => {
    const { addStage, announcement, heading, navigate } = renderRoute();
    addStage.focus();

    navigate('/protocol/codebook');

    expect(addStage).toHaveFocus();
    expect(heading).not.toHaveFocus();
    // The route change happened; it declined to move focus, rather than never
    // running.
    expect(announcement()).toHaveTextContent(ROUTE_TITLE);
  });

  /**
   * The case that separates this component's "focus was lost" question from
   * fresco-ui's `asFinalFocusTarget`, which is otherwise the same test in the
   * opposite polarity. That helper additionally requires an `HTMLElement`,
   * because a Base UI `finalFocus` DESTINATION must be one — so it answers
   * `null` for a focused SVG element, and rewriting the check as
   * `asFinalFocusTarget(document.activeElement) === null` would classify a real
   * focus owner as lost and drag the researcher to the heading.
   *
   * Delete this test only together with that difference.
   */
  it('treats a focused SVG element as an owner of focus, not as lost focus', () => {
    const { announcement, heading, navigate } = renderRoute();
    const svgLink = focusableSvgLink();
    svgLink.focus();
    expect(document.activeElement).toBe(svgLink);
    // The property the two predicates disagree about.
    expect(svgLink).not.toBeInstanceOf(HTMLElement);

    navigate('/protocol/codebook');

    expect(document.activeElement).toBe(svgLink);
    expect(heading).not.toHaveFocus();
    expect(announcement()).toHaveTextContent(ROUTE_TITLE);
  });
});
