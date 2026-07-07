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

  it('strides 0.7 card widths per offset step', () => {
    expect(slidePose(1, CARD_W, CARD_H).x).toBeCloseTo(280);
    expect(slidePose(-2, CARD_W, CARD_H).x).toBeCloseTo(-560);
  });

  it('drops, recedes, and rotates proportionally to offset', () => {
    const pose = slidePose(2, CARD_W, CARD_H);
    expect(pose.y).toBeCloseTo(0.04 * 2 * CARD_H);
    expect(pose.z).toBeCloseTo(-800);
    expect(pose.rotateZ).toBeCloseTo(6);
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
