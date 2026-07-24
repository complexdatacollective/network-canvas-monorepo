import { cleanup, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '~/test/renderWithIntl';

import { GetStartedIntro } from '../GetStartedIntro';

const motionPreference = vi.hoisted<{ reduced: boolean | null }>(() => ({
  reduced: null,
}));
const animationControls = vi.hoisted(() => ({
  set: vi.fn(),
  start: vi.fn(() => Promise.resolve()),
}));
const heroDepartureStyle = vi.hoisted(() => ({ opacity: 'scroll-opacity' }));

type MotionProps = {
  animate?: unknown;
  children: ReactNode;
  className?: string;
  initial?: boolean | string;
  variants?: unknown;
  style?: unknown;
};

function MotionDiv({
  animate,
  children,
  className,
  initial,
  style,
  variants,
}: MotionProps) {
  return (
    <div
      className={className}
      data-animate={animate === animationControls ? 'controls' : 'none'}
      data-initial={initial === false ? 'false' : (initial ?? 'none')}
      data-scroll-style={style === heroDepartureStyle ? 'active' : 'none'}
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

vi.mock('~/components/ui/useHeroScrollDeparture', () => ({
  useHeroScrollDeparture: () => heroDepartureStyle,
}));

describe('GetStartedIntro', () => {
  beforeEach(() => {
    animationControls.set.mockClear();
    animationControls.start.mockClear();
    motionPreference.reduced = null;
  });

  afterEach(cleanup);

  it('renders all focusable starting paths', () => {
    renderWithIntl(<GetStartedIntro />);

    const documentationLink = screen.getByRole('link', {
      name: 'Learn more about the project — opens the documentation in a new tab',
    });

    expect(screen.getAllByRole('link')[0]).toBe(documentationLink);
    expect(documentationLink.parentElement).toHaveClass('max-w-[1400px]');
    expect(
      screen.getByText(
        'Start by clicking the card that best describes the stage you are at with your research.',
      ),
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole('heading', { level: 1 })
        .closest('[data-scroll-style="active"]'),
    ).toBeInTheDocument();
    expect(documentationLink).toHaveClass('relative', 'pb-24');
    expect(screen.getByText('Learn more about the project')).toHaveClass(
      'mt-8',
      'text-xl',
      'tablet-portrait:text-2xl',
    );
    expect(
      screen.getByText('Design or create an interview protocol'),
    ).toHaveClass('text-xl', 'tablet-portrait:text-2xl');
    expect(screen.getByText('Collect data using Network Canvas')).toHaveClass(
      'text-xl',
      'tablet-portrait:text-2xl',
    );
    expect(documentationLink.querySelector('svg')?.parentElement).toHaveClass(
      'absolute',
      'right-8',
      'bottom-8',
    );

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
    expect(documentationLink).toHaveAttribute(
      'href',
      'https://documentation.networkcanvas.com/',
    );
    expect(documentationLink).toHaveAttribute('target', '_blank');
  });

  it('keeps reduced-motion content visible without scheduling an entrance', () => {
    motionPreference.reduced = true;
    const { container } = renderWithIntl(<GetStartedIntro />);

    expect(container.firstElementChild).toHaveAttribute(
      'data-entrance-pending',
    );
    expect(container.firstElementChild?.firstElementChild).toHaveAttribute(
      'data-initial',
      'false',
    );
    expect(animationControls.set).not.toHaveBeenCalled();
    expect(animationControls.start).not.toHaveBeenCalled();
  });

  it('starts the coordinated entrance after normal-motion hydration', () => {
    motionPreference.reduced = false;
    renderWithIntl(<GetStartedIntro />);

    expect(animationControls.set).toHaveBeenCalledWith('hidden');
    expect(animationControls.start).toHaveBeenCalledWith('visible');
    expect(animationControls.set).toHaveBeenCalledBefore(
      animationControls.start,
    );
    expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass(
      'entrance-motion-item',
    );
    expect(
      screen.getByRole('link', {
        name: 'Design or create an interview protocol',
      }),
    ).toHaveClass('entrance-motion-item');
    expect(
      screen
        .getByRole('heading', { level: 1 })
        .closest('[data-entrance-pending]'),
    ).toBeNull();
  });

  it('localizes the stage choices', () => {
    renderWithIntl(<GetStartedIntro />, 'es');

    expect(
      screen.getByRole('heading', {
        name: 'Elija por dónde empezar',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Para empezar, haga clic en la tarjeta que mejor describa en qué etapa se encuentra su investigación y su familiaridad con Network Canvas.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: 'Diseñar o crear un protocolo de entrevista',
      }),
    ).toHaveAttribute('href', '#design');
    expect(
      screen.getByRole('link', {
        name: 'Conocer el proyecto — abre la documentación en una pestaña nueva',
      }),
    ).toHaveAttribute('href', 'https://documentation.networkcanvas.com/');
  });
});
