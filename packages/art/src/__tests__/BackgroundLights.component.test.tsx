import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import BackgroundLights from '../BackgroundLights/BackgroundLights';

describe('BackgroundLights paused', () => {
  // Frames run only when a test flushes them, so a test can see whether the
  // drift is still asking for them.
  let frames = new Map<number, FrameRequestCallback>();
  let nextFrameId = 1;

  beforeEach(() => {
    frames = new Map();
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(
      (callback) => {
        const id = nextFrameId++;
        frames.set(id, callback);
        return id;
      },
    );
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
    // A laid-out container, so the lights are placed and moved.
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function flushFrame(time: number) {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(time);
  }

  const transforms = (container: HTMLElement) =>
    [...(container.querySelector('[aria-hidden="true"]')?.children ?? [])].map(
      (light) => (light as HTMLElement).style.transform,
    );

  const lights = (paused: boolean) => (
    <BackgroundLights
      large={0}
      medium={3}
      small={0}
      speedFactor={30}
      paused={paused}
    />
  );

  it('stops drifting while paused, and drifts again when it is cleared', () => {
    const { rerender } = render(lights(false));
    expect(frames.size).toBe(1);

    rerender(lights(true));
    expect(frames.size).toBe(0);

    rerender(lights(false));
    expect(frames.size).toBe(1);
  });

  it('places the lights but does not drift when mounted paused', () => {
    const { container } = render(lights(true));

    expect(frames.size).toBe(0);
    expect(
      transforms(container).every((t) => t.startsWith('translate3d')),
    ).toBe(true);
  });

  it('carries on from where it stopped rather than jumping', () => {
    const { container, rerender } = render(lights(false));
    flushFrame(0);
    flushFrame(16);
    const beforePause = transforms(container);

    rerender(lights(true));
    rerender(lights(false));
    flushFrame(60_016);

    expect(transforms(container)).toEqual(beforePause);
    flushFrame(60_032);
    expect(transforms(container)).not.toEqual(beforePause);
  });
});

describe('BackgroundLights component', () => {
  it('renders one DOM light per configured blob count', () => {
    const { container } = render(
      <BackgroundLights
        large={1}
        medium={2}
        small={3}
        colors={['#ff0000']}
        blendMode="color-dodge"
      />,
    );

    const root = container.querySelector('[aria-hidden="true"]');
    expect(root).not.toBeNull();
    expect(root?.children).toHaveLength(6);

    const lights = [...(root?.children ?? [])] as HTMLElement[];
    for (const light of lights) {
      expect(light.style.background).toContain('radial-gradient');
      expect(light.style.background).toContain('rgb(255, 0, 0)');
      expect(light.style.mixBlendMode).toBe('color-dodge');
    }
  });

  it('renders no light elements when all layer counts are zero', () => {
    const { container } = render(
      <BackgroundLights large={0} medium={0} small={0} />,
    );

    const root = container.querySelector('[aria-hidden="true"]');
    expect(root).not.toBeNull();
    expect(root?.children).toHaveLength(0);
  });
});
