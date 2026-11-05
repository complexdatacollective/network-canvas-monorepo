import { describe, expect, it } from 'vitest';

import { principles } from '~/lib/content';

import {
  ANSWER,
  ANSWER_BUBBLE,
  ANSWER_SAID,
  ANSWER_SIZE,
  ANSWER_SLOT,
  ANSWER_TRAIL,
  answerMarked,
  answerRecorded,
  answerSlotShown,
  cameraTransform,
  COMMUNITY_CONFIG,
  deviceFrame,
  edgeFrame,
  edges,
  FORM_BOXES,
  FORM_COLORS,
  formAt,
  formBlend,
  INSTITUTIONS,
  institutionShown,
  INTERVIEWER_CONFIG,
  interviewBeats,
  lightCrossFades,
  lightLevels,
  LIST_ENTER,
  LIST_SLOTS,
  nodeFrame,
  nodeLayers,
  PROJECT_RADIUS,
  projectShown,
  PROMPT_BUBBLE,
  promptArrived,
  sceneryWeight,
  scenePhase,
  SLOT_RADIUS,
  SLOT_STROKE,
  trailShown,
  VIEW_WIDTH,
  voicesGone,
  WORKFLOW_CONFIG,
  WORKFLOW_LINE,
  workflowLine,
} from '../designPrinciplesGeometry';

const cardCount = principles.length;

// The form on screen while the reader is at `focus` (in cards; 0.5 is the
// middle of the first) with the first card fully arrived.
const formWhileReading = (focus: number) =>
  formAt(scenePhase(1, focus, cardCount));

describe('scenePhase', () => {
  it('shows only the seed until the first card comes up to the reading line', () => {
    expect(formAt(scenePhase(0, 0, cardCount))).toBe(0);
  });

  it('gives every principle its own form, the last included', () => {
    expect(cardCount).toBeGreaterThan(0);
    const forms = principles.map((_, index) => formWhileReading(index + 0.5));
    // Form 0 is the seed and form 1 the plain network; card i shows i + 2.
    expect(forms).toEqual(principles.map((_, index) => index + 2));
  });

  it('holds each form for most of its card', () => {
    // The first card shows the plain network until its middle, so its hold
    // starts there; every later card holds from 0.2 of the way in.
    for (let index = 0; index < cardCount; index++) {
      const from = index === 0 ? 0.5 : index + 0.2;
      for (const focus of [from, index + 0.5, index + 0.8]) {
        expect(formWhileReading(focus), `focus ${focus}`).toBe(index + 2);
      }
    }
  });

  it('rests on the last form after the last card', () => {
    expect(scenePhase(1, cardCount, cardCount)).toBe(cardCount + 1);
    expect(formWhileReading(cardCount + 1)).toBe(cardCount + 1);
  });

  it('moves forward continuously as the reader scrolls', () => {
    // Scrubbed by scroll, the scene must never jump or step backwards: sweep
    // the whole section, entry first and then the cards.
    const steps = 4000;
    let previous = scenePhase(0, 0, cardCount);
    let largestStep = 0;
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      // The first fifth of the sweep is the entry, the rest the reading.
      const entry = Math.min(1, t * 5);
      const focus = Math.max(0, (t - 0.2) / 0.8) * cardCount;
      const phase = scenePhase(entry, focus, cardCount);
      expect(phase, `t ${t}`).toBeGreaterThanOrEqual(previous);
      largestStep = Math.max(largestStep, phase - previous);
      previous = phase;
    }
    expect(previous).toBe(cardCount + 1);
    expect(largestStep).toBeLessThan(0.02);
  });
});

describe('the canvas light', () => {
  // The colour the canvas is fully lit with at a phase, or null mid-move.
  const litWith = (phase: number) => {
    const { from, to, mix } = formBlend(phase);
    if (mix === 0) return FORM_COLORS[from];
    if (mix === 1) return FORM_COLORS[to];
    return null;
  };

  it('lights the canvas in a different colour for each principle', () => {
    const colours = principles.map((_, index) =>
      litWith(scenePhase(1, index + 0.5, cardCount)),
    );
    expect(colours.every((colour) => colour !== null)).toBe(true);
    expect(new Set(colours).size).toBe(cardCount);
  });
});

describe('nodeFrame and edgeFrame', () => {
  it('keeps every drawn edge on its nodes through each move', () => {
    // The network's moves overshoot and settle; an edge must follow its nodes
    // exactly, or it detaches mid-move.
    let checked = 0;
    for (let step = 0; step <= 600; step++) {
      const phase = step / 100;
      for (const edge of edges) {
        const frame = edgeFrame(edge, phase);
        const ends = /^M(-?[\d.]+) (-?[\d.]+)Q.* (-?[\d.]+) (-?[\d.]+)$/.exec(
          frame.d,
        );
        if (!ends || frame.drawn === 0) continue;
        // The person the interview asks about leaves their place and comes
        // back to it; their edges stay at their place, the slot.
        const end = (i: number) =>
          i === ANSWER &&
          phase > INTERVIEWER_CONFIG - 1 &&
          phase < INTERVIEWER_CONFIG + 1
            ? ANSWER_SLOT
            : nodeFrame(i, phase);
        const a = end(edge.a);
        const b = end(edge.b);
        expect(Number(ends[1])).toBeCloseTo(a.x, 0);
        expect(Number(ends[2])).toBeCloseTo(a.y, 0);
        expect(Number(ends[3])).toBeCloseTo(b.x, 0);
        expect(Number(ends[4])).toBeCloseTo(b.y, 0);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

// The two forms these principles show, by phase (card i shows form i + 2).
const INTERVIEWER_CARD = INTERVIEWER_CONFIG - 2;
const WORKFLOW_CARD = WORKFLOW_CONFIG - 2;
const NODE_COUNT = 9;
const phaseWhileReading = (focus: number) => scenePhase(1, focus, cardCount);

type Point = { x: number; y: number };

// Points along an absolute M/L/H/V/C/Q(/Z) path, its curves finely sampled.
function tracePath(d: string) {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? [];
  const points: Point[] = [];
  let i = 0;
  let command = '';
  let x = 0;
  let y = 0;
  const next = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i]!)) command = tokens[i++]!;
    if (command === 'M' || command === 'L') {
      x = next();
      y = next();
    } else if (command === 'H') x = next();
    else if (command === 'V') y = next();
    else if (command === 'C') {
      const [x1, y1, x2, y2, x3, y3] = Array.from({ length: 6 }, next) as [
        number,
        number,
        number,
        number,
        number,
        number,
      ];
      for (let step = 1; step < 64; step++) {
        const t = step / 64;
        const u = 1 - t;
        points.push({
          x: u ** 3 * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * x3,
          y: u ** 3 * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y3,
        });
      }
      x = x3;
      y = y3;
    } else if (command === 'Q') {
      const [x1, y1, x2, y2] = Array.from({ length: 4 }, next) as [
        number,
        number,
        number,
        number,
      ];
      for (let step = 1; step < 8; step++) {
        const t = step / 8;
        const u = 1 - t;
        points.push({
          x: u * u * x + 2 * u * t * x1 + t * t * x2,
          y: u * u * y + 2 * u * t * y1 + t * t * y2,
        });
      }
      x = x2;
      y = y2;
    } else if (command !== 'Z') {
      // Z closes the outline: the points already describe it.
      throw new Error(`Unexpected path command ${command}`);
    }
    points.push({ x, y });
  }
  return points;
}

// How far a point is from a traced line, and how far along the line its
// nearest point lies.
function nearest(line: Point[], p: Point) {
  let best = { distance: Infinity, along: 0 };
  let travelled = 0;
  for (let s = 1; s < line.length; s++) {
    const a = line[s - 1]!;
    const b = line[s]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const t =
      length === 0
        ? 0
        : Math.min(
            1,
            Math.max(
              0,
              ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) /
                length ** 2,
            ),
          );
    const distance = Math.hypot(
      a.x + t * (b.x - a.x) - p.x,
      a.y + t * (b.y - a.y) - p.y,
    );
    if (distance < best.distance) {
      best = { distance, along: travelled + t * length };
    }
    travelled += length;
  }
  return best;
}

// The camera at rest on a form, in a view `height` tall: its zoom, and the
// margins round the form's box (FORM_BOXES) in view units.
function viewed(form: number, height: number) {
  const camera = cameraTransform(form, height).match(
    /^scale\(([\d.]+)\) translate\((-?[\d.]+) (-?[\d.]+)\)$/,
  );
  expect(camera, `form ${form} in a view ${height} tall`).not.toBeNull();
  const [s, tx, ty] = camera!.slice(1).map(Number) as [number, number, number];
  const { x, y, w, h } = FORM_BOXES[form]!;
  return {
    s,
    margins: {
      left: VIEW_WIDTH / 2 + (x + tx) * s,
      right: VIEW_WIDTH / 2 - (x + w + tx) * s,
      top: height / 2 + (y + ty) * s,
      bottom: height / 2 - (y + h + ty) * s,
    },
  };
}

// A node's outline at rest on a form, in world units.
function nodeOutline(i: number, form: number) {
  const frame = nodeFrame(i, form);
  return tracePath(frame.d).map((p) => ({
    x: frame.x + p.x * frame.scale,
    y: frame.y + p.y * frame.scale,
  }));
}

const bounds = (points: Point[]) => ({
  left: Math.min(...points.map((p) => p.x)),
  right: Math.max(...points.map((p) => p.x)),
  top: Math.min(...points.map((p) => p.y)),
  bottom: Math.max(...points.map((p) => p.y)),
});

// Whether a point lies inside a closed outline (even-odd rule).
function inside(outline: Point[], p: Point) {
  let crossings = 0;
  outline.forEach((a, k) => {
    const b = outline[(k + 1) % outline.length]!;
    if (a.y > p.y !== b.y > p.y) {
      const x = a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x);
      if (x > p.x) crossings++;
    }
  });
  return crossings % 2 === 1;
}

describe('the interviewer-assisted form', () => {
  const form = INTERVIEWER_CONFIG;
  // The reading through the move in, the card and the move out, finely; the
  // scene follows the reader, as the section drives it.
  const readings = Array.from(
    { length: 1201 },
    (_, step) => INTERVIEWER_CARD - 0.5 + step / 600,
  );
  // The person the interview asks about: their radius in a frame.
  const restScale = nodeFrame(ANSWER, form2).scale;
  const radiusOf = (frame: { scale: number }) =>
    (ANSWER_SIZE * frame.scale) / restScale;
  const fromSlot = (frame: Point) =>
    Math.hypot(frame.x - ANSWER_SLOT.x, frame.y - ANSWER_SLOT.y);
  const SLOT_INNER = SLOT_RADIUS - SLOT_STROKE / 2;

  it('is the card on interviewer-assisted interviews', () => {
    expect(principles[INTERVIEWER_CARD]?.id).toBe('interviewerAssisted');
  });

  it('asks, then answers, then records, each once the last is done, after the device has formed', () => {
    const beats = ['ask', 'answer', 'record'] as const;
    const starts: Record<string, number> = {};
    const ends: Record<string, number> = {};
    for (const focus of readings) {
      const phase = phaseWhileReading(focus);
      const read = interviewBeats(phase, focus);
      for (const beat of beats) {
        if (read[beat] > 0) starts[beat] ??= focus;
        if (read[beat] === 1) ends[beat] ??= focus;
      }
      if (read.ask > 0) {
        // The screen has its size, and its frame is (all but) drawn.
        const device = deviceFrame(phase);
        expect(device.screen.w, `focus ${focus}`).toBe(
          deviceFrame(form).screen.w,
        );
        expect(device.bezel.drawn, `focus ${focus}`).toBeGreaterThan(0.95);
      }
    }
    for (const beat of beats) {
      expect(starts[beat], beat).toBeDefined();
      expect(ends[beat], beat).toBeDefined();
    }
    expect(ends.ask!).toBeLessThanOrEqual(starts.answer!);
    // A moment's rest before the answer is recorded.
    expect(starts.record! - ends.answer!).toBeGreaterThanOrEqual(0.03);
    // Each beat takes a tenth of the card or more, and all are done well
    // before the card leaves.
    for (const beat of beats) {
      expect(ends[beat]! - starts[beat]!, beat).toBeGreaterThanOrEqual(0.1);
    }
    expect(ends.record!).toBeLessThan(INTERVIEWER_CARD + 0.6);
  });

  it('empties the person from the screen only as they are asked about, the slot showing once they are inside it', () => {
    let emptied = 0;
    for (const focus of readings) {
      const phase = phaseWhileReading(focus);
      if (phase >= form + 1) break;
      const { ask, answer } = interviewBeats(phase, focus);
      const node = nodeFrame(ANSWER, phase, focus);
      const shown = answerSlotShown(phase, focus);
      if (ask === 0) {
        // Before anyone asks, no hole: the person is whole, in their place.
        expect(radiusOf(node), `focus ${focus}`).toBeCloseTo(ANSWER_SIZE, 6);
        expect(fromSlot(node), `focus ${focus}`).toBeLessThan(1e-6);
        expect(shown, `focus ${focus}`).toBe(0);
      } else if (answer === 0) {
        // As they are asked about, they empty where they stand, and the
        // slot shows only inside its inner edge: it never peeks out from
        // under them.
        expect(fromSlot(node), `focus ${focus}`).toBeLessThan(1e-6);
        if (shown > 0) {
          expect(radiusOf(node), `focus ${focus}`).toBeLessThan(SLOT_INNER);
          emptied++;
        }
      }
    }
    expect(emptied).toBeGreaterThan(5);
  });

  it('moves the answer from the participant to the screen, leaving no copy behind', () => {
    let previous: Point | null = null;
    let flown = 0;
    for (const focus of readings) {
      const phase = phaseWhileReading(focus);
      if (phase >= form + 1) break;
      const { answer, record } = interviewBeats(phase, focus);
      const node = nodeFrame(ANSWER, phase, focus);
      if (answer === 1 && record === 0) {
        // Said: the network's own node, in the participant's bubble.
        expect(node.x).toBeCloseTo(ANSWER_SAID.x, 6);
        expect(node.y).toBeCloseTo(ANSWER_SAID.y, 6);
        expect(radiusOf(node)).toBeCloseTo(ANSWER_SIZE, 6);
      }
      if (record > 0 && previous) {
        // Recorded: it travels without a jump...
        expect(
          Math.hypot(node.x - previous.x, node.y - previous.y),
          `focus ${focus}`,
        ).toBeLessThan(12);
        flown++;
      }
      if (record > 0) previous = node;
      // ...and the prompt's blank fills, and the slot goes, only once it
      // has landed in it (until the reader moves on).
      const landed =
        answerRecorded(phase, focus) > 0 ||
        (record > 0 && answerSlotShown(phase, focus) === 0);
      if (landed && phase <= form) {
        expect(fromSlot(node), `focus ${focus}`).toBeLessThan(1e-6);
        expect(radiusOf(node), `focus ${focus}`).toBeCloseTo(ANSWER_SIZE, 6);
      }
    }
    expect(flown).toBeGreaterThan(20);
  });

  it('keeps the answer clear of the rest of the network on its way', () => {
    const others = Array.from({ length: NODE_COUNT }, (_, i) => i)
      .filter((i) => i !== ANSWER)
      .map((i) => nodeOutline(i, form));
    let checked = 0;
    for (const focus of readings) {
      const phase = phaseWhileReading(focus);
      // On its way: recorded, not yet landed, the reader still on the card.
      if (interviewBeats(phase, focus).record === 0 || phase > form) continue;
      const node = nodeFrame(ANSWER, phase, focus);
      if (fromSlot(node) < 2 * ANSWER_SIZE) continue;
      checked++;
      for (const outline of others) {
        const gap = Math.min(
          ...outline.map((p) => Math.hypot(p.x - node.x, p.y - node.y)),
        );
        expect(gap, `focus ${focus}`).toBeGreaterThan(radiusOf(node) + 2);
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("fills the prompt's blank and marks the person as the answer lands, and holds both, with its trail, through the rest of the card", () => {
    // The form holds until 0.78 of the card.
    for (const focus of [
      INTERVIEWER_CARD + 0.6,
      INTERVIEWER_CARD + 0.68,
      INTERVIEWER_CARD + 0.76,
    ]) {
      const phase = phaseWhileReading(focus);
      expect(answerRecorded(phase, focus), `focus ${focus}`).toBe(1);
      expect(answerMarked(phase, focus), `focus ${focus}`).toBe(1);
      expect(answerSlotShown(phase, focus), `focus ${focus}`).toBe(0);
      for (const [j] of ANSWER_TRAIL.entries()) {
        expect(trailShown(j, phase, focus), `dot ${j}`).toBe(1);
      }
    }
  });

  it('shows the finished interview to a reader who sees no motion', () => {
    // With reduced motion the scene rests on each form, with no reading
    // position: every beat is done.
    const focus = Number.POSITIVE_INFINITY;
    expect(interviewBeats(form, focus)).toEqual({
      ask: 1,
      answer: 1,
      record: 1,
    });
    const node = nodeFrame(ANSWER, form, focus);
    expect(fromSlot(node)).toBeLessThan(1e-6);
    expect(radiusOf(node)).toBeCloseTo(ANSWER_SIZE, 6);
    expect(answerSlotShown(form, focus)).toBe(0);
    expect(answerRecorded(form, focus)).toBe(1);
    expect(answerMarked(form, focus)).toBe(1);
    expect(promptArrived(form)).toBe(1);
    expect(voicesGone(form)).toBe(0);
    for (const [j] of ANSWER_TRAIL.entries()) {
      expect(trailShown(j, form, focus), `dot ${j}`).toBe(1);
    }
  });

  it('seats the two voices on one baseline below the device, their tails rising to two neighbours at its near edge', () => {
    const { bezel } = deviceFrame(form);
    expect(ANSWER_BUBBLE.y).toBe(PROMPT_BUBBLE.y);
    expect(ANSWER_BUBBLE.h).toBe(PROMPT_BUBBLE.h);
    expect(PROMPT_BUBBLE.y).toBeGreaterThan(bezel.h / 2 + 16);
    // Side by side, not overlapping.
    expect(PROMPT_BUBBLE.x + PROMPT_BUBBLE.w).toBeLessThan(ANSWER_BUBBLE.x);
    // The participant's is the rounder.
    expect(ANSWER_BUBBLE.r).toBe(ANSWER_BUBBLE.h / 2);
    expect(ANSWER_BUBBLE.r).toBeGreaterThan(PROMPT_BUBBLE.r);
    const tips = [PROMPT_BUBBLE.tail.tip, ANSWER_BUBBLE.tail.tip];
    for (const tip of tips) {
      expect(tip.y).toBeGreaterThan(bezel.h / 2);
      expect(tip.y).toBeLessThan(PROMPT_BUBBLE.y);
      expect(Math.abs(tip.x)).toBeLessThan(bezel.w / 8);
    }
    expect(tips[0]!.x).toBeLessThan(tips[1]!.x);
  });

  it('lets the voices go without closing them, the camera recentred by halfway out', () => {
    for (let step = 1; step < 100; step++) {
      const leaving = form + step / 100;
      // They keep their size as they fade.
      expect(promptArrived(leaving), `phase ${leaving}`).toBe(1);
    }
    expect(voicesGone(form + 0.3)).toBe(1);
    for (const height of [360, 430, 480, 560]) {
      expect(cameraTransform(form + 0.5, height), `view ${height}`).toBe(
        cameraTransform(form + 1, height),
      );
    }
  });

  it('keeps nine nodes, and takes all nine to where the list picks them up', () => {
    expect(nodeLayers).toHaveLength(NODE_COUNT);
    const scales = new Set<string>();
    for (const focus of [Number.POSITIVE_INFINITY, form - 2 + 1.2]) {
      const arrived = form + 1 - 1e-9;
      for (let i = 0; i < NODE_COUNT; i++) {
        const node = nodeFrame(i, arrived, focus);
        expect(node.x, `node ${i}`).toBeCloseTo(LIST_SLOTS[i]!.x, 6);
        expect(node.y, `node ${i}`).toBeCloseTo(
          LIST_SLOTS[i]!.y + LIST_ENTER.y,
          6,
        );
        scales.add(node.scale.toFixed(6));
      }
    }
    expect(scales.size).toBe(1);
  });

  it("keeps the network's edges as the typed network drew them", () => {
    for (const edge of edges) {
      const typedUse = edge.uses.find((use) => use.config === form2);
      const interviewUse = edge.uses.find(
        (use) => use.config === INTERVIEWER_CONFIG,
      );
      expect(interviewUse?.style, edge.key).toBe(typedUse?.style);
    }
  });
});

const form2 = INTERVIEWER_CONFIG - 1;

describe('the workflow form', () => {
  const line = tracePath(WORKFLOW_LINE);
  const length = nearest(line, line.at(-1)!).along;

  it('is the card on the end-to-end workflow', () => {
    expect(principles[WORKFLOW_CARD]?.id).toBe('endToEndWorkflow');
  });

  it('is one unbroken line', () => {
    expect(WORKFLOW_LINE.match(/M/g)).toHaveLength(1);
  });

  it("threads the protocol's definitions, then delivers the data to the rows", () => {
    // Nodes 0-2 are the protocol's definitions and 6-8 the table's rows; at
    // rest, with the card read, the line meets them in that order.
    const order = [0, 1, 2, 6, 7, 8];
    const along = order.map((i) => {
      const node = nodeFrame(i, WORKFLOW_CONFIG);
      const { distance, along: position } = nearest(line, node);
      expect(distance, `node ${i}`).toBeLessThan(0.5);
      return position;
    });
    expect(along).toEqual(along.toSorted((a, b) => a - b));
    expect(new Set(along).size).toBe(order.length);
  });

  it('draws as its card is read, once the stations have settled', () => {
    const headAt = (focus: number) => workflowLine(WORKFLOW_CONFIG, focus).head;
    expect(headAt(WORKFLOW_CARD)).toBe(0);
    // With the scene at rest on the workflow, reading moves the line on.
    let previous = 0;
    for (let step = 0; step <= 100; step++) {
      const head = headAt(WORKFLOW_CARD + 0.1 + (0.6 * step) / 100);
      expect(head).toBeGreaterThanOrEqual(previous);
      previous = head;
    }
    expect(headAt(WORKFLOW_CARD + 0.35)).toBeGreaterThan(0.2);
    expect(headAt(WORKFLOW_CARD + 0.35)).toBeLessThan(0.9);
    expect(headAt(WORKFLOW_CARD + 0.7)).toBe(1);
    // Complete, rows and export included, by the middle of the card.
    const middle = WORKFLOW_CARD + 0.5;
    expect(workflowLine(phaseWhileReading(middle), middle).progress).toBe(1);
    // Mid-move into the form, however far the card is read, it waits.
    expect(workflowLine(WORKFLOW_CONFIG - 0.5, WORKFLOW_CARD + 0.7).head).toBe(
      0,
    );
  });

  it('carries the data along the line, behind its tip', () => {
    let carried = 0;
    for (let step = 0; step <= 200; step++) {
      const focus = WORKFLOW_CARD + 0.1 + (0.6 * step) / 200;
      const { head } = workflowLine(WORKFLOW_CONFIG, focus);
      for (const i of [6, 7, 8]) {
        const node = nodeFrame(i, WORKFLOW_CONFIG, focus);
        if (Math.max(...node.layers) < 0.01) continue;
        const { distance, along } = nearest(line, node);
        expect(distance, `node ${i} at ${focus}`).toBeLessThan(0.5);
        expect(along / length, `node ${i} at ${focus}`).toBeLessThanOrEqual(
          head + 0.005,
        );
        if (along / length < 0.99) carried++;
      }
    }
    expect(carried).toBeGreaterThan(20);
  });

  it('keeps its stations at full size wherever the canvas allows', () => {
    // From a 1280×720 window's view (about 412 tall) up, the camera never
    // stands back to make room: the stations are drawn at one size.
    const sizes: number[] = [];
    for (let height = 412; height <= 560; height += 4) {
      sizes.push(viewed(WORKFLOW_CONFIG, height).s);
    }
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThan(0.0005);
  });

  it('leaves forwards, out through its end, never drawing back', () => {
    let previous = 0;
    for (let step = 0; step <= 200; step++) {
      const { head, tail } = workflowLine(WORKFLOW_CONFIG + step / 200, 99);
      expect(head).toBe(1);
      expect(tail).toBeGreaterThanOrEqual(previous);
      previous = tail;
    }
    expect(previous).toBe(1);
  });
});

// The forms whose camera frames them on what they show: all of them.
const FRAMED = [1, 2, 3, 4, 5, 6];

describe('the camera', () => {
  it('centres every form on what it shows, with an even margin', () => {
    // The view is VIEW_WIDTH wide and as tall as the canvas's shape makes it:
    // 360 on a tablet's wide, short phone-layout canvas, about 412 in a
    // 1280×720 window, 430 at 1440×900, 457 on a phone, up to 560.
    for (const form of FRAMED) {
      for (let height = 360; height <= 560; height += 4) {
        const { margins } = viewed(form, height);
        const least = 0.06 * Math.min(VIEW_WIDTH, height);
        for (const [side, margin] of Object.entries(margins)) {
          expect(
            margin,
            `form ${form}, ${side}, view ${height}`,
          ).toBeGreaterThan(least);
        }
        expect(margins.left - margins.right, `form ${form}`).toBeCloseTo(0, 1);
        expect(margins.top - margins.bottom, `form ${form}`).toBeCloseTo(0, 1);
      }
    }
  });

  it("frames each form's own bounds, not the world's origin", () => {
    const near = (a: number, b: number) => Math.abs(a - b) < 1;
    const boxOf = (form: number) => {
      const { x, y, w, h } = FORM_BOXES[form]!;
      return { left: x, right: x + w, top: y, bottom: y + h };
    };
    const nodes = (form: number) =>
      Array.from({ length: NODE_COUNT }, (_, i) => nodeOutline(i, form)).flat();
    const { w, h } = deviceFrame(COMMUNITY_CONFIG).bezel;
    const device = [
      { x: -w / 2, y: -h / 2 },
      { x: w / 2, y: h / 2 },
    ];
    // The network's forms and the community: exactly their nodes, and the
    // community's institutions and the device at its centre.
    const shown: Record<number, Point[]> = {
      1: nodes(1),
      2: nodes(2),
      [COMMUNITY_CONFIG]: [
        ...nodes(COMMUNITY_CONFIG),
        ...INSTITUTIONS.flatMap((institution) => tracePath(institution.d)),
        ...device,
      ],
    };
    for (const [form, points] of Object.entries(shown)) {
      const box = boxOf(Number(form));
      const content = bounds(points);
      for (const side of ['left', 'right', 'top', 'bottom'] as const) {
        expect(near(box[side], content[side]), `form ${form}, ${side}`).toBe(
          true,
        );
      }
    }
    // The interview: the device, and the bodies of the two voices below it,
    // their tails rising between them, centred on the device so it stands at
    // the canvas's centre however far either voice reaches.
    const interview = boxOf(INTERVIEWER_CONFIG);
    const reach = Math.max(
      -PROMPT_BUBBLE.x,
      ANSWER_BUBBLE.x + ANSWER_BUBBLE.w,
      bounds(device).right,
    );
    expect(interview).toEqual({
      left: -reach,
      right: reach,
      top: bounds(device).top,
      bottom: PROMPT_BUBBLE.y + PROMPT_BUBBLE.h,
    });
    expect((interview.left + interview.right) / 2).toBe(
      (bounds(device).left + bounds(device).right) / 2,
    );
    // The list and the workflow: the device, and the stations round it,
    // hold every node.
    expect(boxOf(4)).toEqual(bounds(device));
    for (const form of [4, WORKFLOW_CONFIG]) {
      const box = boxOf(form);
      const content = bounds(nodes(form));
      expect(content.left).toBeGreaterThanOrEqual(box.left);
      expect(content.right).toBeLessThanOrEqual(box.right);
      expect(content.top).toBeGreaterThanOrEqual(box.top);
      expect(content.bottom).toBeLessThanOrEqual(box.bottom);
    }
  });
});

describe('the community form', () => {
  const COMMUNITY_CARD = COMMUNITY_CONFIG - 2;
  const PERSON_SIZE = 46;
  const people = Array.from({ length: NODE_COUNT }, (_, i) => i);
  // The colour a node shows at rest on the community, or null if it shows
  // more than one, or a dashed outline.
  const restingColour = (i: number) => {
    const shown = nodeFrame(i, COMMUNITY_CONFIG)
      .layers.map((weight, l) => ({ weight, layer: nodeLayers[i]![l]! }))
      .filter(({ weight }) => weight > 0);
    if (shown.length !== 1 || shown[0]!.weight !== 1) return null;
    return shown[0]!.layer.outline ? null : shown[0]!.layer.color;
  };
  const { w: bezelW, h: bezelH } = deviceFrame(COMMUNITY_CONFIG).bezel;

  it('is the card on the open-source community', () => {
    expect(principles[COMMUNITY_CARD]?.id).toBe('openSourceCommunity');
  });

  it('draws everyone alike, one shape and one colour, each marked as a person', () => {
    const circle = nodeFrame(0, 1).d;
    const colours = new Set(people.map(restingColour));
    expect(colours.size).toBe(1);
    expect(colours.has(null)).toBe(false);
    for (const i of people) {
      const rest = nodeFrame(i, COMMUNITY_CONFIG);
      expect(rest.d, `person ${i}`).toBe(circle);
      expect(rest.scale * 20, `person ${i}`).toBeCloseTo(PERSON_SIZE, 5);
      expect(rest.figure, `person ${i}`).toBe(1);
      // Only the community marks its nodes as people.
      for (let form = 0; form < COMMUNITY_CONFIG; form++) {
        expect(nodeFrame(i, form).figure, `node ${i}, form ${form}`).toBe(0);
      }
    }
  });

  it('keeps the project off the network: it grows out of the device once its people have gone', () => {
    // No node stands for the project at the device's centre.
    for (const i of people) {
      const { x, y } = nodeFrame(i, COMMUNITY_CONFIG);
      expect(Math.abs(x) > bezelW / 2 || Math.abs(y) > bezelH / 2).toBe(true);
    }
    expect(projectShown(WORKFLOW_CONFIG)).toBe(0);
    expect(projectShown(COMMUNITY_CONFIG)).toBe(1);
    let growing = 0;
    for (let step = 0; step <= 400; step++) {
      const phase = WORKFLOW_CONFIG + step / 400;
      const radius = PROJECT_RADIUS * projectShown(phase);
      if (radius === 0) continue;
      growing++;
      for (const i of people) {
        const node = nodeFrame(i, phase);
        expect(
          Math.hypot(node.x, node.y) - node.scale * 20,
          `node ${i} at ${phase}`,
        ).toBeGreaterThan(radius + 4);
      }
    }
    expect(growing).toBeGreaterThan(50);
  });

  it('groups everyone into institutions of different sizes, none of one person', () => {
    const members = INSTITUTIONS.flatMap((institution) => institution.members);
    expect(members.toSorted((a, b) => a - b)).toEqual(people);
    expect(INSTITUTIONS.length).toBeGreaterThanOrEqual(3);
    const sizes = INSTITUTIONS.map((institution) => institution.members.length);
    expect(Math.min(...sizes)).toBeGreaterThan(1);
    expect(new Set(sizes).size).toBe(sizes.length);

    const outlines = INSTITUTIONS.map((institution) =>
      tracePath(institution.d),
    );
    INSTITUTIONS.forEach((institution, j) => {
      for (const i of people) {
        // Every point of the person, a little way out, is inside their own
        // institution's outline and outside every other.
        const ring = nodeOutline(i, COMMUNITY_CONFIG).map((p) => {
          const { x, y } = nodeFrame(i, COMMUNITY_CONFIG);
          return { x: x + (p.x - x) * 1.2, y: y + (p.y - y) * 1.2 };
        });
        const member = institution.members.includes(i);
        for (const p of ring) {
          expect(inside(outlines[j]!, p), `person ${i}, institution ${j}`).toBe(
            member,
          );
        }
      }
      // The outlines stand clear of each other and of the device.
      for (const p of outlines[j]!) {
        expect(Math.abs(p.x) > bezelW / 2 || Math.abs(p.y) > bezelH / 2).toBe(
          true,
        );
        outlines.forEach((other, k) => {
          if (k !== j) expect(inside(other, p), `${j} inside ${k}`).toBe(false);
        });
      }
    });
  });

  // Each institution's neighbouring people, round its figure.
  const neighbours = (institution: (typeof INSTITUTIONS)[number]) =>
    institution.members
      .map((i, k) => [
        i,
        institution.members[(k + 1) % institution.members.length]!,
      ])
      .slice(0, institution.members.length === 2 ? 1 : undefined);

  it("stands each institution's people evenly, one gap apart, its outline one padding off them", () => {
    for (const institution of INSTITUTIONS) {
      const at = institution.members.map((i) => nodeFrame(i, COMMUNITY_CONFIG));
      // Evenly round the institution's centre...
      const radii = at.map((p) =>
        Math.hypot(p.x - institution.centre.x, p.y - institution.centre.y),
      );
      expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(0.2);
      // ...with the same gap between each person and the next.
      for (const [a, b] of neighbours(institution)) {
        const p = nodeFrame(a!, COMMUNITY_CONFIG);
        const q = nodeFrame(b!, COMMUNITY_CONFIG);
        const gap = Math.hypot(p.x - q.x, p.y - q.y) - 2 * PERSON_SIZE;
        expect(gap, `${a} and ${b}`).toBeGreaterThanOrEqual(18);
        expect(gap, `${a} and ${b}`).toBeLessThanOrEqual(22);
      }
      // The outline's least distance from anyone in it.
      const standoff = Math.min(
        ...tracePath(institution.d).map((o) =>
          Math.min(...at.map((p) => Math.hypot(o.x - p.x, o.y - p.y))),
        ),
      );
      expect(standoff - PERSON_SIZE).toBeGreaterThanOrEqual(26);
      expect(standoff - PERSON_SIZE).toBeLessThanOrEqual(28);
    }
  });

  it('draws each institution as a soft blob, with a slight waist between neighbours', () => {
    const reach = PERSON_SIZE + 27;
    for (const institution of INSTITUTIONS) {
      const outline = tracePath(institution.d);
      for (const [a, b] of neighbours(institution)) {
        const p = nodeFrame(a!, COMMUNITY_CONFIG);
        const q = nodeFrame(b!, COMMUNITY_CONFIG);
        const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
        // Out from between the two: away from the institution's centre, or
        // to both sides of a pair.
        const across = { x: -(q.y - p.y), y: q.x - p.x };
        const outward =
          institution.members.length === 2
            ? [across, { x: -across.x, y: -across.y }]
            : [
                {
                  x: mid.x - institution.centre.x,
                  y: mid.y - institution.centre.y,
                },
              ];
        for (const direction of outward) {
          const length = Math.hypot(direction.x, direction.y);
          const u = { x: direction.x / length, y: direction.y / length };
          // Where the outline crosses that line.
          const crossing = outline
            .filter(
              (o) => Math.abs((o.x - mid.x) * u.y - (o.y - mid.y) * u.x) < 3,
            )
            .map((o) => (o.x - mid.x) * u.x + (o.y - mid.y) * u.y)
            .filter((along) => along > 0);
          const waist = Math.min(...crossing);
          // Inside the straight run a hull would draw, but well outside
          // the pinch where two plain circles meet.
          const pinch = Math.sqrt(
            reach ** 2 - (Math.hypot(p.x - q.x, p.y - q.y) / 2) ** 2,
          );
          expect(waist, `${a} and ${b}`).toBeLessThan(reach - 6);
          expect(waist, `${a} and ${b}`).toBeGreaterThan(pinch + 8);
        }
      }
      // Smooth all the way round: no corner anywhere.
      for (let k = 0; k < outline.length; k++) {
        const a = outline[k]!;
        const b = outline[(k + 1) % outline.length]!;
        const c = outline[(k + 2) % outline.length]!;
        const turn = Math.abs(
          Math.atan2(
            (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x),
            (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y),
          ),
        );
        if (Math.hypot(b.x - a.x, b.y - a.y) > 0.5) {
          expect(turn, `at ${b.x}, ${b.y}`).toBeLessThan(0.2);
        }
      }
    }
  });

  it('puts its heaviest institution at the top left, away from the cards, and balances its weight on the canvas', () => {
    const heaviest = INSTITUTIONS.toSorted(
      (a, b) => b.members.length - a.members.length,
    )[0]!;
    expect(heaviest.centre.x).toBeLessThan(0);
    expect(heaviest.centre.y).toBeLessThan(0);
    // The people, and the device at the centre as heavy as three of them,
    // weigh evenly about the middle of what the camera frames.
    const at = people.map((i) => nodeFrame(i, COMMUNITY_CONFIG));
    const weight = at.length + 3;
    const mass = {
      x: at.reduce((sum, p) => sum + p.x, 0) / weight,
      y: at.reduce((sum, p) => sum + p.y, 0) / weight,
    };
    const { x, y, w, h } = FORM_BOXES[COMMUNITY_CONFIG]!;
    expect(Math.hypot(mass.x - (x + w / 2), mass.y - (y + h / 2))).toBeLessThan(
      0.04 * Math.max(w, h),
    );
    // And no more of it lies on the cards' side.
    expect(mass.x).toBeLessThanOrEqual(x + w / 2);
  });

  it('connects each institution to the project, and no person to another', () => {
    for (const edge of edges) {
      expect(edgeFrame(edge, COMMUNITY_CONFIG).drawn, edge.key).toBe(0);
    }
    for (const institution of INSTITUTIONS) {
      // Straight in to the project's centre, from just inside the outline,
      // so it starts beneath the institution.
      const { centre, link } = institution;
      const outline = tracePath(institution.d);
      expect(inside(outline, link)).toBe(true);
      expect(nearest(outline, link).distance).toBeLessThan(30);
      expect(Math.abs(link.x * centre.y - link.y * centre.x)).toBeLessThan(
        Math.hypot(centre.x, centre.y),
      );
      expect(link.x * centre.x + link.y * centre.y).toBeGreaterThan(0);
      // Between the institution and the device, beneath which it runs on,
      // the stretch that shows is long enough to carry contributions.
      const length = Math.hypot(centre.x, centre.y);
      let leaves = 0;
      let reaches = length;
      for (let along = 0; along <= length; along += 0.5) {
        const p = {
          x: centre.x * (1 - along / length),
          y: centre.y * (1 - along / length),
        };
        if (inside(outline, p)) leaves = along;
        if (Math.abs(p.x) <= bezelW / 2 && Math.abs(p.y) <= bezelH / 2) {
          reaches = Math.min(reaches, along);
        }
      }
      expect(reaches - leaves, institution.members.join()).toBeGreaterThan(80);
    }
  });

  it('gathers each institution only once its people have landed', () => {
    let gathering = 0;
    for (let step = 0; step <= 400; step++) {
      const phase = WORKFLOW_CONFIG + step / 400;
      INSTITUTIONS.forEach((institution, j) => {
        if (institutionShown(j, phase) === 0) return;
        gathering++;
        for (const i of institution.members) {
          const now = nodeFrame(i, phase);
          const rest = nodeFrame(i, COMMUNITY_CONFIG);
          expect(now.x, `person ${i} at ${phase}`).toBeCloseTo(rest.x, 3);
          expect(now.y, `person ${i} at ${phase}`).toBeCloseTo(rest.y, 3);
          expect(now.scale, `person ${i} at ${phase}`).toBeCloseTo(
            rest.scale,
            3,
          );
        }
      });
    }
    expect(gathering).toBeGreaterThan(50);
    INSTITUTIONS.forEach((_, j) => {
      expect(institutionShown(j, WORKFLOW_CONFIG)).toBe(0);
      expect(institutionShown(j, COMMUNITY_CONFIG)).toBe(1);
    });
  });
});

describe('the move into the community', () => {
  const people = Array.from({ length: NODE_COUNT }, (_, i) => i);
  const steps = Array.from(
    { length: 401 },
    (_, step) => WORKFLOW_CONFIG + step / 400,
  );
  const radius = (frame: ReturnType<typeof nodeFrame>) => frame.scale * 20;
  const circle = nodeFrame(0, 1).d;
  const personColour = nodeLayers[0]!.find(
    (layer) => !layer.outline && layer.color === 0,
  );

  it('first makes every node a person where it stands', () => {
    // While nodes change, none moves; by the time any sets off, every one
    // is a plain circle in the people's colour.
    let changing = 0;
    for (const phase of steps) {
      const moving = people.some((i) => {
        const now = nodeFrame(i, phase);
        const rest = nodeFrame(i, WORKFLOW_CONFIG);
        return now.x !== rest.x || now.y !== rest.y;
      });
      for (const i of people) {
        const frame = nodeFrame(i, phase);
        const isPerson =
          frame.d === circle &&
          frame.layers.every(
            (weight, l) =>
              weight === (nodeLayers[i]![l]!.key === personColour?.key ? 1 : 0),
          );
        if (moving) {
          expect(isPerson, `node ${i} at ${phase}`).toBe(true);
        } else if (!isPerson) {
          changing++;
        }
      }
    }
    expect(changing).toBeGreaterThan(100);
  });

  it('fills each definition in within its outline, and only then lets the outline go', () => {
    const fine = Array.from(
      { length: 2001 },
      (_, step) => WORKFLOW_CONFIG + step / 2000,
    );
    for (const i of [0, 1, 2]) {
      const layers = nodeLayers[i]!;
      const outline = layers.findIndex((layer) => layer.outline);
      const fill = layers.findIndex(
        (layer) => !layer.outline && layer.key === personColour?.key,
      );
      let previous = 0;
      let filling = 0;
      for (const phase of fine) {
        const weights = nodeFrame(i, phase).layers;
        const filled = weights[fill]!;
        const outlined = weights[outline]!;
        // The fill comes in gradually, never all at once...
        expect(
          Math.abs(filled - previous),
          `node ${i} at ${phase}`,
        ).toBeLessThan(0.02);
        previous = filled;
        // ...while the outline is whole, which goes only once it is filled.
        if (filled > 0 && filled < 1) {
          filling++;
          expect(outlined, `node ${i} at ${phase}`).toBe(1);
        }
        if (outlined > 0 && outlined < 1) {
          expect(filled, `node ${i} at ${phase}`).toBe(1);
        }
      }
      expect(filling).toBeGreaterThan(20);
    }
  });

  it('fades the protocol and the table only once their people have set off from them', () => {
    // Each of their people at least their own width from where they stood
    // on the page or in the table, not still sitting on a fading station.
    let fading = 0;
    for (const phase of steps) {
      if (sceneryWeight(WORKFLOW_CONFIG, phase) === 1) continue;
      fading++;
      for (const i of [0, 1, 2, 6, 7, 8]) {
        const now = nodeFrame(i, phase);
        const stood = nodeFrame(i, WORKFLOW_CONFIG);
        expect(
          Math.hypot(now.x - stood.x, now.y - stood.y),
          `node ${i} at ${phase}`,
        ).toBeGreaterThan(2 * radius(now));
      }
    }
    expect(fading).toBeGreaterThan(50);
    // And they are gone once everyone has landed.
    expect(sceneryWeight(WORKFLOW_CONFIG, WORKFLOW_CONFIG + 0.8)).toBe(0);
  });

  it('moves people on paths that keep their order, without one touching another', () => {
    const start = people.map((i) => nodeFrame(i, WORKFLOW_CONFIG));
    for (const phase of steps) {
      const now = people.map((i) => nodeFrame(i, phase));
      for (const a of people) {
        for (const b of people.slice(a + 1)) {
          const p = now[a]!;
          const q = now[b]!;
          expect(
            Math.hypot(p.x - q.x, p.y - q.y) - radius(p) - radius(q),
            `${a} and ${b} at ${phase}`,
          ).toBeGreaterThan(8);
          // Which way one lies from the other turns by less than a quarter
          // turn: no one passes anyone.
          const before = {
            x: start[b]!.x - start[a]!.x,
            y: start[b]!.y - start[a]!.y,
          };
          const after = { x: q.x - p.x, y: q.y - p.y };
          expect(
            before.x * after.x + before.y * after.y,
            `${a} and ${b} at ${phase}`,
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  it('takes no one across the device who was not on it, and swells no one', () => {
    for (const phase of steps) {
      for (const i of people) {
        const frame = nodeFrame(i, phase);
        expect(radius(frame), `node ${i} at ${phase}`).toBeLessThanOrEqual(
          radius(nodeFrame(i, COMMUNITY_CONFIG)) + 1e-9,
        );
        if (i >= 3 && i < 6) continue;
        const { w, h } = deviceFrame(COMMUNITY_CONFIG).bezel;
        const r = radius(frame);
        expect(
          Math.abs(frame.x) > w / 2 + r || Math.abs(frame.y) > h / 2 + r,
          `node ${i} at ${phase}`,
        ).toBe(true);
      }
    }
  });

  it('marks each person as they land, not once everyone has', () => {
    const firstLanded = INSTITUTIONS.map((institution) =>
      steps.find((phase) =>
        institution.members.every((i) => nodeFrame(i, phase).figure === 1),
      ),
    );
    // One institution's people are marked before the next one's land.
    expect(firstLanded[0]!).toBeLessThan(firstLanded.at(-1)!);
    for (const phase of steps) {
      for (const i of people) {
        const now = nodeFrame(i, phase);
        if (now.figure === 0) continue;
        // Only once they are nearly there.
        const rest = nodeFrame(i, COMMUNITY_CONFIG);
        const start = nodeFrame(i, WORKFLOW_CONFIG);
        const journey = Math.hypot(rest.x - start.x, rest.y - start.y);
        expect(
          Math.hypot(rest.x - now.x, rest.y - now.y),
          `person ${i} at ${phase}`,
        ).toBeLessThan(0.25 * journey);
      }
    }
  });
});

describe('every move', () => {
  const phases = Array.from({ length: 1201 }, (_, step) => step / 200);

  it("never lays one of an edge's strokes part-transparent over another", () => {
    for (const phase of phases) {
      for (const edge of edges) {
        const frame = edgeFrame(edge, phase);
        const showing = frame.strokes.filter(
          (stroke) => stroke.opacity > 0 && stroke.drawn > 0,
        );
        // Strokes draw along the edge; they never fade.
        for (const stroke of frame.strokes) {
          expect([0, 1], `${edge.key} at ${phase}`).toContain(stroke.opacity);
        }
        if (showing.length > 1) {
          for (const stroke of showing) {
            expect(stroke.opacity, `${edge.key} at ${phase}`).toBe(1);
          }
        }
      }
    }
  });

  it('never shows a node in two colours that are both part-strength', () => {
    for (const phase of phases) {
      for (let i = 0; i < NODE_COUNT; i++) {
        const showing = nodeFrame(i, phase).layers.filter((w) => w > 0.001);
        if (showing.length > 1) {
          expect(Math.max(...showing), `node ${i} at ${phase}`).toBe(1);
        }
      }
    }
  });

  it('takes edges away before their nodes set off', () => {
    for (const phase of phases) {
      const form = Math.floor(phase);
      for (const edge of edges) {
        const leaving =
          edge.uses.some((use) => use.config === form) &&
          !edge.uses.some((use) => use.config === form + 1);
        if (!leaving || edgeFrame(edge, phase).drawn === 0) continue;
        for (const i of [edge.a, edge.b]) {
          expect(nodeFrame(i, phase).x, `${edge.key} at ${phase}`).toBe(
            nodeFrame(i, form).x,
          );
        }
      }
    }
  });

  it('never mixes two colours of light far apart on the canvas', () => {
    let apart = 0;
    for (const phase of phases) {
      const { from, to, out, in: incoming } = lightLevels(phase);
      if (lightCrossFades(from, to)) continue;
      apart++;
      expect(Math.min(out, incoming), `phase ${phase}`).toBe(0);
    }
    expect(apart).toBeGreaterThan(50);
  });

  it('cross-fades between neighbouring colours, so the canvas never goes dark', () => {
    // The workflow's green and the community's blue are neighbours; the
    // design form's orange and the workflow's green are not.
    expect(lightCrossFades(WORKFLOW_CONFIG, COMMUNITY_CONFIG)).toBe(true);
    expect(lightCrossFades(WORKFLOW_CONFIG - 1, WORKFLOW_CONFIG)).toBe(false);
    for (const phase of phases) {
      const { from, to, out, in: incoming } = lightLevels(phase);
      if (!lightCrossFades(from, to)) continue;
      expect(out + incoming, `phase ${phase}`).toBeCloseTo(1, 6);
    }
  });
});
