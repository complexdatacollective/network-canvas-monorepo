import { render, screen } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NewsItem } from '~/lib/siteContent';

import { HeroIntro } from '../HeroIntro';

const newsItems: NewsItem[] = [
  {
    id: 'fixture-news',
    title: 'Fixture-only intro news',
    href: 'https://example.com/news',
  },
];

const backgroundProps = vi.hoisted(() => vi.fn());
const motionPreference = vi.hoisted<{ reduced: boolean | null }>(() => ({
  reduced: null,
}));
const animationControls = vi.hoisted(() => ({
  set: vi.fn(),
  start: vi.fn(() => Promise.resolve()),
}));

type MotionDivProps = {
  animate?: unknown;
  children: ReactNode;
  className?: string;
  initial?: boolean | string;
  variants?: unknown;
};

function formatInitial(initial: boolean | string | undefined) {
  return initial === false ? 'false' : (initial ?? 'none');
}

function MotionDiv({
  animate,
  children,
  className,
  initial,
  variants,
}: MotionDivProps) {
  return (
    <div
      className={className}
      data-animate={animate === animationControls ? 'controls' : 'none'}
      data-initial={formatInitial(initial)}
      data-motion-root
      data-variants={variants ? 'active' : 'none'}
    >
      {children}
    </div>
  );
}

vi.mock('motion/react', () => ({
  motion: { div: MotionDiv },
  useAnimationControls: () => animationControls,
  useReducedMotion: () => motionPreference.reduced,
}));

vi.mock('@codaco/art', () => ({
  BackgroundLights: (props: unknown) => {
    backgroundProps(props);
    return null;
  },
}));

vi.mock('~/components/layout/Header', () => ({
  Header: ({ entranceVariants }: { entranceVariants?: unknown }) => (
    <div data-header-variants={entranceVariants ? 'active' : 'none'}>
      Header content
    </div>
  ),
}));

vi.mock('~/components/sections/Hero', () => ({
  Hero: ({
    containerVariants,
    itemVariants,
    newsItems: heroNewsItems,
  }: {
    containerVariants?: unknown;
    itemVariants?: unknown;
    newsItems: readonly NewsItem[];
  }) => (
    <div
      data-hero-container-variants={containerVariants ? 'active' : 'none'}
      data-hero-item-variants={itemVariants ? 'active' : 'none'}
    >
      Hero content: {heroNewsItems[0]?.title}
    </div>
  ),
}));

describe('HeroIntro', () => {
  beforeEach(() => {
    animationControls.set.mockClear();
    animationControls.start.mockClear();
    backgroundProps.mockClear();
    motionPreference.reduced = null;
  });

  it('renders the header and hero without owning the page background', () => {
    motionPreference.reduced = false;
    render(<HeroIntro newsItems={newsItems} />);
    const shell =
      screen.getByText('Header content').parentElement?.parentElement;
    const motionRoot = shell?.firstElementChild;

    expect(screen.getByText('Header content')).toBeInTheDocument();
    expect(
      screen.getByText('Hero content: Fixture-only intro news'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Network Canvas wins INSNA Award'),
    ).not.toBeInTheDocument();
    expect(backgroundProps).not.toHaveBeenCalled();
    expect(shell).toHaveClass('tablet-portrait:min-h-svh');
    expect(motionRoot).toHaveClass(
      'tablet-portrait:flex',
      'tablet-portrait:min-h-svh',
      'tablet-portrait:flex-col',
    );
  });

  it('renders visible static server markup before the motion preference resolves', () => {
    const serverMarkup = renderToString(<HeroIntro newsItems={newsItems} />);
    const container = document.createElement('div');
    container.innerHTML = serverMarkup;

    expect(container.querySelector('[data-motion-root]')).toHaveAttribute(
      'data-initial',
      'false',
    );
    expect(container.querySelector('[data-motion-root]')).toHaveAttribute(
      'data-animate',
      'controls',
    );
    expect(container.querySelector('[data-motion-root]')).toHaveAttribute(
      'data-variants',
      'active',
    );
    expect(container.querySelector('[data-header-variants]')).toHaveAttribute(
      'data-header-variants',
      'active',
    );
    expect(
      container.querySelector('[data-hero-container-variants]'),
    ).toHaveAttribute('data-hero-container-variants', 'active');
    expect(
      container.querySelector('[data-hero-item-variants]'),
    ).toHaveAttribute('data-hero-item-variants', 'active');
  });

  it('hydrates reduced-motion users without activating entrance motion', async () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(<HeroIntro newsItems={newsItems} />);
    const serverMotionRoot = container.querySelector('[data-motion-root]');
    document.body.append(container);
    motionPreference.reduced = true;
    const recoverableError = vi.fn();

    const root = hydrateRoot(container, <HeroIntro newsItems={newsItems} />, {
      onRecoverableError: recoverableError,
    });
    await act(async () => {});

    expect(recoverableError).not.toHaveBeenCalled();
    expect(container.querySelector('[data-motion-root]')).toBe(
      serverMotionRoot,
    );
    expect(container.querySelector('[data-motion-root]')).toHaveAttribute(
      'data-animate',
      'controls',
    );
    expect(container.querySelector('[data-motion-root]')).toHaveAttribute(
      'data-variants',
      'active',
    );
    expect(container.querySelector('[data-header-variants]')).toHaveAttribute(
      'data-header-variants',
      'active',
    );
    expect(
      container.querySelector('[data-hero-container-variants]'),
    ).toHaveAttribute('data-hero-container-variants', 'active');
    expect(
      container.querySelector('[data-hero-item-variants]'),
    ).toHaveAttribute('data-hero-item-variants', 'active');
    expect(animationControls.set).not.toHaveBeenCalled();
    expect(animationControls.start).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    container.remove();
  });

  it('activates the coordinated entrance only after normal-motion hydration', async () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(<HeroIntro newsItems={newsItems} />);
    const serverMotionRoot = container.querySelector('[data-motion-root]');
    document.body.append(container);
    motionPreference.reduced = false;
    const recoverableError = vi.fn();

    const root = hydrateRoot(container, <HeroIntro newsItems={newsItems} />, {
      onRecoverableError: recoverableError,
    });
    await act(async () => {});

    expect(recoverableError).not.toHaveBeenCalled();
    expect(container.querySelector('[data-motion-root]')).toBe(
      serverMotionRoot,
    );
    expect(container.querySelector('[data-motion-root]')).toHaveAttribute(
      'data-animate',
      'controls',
    );
    expect(container.querySelector('[data-motion-root]')).toHaveAttribute(
      'data-variants',
      'active',
    );
    expect(container.querySelector('[data-header-variants]')).toHaveAttribute(
      'data-header-variants',
      'active',
    );
    expect(
      container.querySelector('[data-hero-container-variants]'),
    ).toHaveAttribute('data-hero-container-variants', 'active');
    expect(
      container.querySelector('[data-hero-item-variants]'),
    ).toHaveAttribute('data-hero-item-variants', 'active');
    expect(animationControls.set).toHaveBeenCalledOnce();
    expect(animationControls.set).toHaveBeenCalledWith('hidden');
    expect(animationControls.start).toHaveBeenCalledOnce();
    expect(animationControls.start).toHaveBeenCalledWith('visible');
    expect(animationControls.set).toHaveBeenCalledBefore(
      animationControls.start,
    );

    await act(async () => root.unmount());
    container.remove();
  });
});
