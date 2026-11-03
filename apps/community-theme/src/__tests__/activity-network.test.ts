import { describe, expect, it } from 'vitest';

import { layoutActivityNetwork } from '../../theme/javascripts/discourse/lib/activity-network.js';

const WIDTH = 400;
const HEIGHT = 300;
// The drawing's largest avatar with its ring, its discussion dots, and the
// space that keeps two outlines from touching (activity-network.gjs).
const LARGEST_RADIUS = 21;
const TOPIC_RADIUS = 11;
const CLEARANCE = 6;

type Point = { x: number; y: number };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

// Eight discussions: the team (1) answers all of them, a second regular (2)
// most, and everyone else posts once, in the discussion they started.
const topics = Array.from({ length: 8 }, (_, index) => ({
  id: 100 + index,
  posterIds: [10 + index, 1, ...(index % 4 === 3 ? [] : [2])],
}));

describe('the activity network layout', () => {
  const layout = layoutActivityNetwork(topics, {
    width: WIDTH,
    height: HEIGHT,
  });
  const person = (id: number) => {
    const found = layout.people.find((candidate) => candidate.id === id);
    if (!found) throw new Error(`person ${id} was not placed`);
    return found;
  };
  const topic = (id: number) => {
    const found = layout.topics.find((candidate) => candidate.id === id);
    if (!found) throw new Error(`topic ${id} was not placed`);
    return found;
  };

  it('places each discussion and each person once, inside the drawing', () => {
    expect(layout.topics.map((placed) => placed.id)).toEqual(
      topics.map((placed) => placed.id),
    );
    expect(new Set(layout.people.map((placed) => placed.id)).size).toBe(
      layout.people.length,
    );
    expect(layout.people).toHaveLength(10);
    for (const node of [...layout.topics, ...layout.people]) {
      expect(node.x).toBeGreaterThanOrEqual(LARGEST_RADIUS);
      expect(node.x).toBeLessThanOrEqual(WIDTH - LARGEST_RADIUS);
      expect(node.y).toBeGreaterThanOrEqual(LARGEST_RADIUS);
      expect(node.y).toBeLessThanOrEqual(HEIGHT - LARGEST_RADIUS);
    }
  });

  it('puts the people who posted all round the ring in the middle', () => {
    const centre = { x: WIDTH / 2, y: HEIGHT / 2 };
    expect(person(1).hub).toBe(true);
    expect(person(2).hub).toBe(true);
    expect(distance(person(1), centre)).toBeLessThan(50);
    expect(distance(person(2), centre)).toBeLessThan(50);
  });

  it('puts someone who posted once beside their discussion', () => {
    for (const [index, discussion] of topics.entries()) {
      const author = person(10 + index);
      expect(author.hub).toBe(false);
      const nearest = layout.topics.toSorted(
        (a, b) => distance(author, a) - distance(author, b),
      )[0];
      expect(nearest?.id).toBe(discussion.id);
    }
  });

  it('keeps people clear of each other and of the discussions', () => {
    for (const [i, a] of layout.people.entries()) {
      for (const b of layout.people.slice(i + 1)) {
        expect(distance(a, b)).toBeGreaterThan(2 * LARGEST_RADIUS + CLEARANCE);
      }
      for (const discussion of layout.topics) {
        expect(distance(a, discussion)).toBeGreaterThan(
          LARGEST_RADIUS + TOPIC_RADIUS + CLEARANCE,
        );
      }
    }
  });

  it('links each person to every discussion they posted in', () => {
    expect(layout.links).toHaveLength(
      topics.reduce((sum, placed) => sum + placed.posterIds.length, 0),
    );
    for (const link of layout.links) {
      expect({ x: link.x1, y: link.y1 }).toEqual({
        x: person(link.personId).x,
        y: person(link.personId).y,
      });
      expect({ x: link.x2, y: link.y2 }).toEqual({
        x: topic(link.topicId).x,
        y: topic(link.topicId).y,
      });
    }
  });

  it('keeps the most active people when there are too many to draw', () => {
    const capped = layoutActivityNetwork(topics, { maxPeople: 3 });
    expect(
      capped.people.map((placed) => placed.id).toSorted((a, b) => a - b),
    ).toEqual([1, 2, 10]);
    expect(
      capped.links.every((link) =>
        capped.people.some((placed) => placed.id === link.personId),
      ),
    ).toBe(true);
  });

  it('draws nothing when there are no discussions', () => {
    expect(layoutActivityNetwork([])).toEqual({
      topics: [],
      people: [],
      links: [],
    });
  });
});
