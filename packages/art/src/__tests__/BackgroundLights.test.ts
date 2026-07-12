import { describe, expect, it } from 'vitest';

import {
  isDomLightWithinWrapBounds,
  MAX_INITIAL_OFFSCREEN_LEAD_SECONDS,
  placeDomLightInitial,
  wrapDomLightPosition,
} from '../BackgroundLights/BackgroundLights';

const sequenceRandom = (values: number[]) => {
  let index = 0;
  return (min: number, max: number) => {
    const value = values[index++] ?? min;
    expect(value).toBeGreaterThanOrEqual(min);
    expect(value).toBeLessThanOrEqual(max);
    return value;
  };
};

describe('wrapDomLightPosition', () => {
  it('wraps a light exiting left to the right viewport edge', () => {
    const light = { x: -801, y: 100, size: 800 };

    wrapDomLightPosition(light, 1000, 700);

    expect(light.x).toBe(1000);
    expect(light.y).toBe(100);
  });

  it('wraps a light exiting top to the bottom viewport edge', () => {
    const light = { x: 100, y: -801, size: 800 };

    wrapDomLightPosition(light, 1000, 700);

    expect(light.x).toBe(100);
    expect(light.y).toBe(700);
  });

  it('wraps right and bottom exits to the negative element size', () => {
    const light = { x: 1001, y: 701, size: 800 };

    wrapDomLightPosition(light, 1000, 700);

    expect(light.x).toBe(-800);
    expect(light.y).toBe(-800);
  });

  it('does not move a light still inside the wrap bounds', () => {
    const light = { x: -800, y: 700, size: 800 };

    wrapDomLightPosition(light, 1000, 700);

    expect(light).toEqual({ x: -800, y: 700, size: 800 });
  });
});

describe('placeDomLightInitial', () => {
  it('can place a light immediately inside the viewport density band', () => {
    const light = {
      light: { velocityX: 10, velocityY: 0 },
      x: 0,
      y: 0,
      size: 200,
      hasEntered: false,
    };

    placeDomLightInitial(light, 1000, 700, sequenceRandom([0.75, 300, 250]));

    expect(light.x).toBe(300);
    expect(light.y).toBe(250);
    expect(light.hasEntered).toBe(true);
  });

  it('places a left-side offscreen light on a path that enters the viewport', () => {
    const light = {
      light: { velocityX: 10, velocityY: 5 },
      x: 0,
      y: 0,
      size: 200,
      hasEntered: false,
    };

    placeDomLightInitial(light, 1000, 700, sequenceRandom([0.25, 0, 30, 200]));

    expect(light.x).toBe(-230);
    expect(light.y).toBe(185);
    expect(light.hasEntered).toBe(false);

    const secondsUntilVisible = (-light.size - light.x) / light.light.velocityX;
    const entryPosition = {
      ...light,
      x: light.x + light.light.velocityX * secondsUntilVisible,
      y: light.y + light.light.velocityY * secondsUntilVisible,
    };

    expect(secondsUntilVisible).toBe(3);
    expect(isDomLightWithinWrapBounds(entryPosition, 1000, 700)).toBe(true);
  });

  it('places a bottom-side offscreen light on a path that enters the viewport', () => {
    const light = {
      light: { velocityX: 0, velocityY: -20 },
      x: 0,
      y: 0,
      size: 200,
      hasEntered: false,
    };

    placeDomLightInitial(light, 1000, 700, sequenceRandom([0.25, 0, 40, 300]));

    expect(light.x).toBe(300);
    expect(light.y).toBe(740);
    expect(light.hasEntered).toBe(false);

    const secondsUntilVisible =
      (light.y - 700) / Math.abs(light.light.velocityY);
    const entryPosition = {
      ...light,
      x: light.x + light.light.velocityX * secondsUntilVisible,
      y: light.y + light.light.velocityY * secondsUntilVisible,
    };

    expect(secondsUntilVisible).toBe(2);
    expect(isDomLightWithinWrapBounds(entryPosition, 1000, 700)).toBe(true);
  });

  it('caps the offscreen distance by the maximum initial lead time', () => {
    const light = {
      light: { velocityX: 10, velocityY: 0 },
      x: 0,
      y: 0,
      size: 200,
      hasEntered: false,
    };

    placeDomLightInitial(
      light,
      1000,
      700,
      sequenceRandom([0.25, 0, 10 * MAX_INITIAL_OFFSCREEN_LEAD_SECONDS, 200]),
    );

    const secondsUntilVisible = (-light.size - light.x) / light.light.velocityX;

    expect(secondsUntilVisible).toBe(MAX_INITIAL_OFFSCREEN_LEAD_SECONDS);
  });

  it('falls back to a visible placement when velocity cannot carry an offscreen light in', () => {
    const light = {
      light: { velocityX: 0, velocityY: 0 },
      x: 0,
      y: 0,
      size: 200,
      hasEntered: false,
    };

    placeDomLightInitial(light, 1000, 700, sequenceRandom([300, 250]));

    expect(light.x).toBe(300);
    expect(light.y).toBe(250);
    expect(light.hasEntered).toBe(true);
  });
});
