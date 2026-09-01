import { render, screen } from '@testing-library/react';
import { type ReactNode, StrictMode } from 'react';
import { describe, expect, it, onTestFinished } from 'vitest';

import RouteFocus, {
  focusRouteTarget,
  routeFocusTargetProps,
} from '../RouteFocus';

const ROUTE_TITLE = 'Codebook';
const START_PATH = '/protocol/timeline';
const NEXT_PATH = '/protocol/codebook';

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

/**
 * Stands in for the host router: `RouteFocus` takes the location as a prop, so
 * a re-render at a new location IS a navigation as far as it is concerned.
 * Keeping the component identity stable across `rerender` is what makes the
 * effect re-run rather than remount.
 */
const RouterHarness = ({
  location,
  children,
}: {
  location: string;
  children: ReactNode;
}) => (
  <>
    <RouteFocus location={location} />
    {children}
  </>
);

const routeContent = (
  <>
    <h1 {...routeFocusTargetProps}>{ROUTE_TITLE}</h1>
    <button type="button">Add stage</button>
    <svg>
      <a href={START_PATH}>
        <text>Protocol map</text>
      </a>
    </svg>
  </>
);

const renderRoute = (content: ReactNode = routeContent) => {
  const { rerender } = render(
    <RouterHarness location={START_PATH}>{content}</RouterHarness>,
  );

  return {
    heading: () => screen.getByRole('heading', { level: 1, name: ROUTE_TITLE }),
    addStage: () => screen.getByRole('button', { name: 'Add stage' }),
    /** What a route change announces — proof the route-change effect ran. */
    announcement: () => screen.getByRole('status'),
    navigate: (path: string) =>
      rerender(<RouterHarness location={path}>{content}</RouterHarness>),
  };
};

describe('RouteFocus', () => {
  it('moves focus to the route landing point when the navigation left nothing focused', () => {
    const { announcement, heading, navigate } = renderRoute();
    // Activating a link the new route unmounts drops focus to `<body>`; jsdom
    // starts there, which is the same state.
    expect(document.activeElement).toBe(document.body);

    navigate(NEXT_PATH);

    expect(heading()).toHaveFocus();
    expect(announcement()).toHaveTextContent(ROUTE_TITLE);
  });

  it('leaves a control that still owns focus alone', () => {
    const { addStage, announcement, heading, navigate } = renderRoute();
    addStage().focus();

    navigate(NEXT_PATH);

    expect(addStage()).toHaveFocus();
    expect(heading()).not.toHaveFocus();
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

    navigate(NEXT_PATH);

    expect(document.activeElement).toBe(svgLink);
    expect(heading()).not.toHaveFocus();
    expect(announcement()).toHaveTextContent(ROUTE_TITLE);
  });

  it('treats the first render as an arrival rather than a navigation', () => {
    const { announcement, heading } = renderRoute();

    // Nothing owned focus on mount, so the only thing stopping the landing
    // point from taking it is the rule that a first render is not a route
    // change: whatever the app focused on boot keeps it.
    expect(heading()).not.toHaveFocus();
    expect(document.activeElement).toBe(document.body);
    expect(announcement()).toBeEmptyDOMElement();
  });

  /**
   * The same-location guard, which only a repeated effect run can exercise:
   * React re-runs mount effects under `StrictMode`, and the second run must
   * not read as a navigation. Removing EITHER guard in the effect — the
   * first-render one or the same-location one — moves focus here.
   */
  it('does not treat a repeated effect run at the same location as a navigation', () => {
    render(
      <StrictMode>
        <RouterHarness location={START_PATH}>{routeContent}</RouterHarness>
      </StrictMode>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: ROUTE_TITLE }),
    ).not.toHaveFocus();
    expect(document.activeElement).toBe(document.body);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  /**
   * Base UI marks the rest of the document `inert` while a modal is open.
   * jsdom does not implement `inert`, so `focus()` on an inert element would
   * succeed here — which is exactly what makes this test able to fail: without
   * the guard the heading takes focus. In a real browser it silently fails and
   * leaves focus on `<body>`, which is worse than not trying.
   */
  it('refuses to focus a landing point inside an inert subtree', () => {
    const { announcement, heading, navigate } = renderRoute(
      <div>
        <h1 {...routeFocusTargetProps}>{ROUTE_TITLE}</h1>
      </div>,
    );
    const wrapper = heading().parentElement;
    if (!wrapper) throw new Error('the fixture must wrap the landing point');
    wrapper.setAttribute('inert', '');

    navigate(NEXT_PATH);

    expect(heading()).not.toHaveFocus();
    expect(document.activeElement).toBe(document.body);
    // The route still changed, so it is still announced — the refusal is about
    // focus only.
    expect(announcement()).toHaveTextContent(ROUTE_TITLE);
  });

  it('announces nothing when the route has no landing point', () => {
    const { announcement, navigate } = renderRoute(
      <button type="button">Add stage</button>,
    );

    navigate(NEXT_PATH);

    expect(announcement()).toBeEmptyDOMElement();
    expect(document.activeElement).toBe(document.body);
  });

  it('announces politely to screen readers without showing anything', () => {
    const { announcement } = renderRoute();

    expect(announcement()).toHaveAttribute('aria-live', 'polite');
    expect(announcement()).toHaveClass('sr-only');
  });
});

describe('focusRouteTarget', () => {
  /**
   * A document other than the ambient one, with a browsing context of its own
   * so focus actually moves in it. An iframe is the closest jsdom gets to the
   * real case: UI rendered into a popped-out window.
   */
  const otherDocument = () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    onTestFinished(() => frame.remove());

    const inner = frame.contentDocument;
    if (!inner) throw new Error('the iframe must expose a content document');
    return { frame, inner };
  };

  it('searches, and reads the focus state from, the document it is given', () => {
    const { frame, inner } = otherDocument();
    inner.body.innerHTML =
      '<h1 tabindex="-1" data-route-focus-target="">Popped-out page</h1>';

    // The ambient document is set up to answer BOTH questions differently:
    // it holds no landing point, and something in it owns focus. Reading it
    // instead would return `null` from the query, and would refuse to move
    // focus even if it found one.
    const outerControl = document.createElement('button');
    document.body.append(outerControl);
    onTestFinished(() => outerControl.remove());
    outerControl.focus();
    expect(document.activeElement).toBe(outerControl);
    expect(document.querySelector('[data-route-focus-target]')).toBeNull();

    const target = focusRouteTarget(inner);

    expect(target).toBe(inner.querySelector('[data-route-focus-target]'));
    expect(inner.activeElement).toBe(target);
    // Focus landed inside the frame rather than anywhere in the ambient
    // document; a parent document reports focus in a child browsing context as
    // the frame itself, in jsdom exactly as in a browser.
    expect(document.activeElement).toBe(frame);
  });

  it('answers null when the given document has no landing point', () => {
    const { inner } = otherDocument();
    render(<h1 {...routeFocusTargetProps}>{ROUTE_TITLE}</h1>);

    // The landing point exists — in the ambient document, which is not the one
    // being asked about.
    expect(document.querySelector('[data-route-focus-target]')).not.toBeNull();
    expect(focusRouteTarget(inner)).toBeNull();
  });

  it('defaults to the ambient document', () => {
    render(<h1 {...routeFocusTargetProps}>{ROUTE_TITLE}</h1>);
    const heading = screen.getByRole('heading', {
      level: 1,
      name: ROUTE_TITLE,
    });

    expect(focusRouteTarget()).toBe(heading);
    expect(heading).toHaveFocus();
  });
});
