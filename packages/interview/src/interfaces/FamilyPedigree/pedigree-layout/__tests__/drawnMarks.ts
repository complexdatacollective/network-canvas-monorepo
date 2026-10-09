import type { Point } from '../types';

/** Every pair of numbers in an attribute, as points. */
export const coordinates = (text: string): Point[] => {
  const numbers = (text.match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? []).map(Number);
  const points: Point[] = [];
  for (let k = 0; k + 1 < numbers.length; k += 2) {
    points.push({ x: numbers[k]!, y: numbers[k + 1]! });
  }
  return points;
};

/** The kinds of mark the pedigree's renderer draws. */
const MARKS = new Set(['line', 'polyline', 'path', 'text']);

/**
 * Every mark drawn inside `container`, whatever its kind (groups aside). A
 * mark of a kind not known here fails, so a check over the marks cannot
 * leave a new kind unchecked.
 */
export function drawnMarks(container: Element): Element[] {
  const marks = Array.from(container.querySelectorAll('svg *')).filter(
    (element) => element.tagName !== 'g',
  );
  for (const mark of marks) {
    if (!MARKS.has(mark.tagName)) {
      throw new Error(`An unexpected <${mark.tagName}> is drawn`);
    }
  }
  return marks;
}

/**
 * The points a stroke runs through, in order: both ends of a line, every
 * point of a polyline, and every point a path moves or draws to (its arcs
 * carry radii and flags, not places). Undefined for a mark that is not a
 * stroke (text).
 */
export function strokePoints(mark: Element): Point[] | undefined {
  const number = (name: string) => Number(mark.getAttribute(name));
  switch (mark.tagName) {
    case 'line':
      return [
        { x: number('x1'), y: number('y1') },
        { x: number('x2'), y: number('y2') },
      ];
    case 'polyline':
      return coordinates(mark.getAttribute('points') ?? '');
    case 'path':
      return coordinates(
        (mark.getAttribute('d') ?? '').replace(/A[^A-Z]*?(?=[ML]|$)/g, ''),
      );
    default:
      return undefined;
  }
}

/**
 * Every place a mark covers: a stroke's points, and the whole of a text
 * mark, as far as its font size reaches either way from its anchor.
 */
export function markPlaces(mark: Element): Point[] {
  const stroke = strokePoints(mark);
  if (stroke) return stroke;
  const reach = Number(mark.getAttribute('font-size')) / 2;
  const [x, y] = [
    Number(mark.getAttribute('x')),
    Number(mark.getAttribute('y')),
  ];
  return [
    { x: x - reach, y: y - reach },
    { x: x + reach, y: y + reach },
  ];
}
