import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentPropsWithoutRef, ComponentType, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SummerUpdatePage } from '../SummerUpdatePage';

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
  motion: {
    create: (Component: ComponentType) => Component,
    div: MotionDiv,
  },
  useReducedMotion: () => true,
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

afterEach(cleanup);

describe('SummerUpdatePage', () => {
  it('links every Schema 8 explorer item to its relevant documentation', () => {
    render(<SummerUpdatePage />);

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
    expect(
      screen.getByRole('img', {
        name: 'The redesigned Network Canvas website homepage',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: 'The redesigned Network Canvas documentation homepage',
      }),
    ).toBeInTheDocument();
  });

  it('uses the shared dark treatment for section five and white browser frames', () => {
    render(<SummerUpdatePage />);

    expect(
      screen.getByRole('heading', { name: 'Should you upgrade?' }),
    ).toHaveClass('sr-only');
    expect(
      screen
        .getByRole('heading', { name: 'Should you upgrade?' })
        .closest('section'),
    ).toHaveClass('bg-linear-to-br');

    const interviewerScreenshot = screen.getByRole('img', {
      name: 'Interviewer dashboard showing protocol cards and a resume interview action',
    });
    expect(interviewerScreenshot.parentElement).toHaveClass('bg-white');
    expect(interviewerScreenshot.parentElement).not.toHaveClass(
      'bg-rich-black',
    );
  });
});
