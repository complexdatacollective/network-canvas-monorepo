import { renderHook } from '@testing-library/react';
import { act, createRef, useRef } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { heroScrollSpring } from '../scrollDrivenMotion';
import { useHeroScrollDeparture } from '../useHeroScrollDeparture';

const motion = vi.hoisted(() => {
  const scrollYProgress = { id: 'scroll-progress' };
  const smoothProgress = { id: 'smooth-progress' };
  const transformedValue = { id: 'transformed-value' };

  return {
    reducedMotion: false as boolean | null,
    scrollYProgress,
    smoothProgress,
    transformedValue,
    useScroll: vi.fn(() => ({ scrollYProgress })),
    useSpring: vi.fn(() => smoothProgress),
    useTransform: vi.fn(() => transformedValue),
  };
});

vi.mock('motion/react', () => ({
  useReducedMotion: () => motion.reducedMotion,
  useScroll: motion.useScroll,
  useSpring: motion.useSpring,
  useTransform: motion.useTransform,
}));

function HeroDepartureFixture() {
  const target = useRef<HTMLDivElement>(null);
  const style = useHeroScrollDeparture(target);

  return <div ref={target} data-scroll-style={style ? 'active' : 'static'} />;
}

describe('useHeroScrollDeparture', () => {
  beforeEach(() => {
    motion.reducedMotion = false;
    motion.useScroll.mockClear();
    motion.useSpring.mockClear();
    motion.useTransform.mockClear();
  });

  it('maps the hero journey to a spring-smoothed departure', () => {
    const target = createRef<HTMLDivElement>();
    const { result } = renderHook(() =>
      useHeroScrollDeparture(target, {
        distance: 80,
        restingScale: 0.95,
      }),
    );

    expect(motion.useScroll).toHaveBeenCalledWith({
      target,
      offset: ['start start', 'end start'],
    });
    expect(motion.useSpring).toHaveBeenCalledWith(
      motion.scrollYProgress,
      heroScrollSpring,
    );
    expect(motion.useTransform).toHaveBeenNthCalledWith(
      1,
      motion.smoothProgress,
      [0, 0.58, 0.98],
      [1, 0.94, 0],
    );
    expect(motion.useTransform).toHaveBeenNthCalledWith(
      2,
      motion.smoothProgress,
      [0, 0.68, 1],
      [1, 0.985, 0.95],
    );
    expect(motion.useTransform).toHaveBeenNthCalledWith(
      3,
      motion.smoothProgress,
      [0, 1],
      [0, -80],
    );
    expect(result.current).toEqual({
      opacity: motion.transformedValue,
      scale: motion.transformedValue,
      y: motion.transformedValue,
    });
  });

  it.each([true, null])(
    'keeps content static when reduced motion is %s',
    (reducedMotion) => {
      motion.reducedMotion = reducedMotion;
      const target = createRef<HTMLDivElement>();
      const { result } = renderHook(() => useHeroScrollDeparture(target));

      expect(result.current).toBeUndefined();
    },
  );

  it('hydrates static markup before attaching scroll styles', async () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(<HeroDepartureFixture />);
    document.body.append(container);

    expect(container.firstElementChild).toHaveAttribute(
      'data-scroll-style',
      'static',
    );

    const recoverableError = vi.fn();
    const root = hydrateRoot(container, <HeroDepartureFixture />, {
      onRecoverableError: recoverableError,
    });
    await act(async () => {});

    expect(recoverableError).not.toHaveBeenCalled();
    expect(container.firstElementChild).toHaveAttribute(
      'data-scroll-style',
      'active',
    );

    await act(async () => root.unmount());
    container.remove();
  });
});
