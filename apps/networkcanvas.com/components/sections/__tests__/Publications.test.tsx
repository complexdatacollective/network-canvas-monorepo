import { act, cleanup, screen, within } from '@testing-library/react';
import type { ComponentPropsWithoutRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Publication } from '~/lib/siteContent';
import { renderWithIntl } from '~/test/renderWithIntl';

import { Publications } from '../Publications';

vi.mock('~/lib/i18n/navigation', () => ({
  Link: ({ children, href, ...props }: ComponentPropsWithoutRef<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function publication(n: number, authors: string): Publication {
  return {
    id: `p${n}`,
    title: `Publication ${n}`,
    source: 'Example Journal',
    authors,
    href: `https://example.com/p${n}`,
    year: String(2030 - n),
  };
}

// Newest first, as the site lists them. Publication 0 shares an author with
// publication 3 (which has a card) and publication 9 (which does not).
const publications = [
  publication(0, 'Shared S, Zero Z'),
  publication(1, 'One O'),
  publication(2, 'Two T, Other O'),
  publication(3, 'Three T, Shared S'),
  publication(4, 'Four F'),
  publication(5, 'Five F'),
  publication(6, 'Six S'),
  publication(7, 'Seven S'),
  publication(8, 'Eight E'),
  publication(9, 'Shared S, Nine N'),
];

const distinctAuthors = new Set(
  publications.flatMap(({ authors }) => authors.split(', ')),
).size;

const relatedListName = 'Publications that share an author with this one';

// The overlay that shows a related publication's title inside the network.
function networkTitles(section: HTMLElement) {
  return [
    ...section.querySelectorAll<HTMLElement>('[data-related-publication]'),
  ].flatMap((element) => element.textContent || []);
}

afterEach(cleanup);

describe('Publications', () => {
  it('gives a card to the eight newest publications only', () => {
    renderWithIntl(<Publications publications={publications} />);

    const section = screen.getByRole('region', {
      name: 'Recent Publications Using Network Canvas',
    });
    const cards = within(section).getAllByRole('heading', { level: 3 });

    expect(cards.map((card) => card.textContent)).toEqual(
      publications.slice(0, 8).map(({ title }) => title),
    );
    for (const [index, card] of cards.entries()) {
      expect(card.closest('a')).toHaveAttribute(
        'href',
        publications[index]?.href,
      );
    }
    expect(section).toHaveTextContent(
      'The 8 most recent publications are shown here.',
    );
    expect(
      within(section).getByText('8', { selector: 'strong' }),
    ).toBeInTheDocument();
  });

  it('ends with a single link to every publication, counting them and their authors', () => {
    renderWithIntl(<Publications publications={publications} />);

    expect(distinctAuthors).toBe(12);
    expect(
      screen.getByRole('link', {
        name: 'View all 10 publications, with 12 authors',
      }),
    ).toHaveAttribute('href', '/publications');
  });

  describe('while a card is being read', () => {
    let readingTop = 0;
    // The network, and the reading that drives it, is for wide screens only.
    let wide = true;
    const observed: (() => void)[] = [];

    beforeEach(() => {
      wide = true;
      vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
        matches: wide && query === '(min-width: 1024px)',
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
      // Measure every element as soon as it is observed, and again whenever
      // a test moves the layout.
      observed.length = 0;
      vi.stubGlobal(
        'ResizeObserver',
        class {
          private callback: ResizeObserverCallback;
          constructor(callback: ResizeObserverCallback) {
            this.callback = callback;
          }
          observe() {
            const measure = () => this.callback([], this as ResizeObserver);
            observed.push(measure);
            queueMicrotask(measure);
          }
          unobserve() {}
          disconnect() {}
        },
      );
      // Each reading stop is 300px tall, one after another; the first card
      // sits on the reading line (halfway down a 768px viewport) when
      // readingTop is 200.
      readingTop = 200;
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
        function getRect(this: Element) {
          const stops = [...document.querySelectorAll('[data-reading-stop]')];
          const index = stops.indexOf(this);
          const top = index === -1 ? 0 : readingTop + index * 300;
          const height = index === -1 ? 0 : 300;
          return DOMRect.fromRect({ x: 0, y: top, width: 300, height });
        },
      );
      Object.defineProperty(SVGElement.prototype, 'getScreenCTM', {
        configurable: true,
        value: () => null,
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('lists the publications that share an author with it, after the card', async () => {
      renderWithIntl(<Publications publications={publications} />);

      const related = await screen.findByRole('list', {
        name: relatedListName,
      });
      expect(
        within(related)
          .getAllByRole('link')
          .map((link) => [link.textContent, link.getAttribute('href')]),
      ).toEqual(
        expect.arrayContaining([
          ['Publication 3', 'https://example.com/p3'],
          ['Publication 9', 'https://example.com/p9'],
        ]),
      );
      expect(within(related).getAllByRole('link')).toHaveLength(2);
      // The list follows the card being read, and no other card has one.
      const card = screen
        .getByRole('heading', { name: 'Publication 0' })
        .closest('a');
      if (!card) throw new Error('Expected the card to be a link');
      expect(card.parentElement).toContainElement(related);
      expect(
        card.compareDocumentPosition(related) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        screen.getAllByRole('list', { name: relatedListName }),
      ).toHaveLength(1);
    });

    it('shows a related publication’s title in the network while its link has focus', async () => {
      renderWithIntl(<Publications publications={publications} />);
      const section = screen.getByRole('region', {
        name: 'Recent Publications Using Network Canvas',
      });
      const related = await screen.findByRole('list', {
        name: relatedListName,
      });
      const link = within(related).getByRole('link', { name: 'Publication 9' });

      expect(networkTitles(section)).toEqual([]);
      act(() => link.focus());
      expect(networkTitles(section)).toEqual(['Publication 9']);
      act(() => link.blur());
      expect(networkTitles(section)).toEqual([]);
    });

    it('follows no card on narrow screens, which show no network', async () => {
      wide = false;
      renderWithIntl(<Publications publications={publications} />);
      // Let the layout be measured with the first card on the reading line.
      await act(async () => {});

      expect(
        screen.queryByRole('list', { name: relatedListName }),
      ).not.toBeInTheDocument();
    });

    it('keeps a tall card active until the reading line leaves it', async () => {
      // The first card is twice as tall as the others.
      const heights = [600, 300, 300, 300, 300, 300, 300, 300, 300];
      vi.mocked(Element.prototype.getBoundingClientRect).mockImplementation(
        function getRect(this: Element) {
          const stops = [...document.querySelectorAll('[data-reading-stop]')];
          const index = stops.indexOf(this);
          const top =
            readingTop +
            heights.slice(0, Math.max(0, index)).reduce((a, b) => a + b, 0);
          return DOMRect.fromRect({
            x: 0,
            y: index === -1 ? 0 : top,
            width: 300,
            height: index === -1 ? 0 : (heights[index] ?? 0),
          });
        },
      );
      const relayout = () =>
        act(() => {
          for (const measure of observed) measure();
        });
      const readingLine = window.innerHeight * 0.5;
      const firstCard = () =>
        screen.getByRole('heading', { name: 'Publication 0' }).closest('li');

      // 550px into the first card: past the midpoint between its centre and
      // the next card's, but still inside it.
      readingTop = readingLine - 550;
      renderWithIntl(<Publications publications={publications} />);
      const related = await screen.findByRole('list', {
        name: relatedListName,
      });
      expect(firstCard()).toContainElement(related);

      // Just past its bottom edge, the next card (which has no related
      // publications) takes over.
      readingTop = readingLine - 610;
      relayout();
      expect(
        screen.queryByRole('list', { name: relatedListName }),
      ).not.toBeInTheDocument();
    });

    it('puts the list away once the reader reaches the link to every publication', async () => {
      renderWithIntl(<Publications publications={publications} />);
      await screen.findByRole('list', { name: relatedListName });

      // The final link (the ninth reading stop) moves onto the reading line.
      readingTop = 200 - 8 * 300;
      act(() => {
        for (const measure of observed) measure();
      });

      expect(
        screen.queryByRole('list', { name: relatedListName }),
      ).not.toBeInTheDocument();
    });
  });
});
