import { describe, expect, it } from 'vitest';

import { slidePose } from '../slidePose';

const CARD_W = 400;
const CARD_H = 500;

describe('slidePose', () => {
  it('centres the active slide with no transform and full opacity', () => {
    const pose = slidePose(0, CARD_W, CARD_H);
    expect(pose.x).toBeCloseTo(0);
    expect(pose.y).toBeCloseTo(0);
    expect(pose.z).toBeCloseTo(0);
    expect(pose.rotateZ).toBeCloseTo(0);
    expect(pose.opacity).toBe(1);
  });

  it('spaces slides evenly, overlapping neighbours by less than a card width', () => {
    const one = slidePose(1, CARD_W, CARD_H).x;
    expect(one).toBeGreaterThan(0);
    expect(one).toBeLessThan(CARD_W);
    expect(slidePose(2, CARD_W, CARD_H).x).toBeCloseTo(2 * one);
    expect(slidePose(1, CARD_W * 2, CARD_H).x).toBeCloseTo(2 * one);
  });

  it('drops, recedes and rotates further the further a slide is from active', () => {
    const near = slidePose(1, CARD_W, CARD_H);
    const far = slidePose(2, CARD_W, CARD_H);
    expect(near.y).toBeGreaterThan(0);
    expect(far.y).toBeGreaterThan(near.y);
    expect(near.z).toBeLessThan(0);
    expect(far.z).toBeLessThan(near.z);
    expect(near.rotateZ).toBeGreaterThan(0);
    expect(far.rotateZ).toBeGreaterThan(near.rotateZ);
  });

  it('mirrors x and rotation for negative offsets but keeps y/z falling away', () => {
    const left = slidePose(-1.5, CARD_W, CARD_H);
    const right = slidePose(1.5, CARD_W, CARD_H);
    expect(left.x).toBeCloseTo(-right.x);
    expect(left.rotateZ).toBeCloseTo(-right.rotateZ);
    expect(left.y).toBeCloseTo(right.y);
    expect(left.z).toBeCloseTo(right.z);
  });

  it('plateaus opacity at 1 through |offset| 2, fades to 0 by 4', () => {
    expect(slidePose(2, CARD_W, CARD_H).opacity).toBe(1);
    expect(slidePose(3, CARD_W, CARD_H).opacity).toBeCloseTo(0.5);
    expect(slidePose(-3.5, CARD_W, CARD_H).opacity).toBeCloseTo(0.25);
    expect(slidePose(4, CARD_W, CARD_H).opacity).toBe(0);
    expect(slidePose(7, CARD_W, CARD_H).opacity).toBe(0);
  });
});
