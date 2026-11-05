import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { MotionValue, motionValue } from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Grant } from '~/lib/siteContent';
import { renderWithIntl } from '~/test/renderWithIntl';

import { Grants } from '../Grants';

const motionPreference = vi.hoisted(() => ({ reduced: false }));

vi.mock('@codaco/fresco-ui/reducedMotion', () => ({
  usePrefersReducedMotion: () => motionPreference.reduced,
}));

// jsdom does not scroll, so the window's scroll position is a value the test
// sets; everything the section derives from it is real Motion.
const page = vi.hoisted(() => ({
  scrollY: undefined as MotionValue<number> | undefined,
}));

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<{ motionValue: typeof motionValue }>();
  page.scrollY = actual.motionValue(0);
  return { ...actual, useScroll: () => ({ scrollY: page.scrollY }) };
});

function scrollPageTo(top: number) {
  act(() => {
    page.scrollY?.set(top);
  });
}

const scrollTo = vi.fn((options?: ScrollToOptions | number) => {
  scrollPageTo(typeof options === 'number' ? options : (options?.top ?? 0));
});

const grants: Grant[] = [
  {
    id: 'fixture-grant-one',
    title: 'Fixture-only community research grant',
    pis: 'PI: Example Researcher',
    description: 'Fixture-only grant description.',
    logo: '/images/logos/uchicago.png',
    logoAlt: 'Example university',
    href: 'https://example.com/grants/one',
  },
  {
    id: 'fixture-grant-two',
    title: 'Fixture-only public health grant',
    pis: 'PI: Second Researcher',
    description: 'Second fixture-only grant description.',
    logo: '/images/logos/kentucky.png',
    logoAlt: 'Second example university',
    href: 'https://example.com/grants/two',
  },
  {
    id: 'fixture-grant-three',
    title: 'Fixture-only ageing study grant',
    pis: 'PI: Third Researcher',
    description: 'Third fixture-only grant description.',
    logo: '/images/logos/indiana.png',
    logoAlt: 'Third example university',
    href: 'https://example.com/grants/three',
  },
];

const [first, second, third] = grants as [Grant, Grant, Grant];

// jsdom has no layout either, so the test plays the layout engine. Each
// pinned frame is one viewport tall, so consecutive cards settle three
// quarters of a viewport apart; the heights below decide whether the cards and
// the heading column fit.
const VIEWPORT = 1000;
const SETTLE_INTERVAL = VIEWPORT * 0.75;
const layout = { cardBody: 400, column: 600 };

// The utilities that pin the frames, as the site stylesheet defines them.
const pinningStyles = document.createElement('style');
pinningStyles.textContent = `
  .sticky { position: sticky; }
  .tablet-landscape\\:sticky { position: sticky; }
`;

function stubLayout() {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(
    function offsetHeight(this: HTMLElement) {
      if (this instanceof HTMLLIElement && this.querySelector('article'))
        return VIEWPORT;
      if (this.hasAttribute('data-card-body')) return layout.cardBody;
      // The block holding the heading, introduction and index.
      if (
        !this.querySelector('article') &&
        this.querySelector('h2') &&
        this.querySelector('ol')
      )
        return layout.column;
      return 0;
    },
  );
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(VIEWPORT);
  window.scrollTo = scrollTo as typeof window.scrollTo;
}

beforeEach(() => {
  motionPreference.reduced = false;
  layout.cardBody = 400;
  layout.column = 600;
  page.scrollY?.set(0);
  scrollTo.mockClear();
  document.head.append(pinningStyles);
  stubLayout();
});

afterEach(() => {
  cleanup();
  pinningStyles.remove();
  vi.restoreAllMocks();
});

function renderGrants(locale?: Parameters<typeof renderWithIntl>[1]) {
  const result = renderWithIntl(<Grants grants={grants} />, locale);
  // The section measures itself when the window resizes (and through a
  // ResizeObserver, which jsdom does not drive).
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
  return result;
}

function section() {
  return screen.getByRole('region', { name: 'Grants Using Network Canvas' });
}

function cardLink(grant: Grant) {
  return within(section()).getByRole('link', { name: grant.title });
}

function card(grant: Grant) {
  const article = cardLink(grant).closest('article');
  if (!article) throw new Error(`No card holds ${grant.title}`);
  return article;
}

function escapeRegExp(text: string) {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// An index entry is named by the institution, then the grant title. jsdom
// does not know the two parts are blocks, so it joins them without a space.
function indexLink(grant: Grant) {
  return within(section()).getByRole('link', {
    name: new RegExp(
      `^${escapeRegExp(grant.logoAlt)}\\s?${escapeRegExp(grant.title)}$`,
    ),
  });
}

function isPinned(element: HTMLElement) {
  for (
    let current: HTMLElement | null = element;
    current && current !== section();
    current = current.parentElement
  ) {
    if (getComputedStyle(current).position === 'sticky') return true;
  }
  return false;
}

describe('Grants', () => {
  it('links every grant to its page from a card that names its institution', () => {
    renderGrants();

    for (const grant of grants) {
      const link = cardLink(grant);
      expect(link).toHaveAttribute('href', grant.href);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noreferrer');
      expect(
        screen.getByRole('heading', { level: 3, name: grant.title }),
      ).toContainElement(link);

      const inCard = within(card(grant));
      expect(inCard.getByRole('img', { name: grant.logoAlt })).toBeVisible();
      expect(inCard.getByText(grant.pis)).toBeVisible();
      expect(inCard.getByText(grant.description)).toBeVisible();
    }
  });

  it('indexes every grant against its own card', () => {
    renderGrants();

    for (const grant of grants) {
      const fragment = indexLink(grant).getAttribute('href') ?? '';
      expect(fragment).toMatch(/^#./);
      expect(document.getElementById(fragment.slice(1))).toBe(cardLink(grant));
    }
  });

  it('marks the grant on top of the pile as current in the index', async () => {
    renderGrants();
    expect(indexLink(first)).toHaveAttribute('aria-current', 'step');

    scrollPageTo(SETTLE_INTERVAL);

    await waitFor(() => {
      expect(indexLink(second)).toHaveAttribute('aria-current', 'step');
    });
    expect(indexLink(first)).not.toHaveAttribute('aria-current');
    expect(indexLink(third)).not.toHaveAttribute('aria-current');
  });

  it('jumps from the index to where a card lands on the pile and focuses it', async () => {
    renderGrants();

    const notPrevented = fireEvent.click(indexLink(third));

    expect(notPrevented).toBe(false);
    expect(scrollTo).toHaveBeenCalledWith({ top: 2 * SETTLE_INTERVAL + 2 });
    expect(cardLink(third)).toHaveFocus();
    await waitFor(() => {
      expect(indexLink(third)).toHaveAttribute('aria-current', 'step');
    });
  });

  it('brings a card reached from the keyboard to the top of the pile', () => {
    renderGrants();

    fireEvent.keyDown(document.body, { key: 'Tab' });
    act(() => {
      cardLink(second).focus();
    });

    expect(scrollTo).toHaveBeenCalledWith({ top: SETTLE_INTERVAL + 2 });
  });

  it('leaves the page where it is when a pointer focuses a card', () => {
    renderGrants();

    fireEvent.mouseDown(cardLink(second));
    act(() => {
      cardLink(second).focus();
    });

    expect(cardLink(second)).toHaveFocus();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('pins the cards and the heading column while they fit the viewport', () => {
    renderGrants();

    for (const grant of grants) expect(isPinned(cardLink(grant))).toBe(true);
    expect(isPinned(screen.getByRole('heading', { level: 2 }))).toBe(true);
  });

  it('lists the cards in the page flow when one is taller than the viewport', () => {
    layout.cardBody = VIEWPORT * 2;
    renderGrants();

    for (const grant of grants) expect(isPinned(cardLink(grant))).toBe(false);
    // The index is an ordinary in-page link again, and keyboard focus leaves
    // the scrolling to the browser.
    expect(fireEvent.click(indexLink(third))).toBe(true);
    fireEvent.keyDown(document.body, { key: 'Tab' });
    act(() => {
      cardLink(second).focus();
    });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('lets the heading column scroll when it is taller than the viewport', () => {
    layout.column = VIEWPORT + 1;
    renderGrants();

    expect(isPinned(screen.getByRole('heading', { level: 2 }))).toBe(false);
    for (const grant of grants) expect(isPinned(cardLink(grant))).toBe(true);
  });

  it('tilts a card while it travels up and lays it flat once it lands', async () => {
    renderGrants();

    await waitFor(() => {
      expect(card(second).style.transform).toMatch(/rotateX\(22\.00deg\)/);
    });

    scrollPageTo(SETTLE_INTERVAL);

    await waitFor(() => {
      expect(card(second).style.transform).toMatch(/rotateX\(0\.00deg\)/);
    });
  });

  it('keeps the cards still for visitors who prefer reduced motion', async () => {
    motionPreference.reduced = true;
    renderGrants();

    scrollPageTo(SETTLE_INTERVAL);

    // The scroll has been taken into account once the index moves on.
    await waitFor(() => {
      expect(indexLink(second)).toHaveAttribute('aria-current', 'step');
    });
    for (const grant of grants) expect(card(grant).style.transform).toBe('');
  });

  it('translates the section into Spanish', () => {
    renderGrants('es');

    expect(
      screen.getByRole('region', {
        name: 'Subvenciones que utilizan Network Canvas',
      }),
    ).toBeInTheDocument();
  });

  it('renders nothing without grants', () => {
    const { container } = renderWithIntl(<Grants grants={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
