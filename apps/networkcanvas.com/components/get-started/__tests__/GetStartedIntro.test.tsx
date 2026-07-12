import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GetStartedIntro } from '../GetStartedIntro';

const motionPreference = vi.hoisted<{ reduced: boolean | null }>(() => ({
  reduced: null,
}));
const animationControls = vi.hoisted(() => ({
  set: vi.fn(),
  start: vi.fn(() => Promise.resolve()),
}));

type MotionProps = {
  animate?: unknown;
  children: ReactNode;
  className?: string;
  initial?: boolean | string;
  variants?: unknown;
};

function MotionDiv({
  animate,
  children,
  className,
  initial,
  variants,
}: MotionProps) {
  return (
    <div
      className={className}
      data-animate={animate === animationControls ? 'controls' : 'none'}
      data-initial={initial === false ? 'false' : (initial ?? 'none')}
      data-variants={variants ? 'active' : 'none'}
    >
      {children}
    </div>
  );
}

type MotionAnchorProps = ComponentProps<'a'> & MotionProps;

function MotionAnchor({
  animate,
  children,
  initial,
  variants,
  ...props
}: MotionAnchorProps) {
  return (
    <a
      {...props}
      data-animate={animate === animationControls ? 'controls' : 'none'}
      data-initial={initial === false ? 'false' : (initial ?? 'none')}
      data-variants={variants ? 'active' : 'none'}
    >
      {children}
    </a>
  );
}

vi.mock('motion/react', () => ({
  motion: {
    div: MotionDiv,
    a: MotionAnchor,
  },
  useAnimationControls: () => animationControls,
  useReducedMotion: () => motionPreference.reduced,
}));

vi.mock('~/components/layout/Header', () => ({
  Header: ({ entranceVariants }: { entranceVariants?: unknown }) => (
    <div data-header-variants={entranceVariants ? 'active' : 'none'}>
      Header
    </div>
  ),
}));

describe('GetStartedIntro', () => {
  beforeEach(() => {
    animationControls.set.mockClear();
    animationControls.start.mockClear();
    motionPreference.reduced = null;
  });

  afterEach(cleanup);

  it('renders both focusable workflow paths', () => {
    render(<GetStartedIntro />);

    expect(
      screen.getByRole('link', {
        name: 'Design or create an interview protocol',
      }),
    ).toHaveClass('focusable');
    expect(
      screen.getByRole('link', {
        name: 'Collect data using Network Canvas',
      }),
    ).toHaveClass('focusable');
  });

  it('uses Fresco typography without changing the intro spacing', () => {
    render(<GetStartedIntro />);

    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'What would you like to do?',
    });
    const eyebrow = screen.getByText('Choose your workflow');
    const description = screen.getByText(
      'Start with your research task, then choose the Network Canvas app that fits your study.',
    );

    expect(heading).toHaveClass('scroll-m-20', 'mt-5!', 'text-4xl');
    expect(eyebrow).toHaveClass('text-pretty', 'opacity-100', 'font-heading');
    expect(description).toHaveClass('font-body', 'mt-6', 'text-lg');
    expect(description).not.toHaveClass('not-last:mb-[1em]');
  });

  it('keeps reduced-motion content visible without scheduling an entrance', () => {
    motionPreference.reduced = true;
    const { container } = render(<GetStartedIntro />);

    expect(container.firstElementChild?.firstElementChild).toHaveAttribute(
      'data-initial',
      'false',
    );
    expect(animationControls.set).not.toHaveBeenCalled();
    expect(animationControls.start).not.toHaveBeenCalled();
  });

  it('starts the coordinated entrance after normal-motion hydration', () => {
    motionPreference.reduced = false;
    render(<GetStartedIntro />);

    expect(animationControls.set).toHaveBeenCalledWith('hidden');
    expect(animationControls.start).toHaveBeenCalledWith('visible');
    expect(animationControls.set).toHaveBeenCalledBefore(
      animationControls.start,
    );
  });
});
