import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import type { ComponentPropsWithoutRef, ComponentType, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SummerUpdatePage } from '../SummerUpdatePage';

const { launchAnimationControls, motionPreferences } = vi.hoisted(() => ({
  launchAnimationControls: {
    set: vi.fn(),
    start: vi.fn(() => Promise.resolve()),
  },
  motionPreferences: { shouldReduce: false },
}));

vi.mock('../../ui/HomepagePageBackground', () => ({
  HomepagePageBackground: () => <div data-testid="hero-weave" />,
}));

vi.mock('../HeroSignalField', () => ({
  HeroSignalField: () => <div data-testid="hero-signal-field" />,
}));

type MotionMockProps = {
  animate?: unknown;
  children?: ReactNode;
  exit?: unknown;
  initial?: unknown;
  layout?: unknown;
  layoutId?: string;
  onViewportEnter?: () => void;
  transition?: unknown;
  variants?: unknown;
  viewport?: unknown;
  whileInView?: unknown;
};

function MotionDiv({
  animate: _animate,
  children,
  exit: _exit,
  initial: _initial,
  layout: _layout,
  layoutId: _layoutId,
  onViewportEnter: _onViewportEnter,
  transition: _transition,
  variants: _variants,
  viewport: _viewport,
  whileInView: _whileInView,
  ...props
}: ComponentPropsWithoutRef<'div'> & MotionMockProps) {
  return <div {...props}>{children}</div>;
}

function MotionSpan({
  animate: _animate,
  children,
  exit: _exit,
  initial: _initial,
  layout: _layout,
  layoutId: _layoutId,
  onViewportEnter: _onViewportEnter,
  transition: _transition,
  variants: _variants,
  viewport: _viewport,
  whileInView: _whileInView,
  ...props
}: ComponentPropsWithoutRef<'span'> & MotionMockProps) {
  return <span {...props}>{children}</span>;
}

function MotionSvg({
  animate: _animate,
  children,
  exit: _exit,
  initial: _initial,
  layout: _layout,
  layoutId: _layoutId,
  onViewportEnter: _onViewportEnter,
  transition: _transition,
  variants: _variants,
  viewport: _viewport,
  whileInView: _whileInView,
  ...props
}: ComponentPropsWithoutRef<'svg'> & MotionMockProps) {
  return <svg {...props}>{children}</svg>;
}

function MotionPath({
  animate: _animate,
  children,
  exit: _exit,
  initial: _initial,
  layout: _layout,
  layoutId: _layoutId,
  onViewportEnter: _onViewportEnter,
  transition: _transition,
  variants: _variants,
  viewport: _viewport,
  whileInView: _whileInView,
  ...props
}: ComponentPropsWithoutRef<'path'> & MotionMockProps) {
  return <path {...props}>{children}</path>;
}

function MotionCircle({
  animate: _animate,
  children,
  exit: _exit,
  initial: _initial,
  layout: _layout,
  layoutId: _layoutId,
  onViewportEnter: _onViewportEnter,
  transition: _transition,
  variants: _variants,
  viewport: _viewport,
  whileInView: _whileInView,
  ...props
}: ComponentPropsWithoutRef<'circle'> & MotionMockProps) {
  return <circle {...props}>{children}</circle>;
}

function MotionGroup({
  animate: _animate,
  children,
  exit: _exit,
  initial: _initial,
  layout: _layout,
  layoutId: _layoutId,
  onViewportEnter: _onViewportEnter,
  transition: _transition,
  variants: _variants,
  viewport: _viewport,
  whileInView: _whileInView,
  ...props
}: ComponentPropsWithoutRef<'g'> & MotionMockProps) {
  return <g {...props}>{children}</g>;
}

function MotionListItem({
  animate: _animate,
  children,
  exit: _exit,
  initial: _initial,
  layout: _layout,
  layoutId: _layoutId,
  onViewportEnter: _onViewportEnter,
  transition: _transition,
  variants: _variants,
  viewport: _viewport,
  whileInView: _whileInView,
  ...props
}: ComponentPropsWithoutRef<'li'> & MotionMockProps) {
  return <li {...props}>{children}</li>;
}

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  LayoutGroup: ({ children }: { children: ReactNode }) => children,
  motion: {
    circle: MotionCircle,
    create: (Component: ComponentType) => Component,
    div: MotionDiv,
    g: MotionGroup,
    li: MotionListItem,
    path: MotionPath,
    span: MotionSpan,
    svg: MotionSvg,
  },
  useAnimation: () => ({ start: vi.fn() }),
  useAnimationControls: () => launchAnimationControls,
  useMotionValue: (value: number) => ({
    get: () => value,
    set: vi.fn(),
  }),
  useMotionValueEvent: vi.fn(),
  useReducedMotion: () => motionPreferences.shouldReduce,
  useScroll: () => ({
    scrollYProgress: {
      get: () => 0,
      set: vi.fn(),
    },
  }),
  useSpring: () => 0,
  useTransform: () => 0,
}));

vi.mock('~/components/layout/Header', () => ({
  Header: () => <div>Site navigation</div>,
}));

vi.mock('~/components/layout/Footer', () => ({
  Footer: () => <div>Site footer</div>,
}));

vi.mock('~/components/ui/ButtonLink', () => ({
  ButtonLink: ({
    children,
    external: _external,
    href,
    textStyle: _textStyle,
    ...props
  }: ComponentPropsWithoutRef<'a'> & {
    external?: boolean;
    href: string;
    textStyle?: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('~/lib/i18n/navigation', () => ({
  Link: ({
    children,
    href,
    ...props
  }: ComponentPropsWithoutRef<'a'> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  launchAnimationControls.set.mockClear();
  launchAnimationControls.start.mockClear();
  motionPreferences.shouldReduce = false;
});

describe('SummerUpdatePage', () => {
  it('defines PWA where the abbreviation is introduced', () => {
    render(<SummerUpdatePage />);

    const abbreviations = screen.getAllByText('PWA');

    expect(abbreviations).toHaveLength(2);
    abbreviations.forEach((abbreviation) => {
      expect(abbreviation.tagName).toBe('ABBR');
      expect(abbreviation).toHaveAccessibleDescription(
        /Progressive Web Apps are specially crafted websites/,
      );
    });
  });

  it('links every Schema 8 explorer item to its relevant documentation', () => {
    render(<SummerUpdatePage />);

    const selectedFeature = screen.getByRole('button', {
      name: 'Geospatial',
    });

    expect(selectedFeature).toHaveClass(
      'justify-center',
      'aria-pressed:bg-sea-serpent',
      'aria-pressed:text-rich-black',
    );
    expect(selectedFeature).not.toHaveClass('aria-pressed:bg-sea-serpent/15');
    expect(screen.getByText('One-to-many dyad census')).toHaveClass(
      'leading-snug',
    );
    expect(
      screen.getByRole('heading', { name: 'Geospatial interface' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Explore in the documentation' }),
    ).toHaveAttribute(
      'href',
      'https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/geospatial',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Anonymisation' }));

    expect(
      screen.getByRole('heading', { name: 'Anonymisation interface' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/encrypting selected node or edge attributes/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Each participant creates the passphrase/).closest('li'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Explore in the documentation' }),
    ).toHaveAttribute(
      'href',
      'https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/anonymisation',
    );
  });

  it('groups the feature explorer and shows screenshots in interface details', () => {
    render(<SummerUpdatePage />);

    [
      'New interview interfaces',
      'Schema 8 features',
      'Architect',
      'Interviewer',
      'Fresco 4.0.0',
    ].forEach((heading) => {
      const groupHeading = screen.getByRole('heading', {
        level: 3,
        name: heading,
      });

      expect(groupHeading).toHaveClass('text-2xl', 'font-black');
      expect(groupHeading).not.toHaveClass('uppercase', 'tracking-widest');
      expect(groupHeading.parentElement).not.toHaveClass('border-b', 'pb-3');
    });

    [
      'Geospatial',
      'Anonymisation',
      'One-to-many dyad census',
      'Family pedigree',
      'Narrative pedigree',
      'Network composer',
    ].forEach((interfaceName) => {
      const card = screen.getByRole('button', { name: interfaceName });

      expect(card.querySelector('img')).not.toBeInTheDocument();
      expect(card.querySelector('svg')).toBeInTheDocument();
    });

    const geospatialDetails = screen
      .getByRole('heading', { name: 'Geospatial interface' })
      .closest('[aria-live="polite"]');
    const geospatialScreenshot = screen.getByRole('img', {
      name: 'Geospatial interface preview',
    });
    const screenshotFrame = geospatialScreenshot.closest('.aspect-video');

    if (!(geospatialDetails instanceof HTMLElement)) {
      throw new Error('Feature details panel did not render');
    }

    expect(geospatialDetails).toContainElement(geospatialScreenshot);
    expect(
      within(geospatialDetails).queryByText('New interface'),
    ).not.toBeInTheDocument();
    expect(screenshotFrame?.parentElement?.lastElementChild).toBe(
      screenshotFrame,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Anonymisation' }));

    expect(
      screen.queryByRole('img', {
        name: 'Geospatial interface preview',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: 'Anonymisation interface preview',
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Validation' }));

    expect(
      screen.queryByRole('img', {
        name: /interface preview$/i,
      }),
    ).not.toBeInTheDocument();
  });

  it('explains the selected compatibility row in plain language', () => {
    render(<SummerUpdatePage />);

    expect(
      screen.getByText(
        'Select any row above to see what it means for your protocol files.',
      ),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Architect: Schema 7 migrates; Schema 8 native',
      }),
    );

    expect(
      screen.getByText(
        /The new Architect builds Schema 8 protocols, and opens and automatically upgrades older Schema 7 protocols/,
      ),
    ).toBeInTheDocument();
  });

  it('introduces the redesigned project website and documentation', () => {
    render(<SummerUpdatePage />);

    expect(
      screen.getByRole('heading', {
        name: 'A clearer home for the whole Network Canvas project',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Explore the new website' }),
    ).toHaveAttribute('href', 'https://networkcanvas.com/');
    expect(
      screen.getByRole('link', { name: 'Explore the documentation' }),
    ).toHaveAttribute('href', 'https://documentation.networkcanvas.com/');
    const websiteHeading = screen.getByRole('heading', {
      name: 'A fresh new look for networkcanvas.com',
    });
    const websiteScreenshot = screen.getByRole('img', {
      name: 'The redesigned Network Canvas website homepage',
    });
    const documentationHeading = screen.getByRole('heading', {
      name: 'Guidance organized around your research workflow',
    });
    const documentationScreenshot = screen.getByRole('img', {
      name: 'The redesigned Network Canvas documentation homepage',
    });

    expect(websiteHeading).toHaveClass('mt-2!');
    expect(documentationHeading).toHaveClass('mt-2!');
    expect(
      screen
        .getByRole('link', { name: 'Explore the new website' })
        .closest('article'),
    ).toContainElement(websiteScreenshot);
    expect(
      screen
        .getByRole('link', { name: 'Explore the documentation' })
        .closest('article'),
    ).toContainElement(documentationScreenshot);
    expect(websiteScreenshot.parentElement).toHaveClass('aspect-4/3');
    expect(documentationScreenshot.parentElement).toHaveClass('aspect-4/3');
  });

  it('presents the new-generation destinations as descriptive launch cards', () => {
    render(<SummerUpdatePage />);

    expect(
      screen.getByRole('heading', {
        name: 'Start exploring the new generation',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Design protocols')).toBeInTheDocument();
    expect(screen.getByText('Collect in person')).toBeInTheDocument();
    expect(screen.getByText('Collect remotely')).toBeInTheDocument();
    expect(screen.getByText('Learn the workflow')).toBeInTheDocument();
    expect(
      screen.getByText(/Build, validate, and preview Schema 8 protocols/),
    ).toBeInTheDocument();
    const destinations = screen
      .getByRole('heading', { name: 'Start exploring the new generation' })
      .closest('section');

    if (!destinations) {
      throw new Error('Destination cards did not render');
    }

    expect(
      within(destinations).getByRole('link', { name: /Open Architect/ }),
    ).toHaveAttribute('href', 'https://architect.networkcanvas.com/');
  });

  it('uses consistent frame ratios for the new app screenshots', () => {
    render(<SummerUpdatePage />);

    const architectScreenshot = screen.getByRole('img', {
      name: 'Architect protocol editor showing the Sample Protocol timeline',
    });
    const interviewerScreenshot = screen.getByRole('img', {
      name: 'Interviewer dashboard showing protocol cards and a resume interview action',
    });

    expect(architectScreenshot.parentElement).toHaveClass('aspect-4/3');
    expect(interviewerScreenshot.parentElement).toHaveClass('aspect-4/3');
  });

  it('uses theme-aware sections, a text-anchored woven hero, and white browser frames', () => {
    render(<SummerUpdatePage />);

    const heroHeading = screen.getByRole('heading', {
      name: 'Introducing the next generation of Network Canvas apps',
    });
    const hero = heroHeading.closest('section');
    const projectName = within(heroHeading).getByText('Network Canvas');

    if (!hero) {
      throw new Error('Hero focal text did not render');
    }

    expect(hero).toHaveClass(
      'relative',
      'm-0!',
      'min-h-svh',
      'flex-col',
      'overflow-hidden',
    );
    expect(hero.querySelector('.min-h-screen')).not.toBeInTheDocument();
    expect(hero.querySelector('.bg-linear-to-b')).toHaveClass(
      'from-slate-blue/25',
      'via-sea-serpent/10',
      'to-transparent',
    );
    expect(projectName).toHaveClass('bg-clip-text', 'text-white');
    expect(projectName).toHaveStyle({
      animation: 'var(--animate-text-glow)',
    });
    expect(projectName.style.webkitTextFillColor).toBe('var(--color-white)');
    expect(projectName.style.webkitTextStroke).toBe(
      'var(--text-glow-stroke-width) transparent',
    );
    expect(projectName.parentElement).toHaveAttribute(
      'data-homepage-weave-target',
    );
    const heroWeave = within(hero).getByTestId('hero-weave');
    expect(heroWeave).toBeInTheDocument();
    expect(heroWeave.parentElement).toHaveClass('entrance-motion-item');

    const upgradeHeading = screen.getByRole('heading', {
      name: 'When should you upgrade?',
    });
    const upgradeSection = upgradeHeading.closest('section');

    expect(upgradeHeading).toHaveClass('sr-only');
    expect(upgradeSection).toHaveClass('relative');
    expect(upgradeSection).not.toHaveClass(
      'bg-linear-to-br',
      'bg-rich-black',
      'bg-white',
    );

    const interviewerScreenshot = screen.getByRole('img', {
      name: 'Interviewer dashboard showing protocol cards and a resume interview action',
    });
    expect(interviewerScreenshot.parentElement).toHaveClass('bg-white');
    expect(interviewerScreenshot.parentElement).toHaveClass('aspect-4/3');
    expect(interviewerScreenshot.parentElement).not.toHaveClass(
      'bg-rich-black',
    );
  });

  it('keeps the text glow still when reduced motion is requested', () => {
    motionPreferences.shouldReduce = true;
    render(<SummerUpdatePage />);

    const projectName = within(
      screen.getByRole('heading', {
        name: 'Introducing the next generation of Network Canvas apps',
      }),
    ).getByText('Network Canvas');

    expect(projectName.style.animation).toBe('');
    expect(projectName.style.webkitTextFillColor).toBe('var(--color-white)');
    expect(
      screen.getByText('Keep scrolling to learn more').nextElementSibling
        ?.firstElementChild,
    ).toHaveClass('motion-safe:animate-bounce');
  });
});
