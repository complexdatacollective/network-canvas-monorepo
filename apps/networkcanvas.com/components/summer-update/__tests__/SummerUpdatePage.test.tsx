import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ComponentPropsWithoutRef, ComponentType, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SummerUpdatePage } from '../SummerUpdatePage';

const { motionPreferences } = vi.hoisted(() => ({
  motionPreferences: { shouldReduce: false },
}));

vi.mock('@codaco/art/NetworkWeaveBackground', () => ({
  default: ({ convergence }: { convergence?: { x: number; y: number } }) => (
    <div
      data-testid="hero-weave"
      data-convergence={
        convergence ? `${convergence.x},${convergence.y}` : undefined
      }
    />
  ),
}));

function MotionDiv({
  animate: _animate,
  children,
  initial: _initial,
  transition: _transition,
  viewport: _viewport,
  whileInView: _whileInView,
  ...props
}: ComponentPropsWithoutRef<'div'> & {
  animate?: unknown;
  children?: ReactNode;
  initial?: unknown;
  transition?: unknown;
  viewport?: unknown;
  whileInView?: unknown;
}) {
  return <div {...props}>{children}</div>;
}

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  motion: {
    create: (Component: ComponentType) => Component,
    div: MotionDiv,
  },
  useReducedMotion: () => motionPreferences.shouldReduce,
  useScroll: () => ({ scrollYProgress: 0 }),
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
    ...props
  }: ComponentPropsWithoutRef<'a'> & { external?: boolean; href: string }) => (
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
  motionPreferences.shouldReduce = false;
});

describe('SummerUpdatePage', () => {
  it('defines PWA where the abbreviation is introduced', () => {
    render(<SummerUpdatePage />);

    const abbreviation = screen.getByText('PWAs');

    expect(abbreviation.tagName).toBe('ABBR');
    expect(abbreviation).toHaveAccessibleDescription('Progressive Web Apps');
  });

  it('links every Schema 8 explorer item to its relevant documentation', () => {
    render(<SummerUpdatePage />);

    expect(screen.getByRole('button', { name: 'Geospatial' })).toHaveClass(
      'justify-center',
    );
    expect(screen.getByText('One-to-many dyad census')).toHaveClass(
      'leading-snug',
    );
    expect(
      screen.getByRole('heading', { name: 'Geospatial interface' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Explore in the documentation ↗' }),
    ).toHaveAttribute(
      'href',
      'https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/geospatial',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Anonymisation' }));

    expect(
      screen.getByRole('heading', { name: 'Anonymisation interface' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/participant-centered local encryption/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Explore in the documentation ↗' }),
    ).toHaveAttribute(
      'href',
      'https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/anonymisation',
    );
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
      screen.getByRole('link', { name: 'Explore the new website ↗' }),
    ).toHaveAttribute('href', 'https://networkcanvas.com/');
    expect(
      screen.getByRole('link', { name: 'Explore the documentation ↗' }),
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
      screen.getByRole('link', { name: 'Explore the new website ↗' })
        .parentElement?.lastElementChild,
    ).toContainElement(websiteScreenshot);
    expect(
      screen.getByRole('link', { name: 'Explore the documentation ↗' })
        .parentElement?.lastElementChild,
    ).toContainElement(documentationScreenshot);
  });

  it('uses theme-aware sections, a text-anchored woven hero, and white browser frames', async () => {
    render(<SummerUpdatePage />);

    const heroHeading = screen.getByRole('heading', {
      name: 'Introducing the next generation of Network Canvas apps',
    });
    const hero = heroHeading.closest('section');
    const projectName = within(heroHeading).getByText('Network Canvas');

    if (!hero) {
      throw new Error('Hero focal text did not render');
    }

    expect(hero).toHaveClass('relative', 'overflow-hidden');
    expect(hero).not.toHaveClass('bg-linear-to-b');
    expect(heroHeading).toHaveClass('text-text');
    expect(projectName).toHaveClass('bg-clip-text', 'text-white');
    expect(projectName).toHaveStyle({
      animation: 'var(--animate-text-glow)',
    });
    expect(projectName.style.webkitTextFillColor).toBe('var(--color-white)');
    expect(projectName.style.webkitTextStroke).toBe(
      'var(--text-glow-stroke-width) transparent',
    );

    vi.spyOn(hero, 'getBoundingClientRect').mockReturnValue({
      bottom: 850,
      height: 800,
      left: 100,
      right: 1100,
      top: 50,
      width: 1000,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    });
    vi.spyOn(projectName, 'getBoundingClientRect').mockReturnValue({
      bottom: 450,
      height: 100,
      left: 600,
      right: 800,
      top: 350,
      width: 200,
      x: 600,
      y: 350,
      toJSON: () => ({}),
    });

    fireEvent(window, new Event('resize'));

    await waitFor(() =>
      expect(screen.getByTestId('hero-weave')).toHaveAttribute(
        'data-convergence',
        '0.6,0.4375',
      ),
    );

    expect(
      screen.getByRole('heading', { name: 'Should you upgrade?' }),
    ).toHaveClass('sr-only');
    expect(
      screen
        .getByRole('heading', { name: 'Should you upgrade?' })
        .closest('section'),
    ).toHaveClass('bg-surface', 'text-text', 'border-text/10');
    expect(
      screen
        .getByRole('heading', { name: 'Should you upgrade?' })
        .closest('section'),
    ).not.toHaveClass('bg-linear-to-br');

    const interviewerScreenshot = screen.getByRole('img', {
      name: 'Interviewer dashboard showing protocol cards and a resume interview action',
    });
    expect(interviewerScreenshot.parentElement).toHaveClass('bg-white');
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
  });
});
