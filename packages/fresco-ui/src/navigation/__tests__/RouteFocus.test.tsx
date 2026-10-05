import { act, render, screen } from '@testing-library/react';
import { type ReactNode, StrictMode } from 'react';
import { describe, expect, it, onTestFinished } from 'vitest';

import RouteFocus, {
  focusRouteTarget,
  routeFocusTargetProps,
} from '../RouteFocus';

const ROUTE_TITLE = 'Codebook';
const START_PATH = '/protocol/timeline';
const NEXT_PATH = '/protocol/codebook';

/** A route that renders no landing point at all. */
const NO_HEADING_PATH = '/protocol/assets';

/** Two stages of the same type, which routinely carry the same heading. */
const SHARED_TITLE = 'Name people';
const FIRST_GENERATOR = '/protocol/stage/1';
const SECOND_GENERATOR = '/protocol/stage/2';

/**
 * Records the live-region mutations a screen reader keys on, newest drain
 * first.
 *
 * An announcement IS a mutation of a live region: assistive technology reacts
 * to the region's content CHANGING, not to what the region happens to hold.
 * Reading the text back therefore cannot tell "announced again" from
 * "announced once and then went silent" whenever two routes carry the same
 * title — the text on screen is identical either way — and an assertion about
 * the text passes while the researcher hears nothing.
 *
 * Each call drains what has happened since the last one, from BOTH halves of
 * how records reach an observer: the callback, which runs at the next
 * microtask checkpoint and takes the queue with it, and `takeRecords`, which
 * is the only way to see records a synchronous assertion has not waited for.
 * Reading just one of the two loses every announcement that went the other
 * way.
 *
 * Empty results are dropped: a region emptied announces nothing.
 */
const announcementRecorder = () => {
  const announced: string[] = [];

  const collect = (records: MutationRecord[]) => {
    for (const { target } of records) {
      const element = target instanceof Element ? target : target.parentElement;
      const text = element?.closest('[role="status"]')?.textContent?.trim();
      if (text) announced.push(text);
    }
  };

  const observer = new MutationObserver(collect);
  observer.observe(document.body, {
    characterData: true,
    childList: true,
    subtree: true,
  });
  onTestFinished(() => observer.disconnect());

  return () => {
    collect(observer.takeRecords());
    return announced.splice(0);
  };
};

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

/**
 * Everything the live regions are holding.
 *
 * There are two of them, and which one holds the current destination
 * alternates, so a test that cares WHAT was announced reads the pair. What was
 * ANNOUNCED — whether the text changed at all — is a different question, and
 * `announcementRecorder` above is what answers it.
 */
const announcement = () =>
  screen
    .getAllByRole('status')
    .map((region) => region.textContent?.trim() ?? '')
    .join('');

/**
 * The route's content, either fixed or as a function of the location — the
 * function form is how a fixture gives two DIFFERENT routes the same heading.
 */
type RouteContent = ReactNode | ((location: string) => ReactNode);

const renderRoute = (content: RouteContent = routeContent) => {
  const contentFor = (location: string) =>
    typeof content === 'function' ? content(location) : content;

  const { rerender } = render(
    <RouterHarness location={START_PATH}>
      {contentFor(START_PATH)}
    </RouterHarness>,
  );

  return {
    heading: () => screen.getByRole('heading', { level: 1, name: ROUTE_TITLE }),
    addStage: () => screen.getByRole('button', { name: 'Add stage' }),
    regions: () => screen.getAllByRole('status'),
    navigate: (path: string) =>
      rerender(
        <RouterHarness location={path}>{contentFor(path)}</RouterHarness>,
      ),
  };
};

/** What a lazy route shows while its own content is still being fetched. */
const pendingContent = <p>Loading…</p>;

/**
 * A route whose content arrives AFTER the router has committed the location.
 *
 * Every host this component is published for renders something else first when
 * the route is lazy or Suspense-backed — TanStack Router renders the route's
 * pending component, React renders a Suspense fallback — so the location
 * changes while the landing point does not exist yet, and appears in a later
 * commit at the same location.
 */
const renderPendingRoute = () => {
  let current = START_PATH;
  const { rerender, unmount } = render(
    <RouterHarness location={START_PATH}>{pendingContent}</RouterHarness>,
  );

  const show = (location: string, children: ReactNode) => {
    current = location;
    rerender(<RouterHarness location={location}>{children}</RouterHarness>);
  };

  return {
    unmount,
    navigate: (path: string) => show(path, pendingContent),
    /**
     * The route's own content arriving, at the SAME location — the location is
     * what the component watches, and it has already stopped changing.
     */
    resolve: () =>
      act(async () => {
        show(current, routeContent);
        await Promise.resolve();
      }),
    /** A change to the page that is not a route change. */
    disturb: () =>
      act(async () => {
        const noise = document.createElement('div');
        document.body.append(noise);
        onTestFinished(() => noise.remove());
        await Promise.resolve();
      }),
  };
};

describe('RouteFocus', () => {
  it('moves focus to the route landing point when the navigation left nothing focused', () => {
    const { heading, navigate } = renderRoute();
    // Activating a link the new route unmounts drops focus to `<body>`; jsdom
    // starts there, which is the same state.
    expect(document.activeElement).toBe(document.body);

    navigate(NEXT_PATH);

    expect(heading()).toHaveFocus();
    expect(announcement()).toBe(ROUTE_TITLE);
  });

  it('leaves a control that still owns focus alone', () => {
    const { addStage, heading, navigate } = renderRoute();
    addStage().focus();

    navigate(NEXT_PATH);

    expect(addStage()).toHaveFocus();
    expect(heading()).not.toHaveFocus();
    // The route change happened; it declined to move focus, rather than never
    // running.
    expect(announcement()).toBe(ROUTE_TITLE);
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
    const { heading, navigate } = renderRoute();
    const svgLink = focusableSvgLink();
    svgLink.focus();
    expect(document.activeElement).toBe(svgLink);
    // The property the two predicates disagree about.
    expect(svgLink).not.toBeInstanceOf(HTMLElement);

    navigate(NEXT_PATH);

    expect(document.activeElement).toBe(svgLink);
    expect(heading()).not.toHaveFocus();
    expect(announcement()).toBe(ROUTE_TITLE);
  });

  it('treats the first render as an arrival rather than a navigation', () => {
    const { heading } = renderRoute();

    // Nothing owned focus on mount, so the only thing stopping the landing
    // point from taking it is the rule that a first render is not a route
    // change: whatever the app focused on boot keeps it.
    expect(heading()).not.toHaveFocus();
    expect(document.activeElement).toBe(document.body);
    expect(announcement()).toBe('');
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
    expect(announcement()).toBe('');
  });

  /**
   * Base UI marks the rest of the document `inert` while a modal is open.
   * jsdom does not implement `inert`, so `focus()` on an inert element would
   * succeed here — which is exactly what makes this test able to fail: without
   * the guard the heading takes focus. In a real browser it silently fails and
   * leaves focus on `<body>`, which is worse than not trying.
   */
  it('refuses to focus a landing point inside an inert subtree', () => {
    const { heading, navigate } = renderRoute(
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
    expect(announcement()).toBe(ROUTE_TITLE);
  });

  /**
   * Two routes can carry the same heading — two protocols with a "Name people"
   * stage, two stages of one protocol sharing a title — and the researcher
   * gets no other signal that the page changed. Writing the same string to one
   * region is a no-op: React bails out, the region's DOM never mutates, and
   * nothing is announced.
   */
  it('announces the second of two routes whose landing points read the same', () => {
    const announced = announcementRecorder();
    const { navigate } = renderRoute((location) => (
      <>
        <h1 {...routeFocusTargetProps}>{SHARED_TITLE}</h1>
        <p>{location}</p>
      </>
    ));

    navigate(FIRST_GENERATOR);
    expect(announced()).toContain(SHARED_TITLE);

    navigate(SECOND_GENERATOR);

    expect(announced()).toContain(SHARED_TITLE);
  });

  it('announces nothing when the route has no landing point', () => {
    const { navigate } = renderRoute(<button type="button">Add stage</button>);

    navigate(NEXT_PATH);

    expect(announcement()).toBe('');
    expect(document.activeElement).toBe(document.body);
  });

  /**
   * A live region holds what it was last given until something replaces it. A
   * route with no landing point has nothing to announce — there is no heading
   * to name it by — but leaving the PREVIOUS route's title standing tells a
   * screen reader the researcher is on a page they have already left.
   */
  it('clears the announcement when the new route has no landing point', () => {
    const { navigate } = renderRoute((location) =>
      location === NO_HEADING_PATH ? (
        <button type="button">Add stage</button>
      ) : (
        routeContent
      ),
    );

    navigate(NEXT_PATH);
    expect(announcement()).toBe(ROUTE_TITLE);

    navigate(NO_HEADING_PATH);

    expect(announcement()).toBe('');
  });

  /**
   * The lazy-route case, and the reason a single pass is not enough: the
   * router commits the location while the route still shows a fallback, so the
   * effect runs before the landing point exists. Nothing changes the location
   * afterwards, so without a retry the effect never runs again — focus stays
   * parked wherever the navigation left it and the page change is never
   * announced.
   */
  it('lands on a landing point that appears after the navigation', async () => {
    const { navigate, resolve } = renderPendingRoute();

    navigate(NEXT_PATH);
    // The route is committed; its content is not here yet.
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(document.activeElement).toBe(document.body);
    expect(announcement()).toBe('');

    await resolve();

    expect(
      screen.getByRole('heading', { level: 1, name: ROUTE_TITLE }),
    ).toHaveFocus();
    expect(announcement()).toBe(ROUTE_TITLE);
  });

  /**
   * The retry watches the document, so it has to stop as soon as it has an
   * answer — otherwise every later change to the page runs it again for as
   * long as the researcher stays on the route.
   */
  it('stops watching the document once the landing point has arrived', async () => {
    const announced = announcementRecorder();
    const { navigate, resolve, disturb } = renderPendingRoute();

    navigate(NEXT_PATH);
    await resolve();
    expect(announced()).toContain(ROUTE_TITLE);

    await disturb();

    // A page that changes is not a page that was navigated to.
    expect(announced()).toEqual([]);
  });

  it('stops watching the document when it unmounts still waiting', async () => {
    const { navigate, unmount } = renderPendingRoute();
    navigate(NEXT_PATH);

    unmount();

    // The landing point arrives after the component that was waiting for it
    // has gone. Nothing is mounted to announce it, and focus must not be
    // dragged onto it either.
    const late = document.createElement('h1');
    Object.assign(late, { tabIndex: -1, textContent: ROUTE_TITLE });
    late.setAttribute('data-route-focus-target', '');
    document.body.append(late);
    onTestFinished(() => late.remove());
    await act(async () => {
      await Promise.resolve();
    });

    expect(late).not.toHaveFocus();
    expect(document.activeElement).toBe(document.body);
  });

  it('announces politely to screen readers without showing anything', () => {
    const { regions } = renderRoute();

    // Both of them: a navigation lands in whichever is empty, so a region that
    // was not set up as a polite, visually hidden live region silently drops
    // every other announcement.
    expect(regions()).toHaveLength(2);
    for (const region of regions()) {
      expect(region).toHaveAttribute('aria-live', 'polite');
      expect(region).toHaveClass('sr-only');
    }
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

  /**
   * The realm half of "is anything focused?".
   *
   * The document handed in belongs to another window, so its elements were
   * built by that window's constructors. Any `instanceof` in the focus-state
   * check answers `false` about them, the navigation reads as having lost
   * focus, and the researcher is dragged off the control they were using to
   * the heading — in the one configuration this argument exists to support.
   */
  it('leaves a focus owner in the given document alone', () => {
    const { inner } = otherDocument();
    inner.body.innerHTML =
      '<h1 tabindex="-1" data-route-focus-target="">Popped-out page</h1><button type="button">Add stage</button>';
    const control = inner.querySelector('button');
    if (!control) throw new Error('the fixture must render a control to focus');
    control.focus();

    expect(inner.activeElement).toBe(control);
    // The realm boundary, stated: the same element in the ambient document
    // would answer `true`.
    expect(control instanceof Element).toBe(false);

    const target = focusRouteTarget(inner);

    expect(target).toBe(inner.querySelector('[data-route-focus-target]'));
    expect(inner.activeElement).toBe(control);
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
