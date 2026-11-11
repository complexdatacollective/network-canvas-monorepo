import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cleanup, render, screen, within } from '@testing-library/react';
import { motionValue } from 'motion/react';
import { afterEach, describe, expect, it } from 'vitest';

import { principles } from '~/lib/content';
import { renderWithIntl } from '~/test/renderWithIntl';

import { DesignPrinciples } from '../DesignPrinciples';
import {
  ANSWER_BUBBLE,
  ANSWER_SIZE,
  ANSWER_SLOT,
  ANSWER_TRAIL,
  COMMUNITY_CONFIG,
  FORM_COLORS,
  formBlend,
  INSTITUTIONS,
  INTERVIEWER_CONFIG,
  KEY_HUES,
  PROJECT_RADIUS,
  PROMPT,
  PROMPT_BUBBLE,
  scenePhase,
} from '../designPrinciplesGeometry';
import { DesignPrinciplesScene } from '../DesignPrinciplesScene';

const titles = [
  'Ontological flexibility',
  'In-person and interviewer-assisted',
  'An emphasis on design',
  'End-to-end workflow',
  'Open-source community driven development',
];

afterEach(cleanup);

describe('DesignPrinciples', () => {
  it('links each principle title to its documentation', () => {
    renderWithIntl(<DesignPrinciples />);

    const section = screen.getByRole('region', { name: 'Design Principles' });
    expect(principles).toHaveLength(titles.length);
    const headings = within(section).getAllByRole('heading', { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual(titles);

    // The title is the only link on a card: no overlay link repeats it.
    const links = within(section).getAllByRole('link');
    expect(links).toHaveLength(titles.length);
    for (const [index, principle] of principles.entries()) {
      const link = within(headings[index]!).getByRole('link', {
        name: titles[index],
      });
      expect(link).toHaveAttribute('href', principle.href);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noreferrer');
    }
  });

  it("marks each card with the colour that lights the canvas while it's read", () => {
    renderWithIntl(<DesignPrinciples />);

    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(titles.length);
    for (const [index, card] of cards.entries()) {
      // The canvas at rest on this card's reading position.
      const { from, to, mix } = formBlend(
        scenePhase(1, index + 0.5, titles.length),
      );
      const light = FORM_COLORS[mix === 0 ? from : to];
      const bar = card.querySelector<HTMLElement>('[aria-hidden][style]');
      expect(bar?.style.backgroundColor).toBe(`var(--color-${light})`);
    }
  });

  it("marks the workflow's protocol and device with Architect's and Interviewer's icons", () => {
    const { container } = renderWithIntl(<DesignPrinciples />);

    const hrefs = Array.from(container.querySelectorAll('image'), (image) =>
      image.getAttribute('href'),
    );
    expect(hrefs).toEqual([
      expect.stringMatching(/\/architect-icon\.png$/),
      expect.stringMatching(/\/interviewer-icon\.svg$/),
    ]);
    // Served from the site's public folder: a missing file draws nothing.
    for (const href of hrefs) {
      const file = join(process.cwd(), 'public', href ?? '');
      expect(existsSync(file), href ?? '').toBe(true);
    }
  });

  it('draws the scene across the whole canvas, so its forms sit centred on it', () => {
    const { container } = renderWithIntl(<DesignPrinciples />);

    const canvas = container.querySelector('[data-theme-interview]');
    const scene = canvas?.querySelector('svg');
    expect(scene).not.toBeNull();
    // Between the canvas and the scene, nothing is inset or offset.
    for (
      let element = scene!.parentElement;
      element && element !== canvas;
      element = element.parentElement
    ) {
      expect(element.className).toBe('absolute inset-0');
    }
  });

  it("tints the canvas faintly with each form's colour, every colour as light as the next", () => {
    const { container } = renderWithIntl(<DesignPrinciples />);

    const lights = Array.from(
      container.querySelectorAll<HTMLElement>('[data-theme-interview] > div'),
      (layer) => layer.style.backgroundImage,
    ).filter((image) => image.includes('color-mix'));
    expect(lights.length).toBeGreaterThan(0);
    const tints = new Set<string>();
    for (const light of lights) {
      const strength = Number(/(\d+)%, transparent\)/.exec(light)?.[1]);
      expect(strength, light).toBeGreaterThanOrEqual(15);
      expect(strength, light).toBeLessThanOrEqual(18);
      // The key colour's hue, at one lightness and chroma for every form.
      const tint = /oklch\(([\d.]+ [\d.]+) ([\d.]+)\)/.exec(light);
      expect(tint, light).not.toBeNull();
      tints.add(tint![1]!);
      expect(Object.values(KEY_HUES)).toContain(Number(tint![2]));
    }
    expect(tints.size).toBe(1);
  });

  it("marks the community's contributions in its key colour, sending them in only when motion is allowed", () => {
    const { container } = renderWithIntl(<DesignPrinciples />);

    const paths = Array.from(container.querySelectorAll('path'));
    const dots = paths.filter((path) =>
      path.getAttribute('class')?.includes('nc-gather'),
    );
    const trails = paths.filter((path) =>
      path.getAttribute('class')?.includes('nc-trail'),
    );
    // One stream of contributions for each institution, each dot with a
    // trail behind it, on its way in.
    expect(dots).toHaveLength(INSTITUTIONS.length);
    expect(trails).toHaveLength(INSTITUTIONS.length);
    for (const [k, dot] of dots.entries()) {
      expect(trails[k]!.getAttribute('d')).toBe(dot.getAttribute('d'));
      expect(
        Number(trails[k]!.getAttribute('stroke-dashoffset')),
      ).toBeGreaterThan(Number(dot.getAttribute('stroke-dashoffset') ?? 0));
      for (const mark of [dot, trails[k]!]) {
        expect(mark.closest('[class*="stroke-sea-serpent"]')).not.toBeNull();
        // They move only when motion is allowed and the community is on
        // screen; with reduced motion they stand along the connection.
        expect(mark.getAttribute('class')).toContain(
          'group-data-[loop=6]/stage:motion-safe:animate-',
        );
        expect(mark.closest('[class~="opacity-0"]')).toBeNull();
      }
    }
    expect(FORM_COLORS[COMMUNITY_CONFIG]).toBe('sea-serpent');
  });

  it('runs the connections beneath the device, and draws its frame over the people leaving it', () => {
    const { container } = renderWithIntl(<DesignPrinciples />);

    const scene = container.querySelector('[data-theme-interview] svg')!;
    const bezels = Array.from(
      scene.querySelectorAll('path[class~="fill-cyber-grape"]'),
    );
    // The device, and its frame drawn again over the network.
    expect(bezels).toHaveLength(2);
    const [device, frame] = bezels as [Element, Element];
    expect(frame.getAttribute('fill-rule')).toBe('evenodd');
    const before = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const connections = Array.from(scene.querySelectorAll('path')).filter(
      (path) => path.getAttribute('class')?.includes('nc-gather'),
    );
    for (const connection of connections) {
      expect(before(connection, device)).toBe(true);
    }
    // Every node (each carries a person's figure) is beneath the frame.
    const figures = scene.querySelectorAll('path[class~="fill-white/85"]');
    expect(figures).toHaveLength(9);
    for (const figure of figures) expect(before(figure, frame)).toBe(true);
  });

  it('draws the project in neutral ink, not in a colour', () => {
    const { container } = renderWithIntl(<DesignPrinciples />);

    const project = container.querySelector(
      `[data-theme-interview] circle[r="${PROJECT_RADIUS}"]`,
    );
    expect(project).not.toBeNull();
    const classes = project!.getAttribute('class')!.split(/\s+/);
    for (const name of classes) {
      expect(name, name).toMatch(/^(stroke-text|fill-white\/\d+)$/);
    }
  });

  it('keeps the canvas square on wide screens, the cards passing over its edge', () => {
    const { container } = renderWithIntl(<DesignPrinciples />);

    const canvas = container.querySelector('[data-theme-interview]')!;
    const classes = canvas.getAttribute('class')!.split(/\s+/);
    // As tall as it is wide, and no wider than it may be tall.
    expect(classes).toEqual(
      expect.arrayContaining([
        'tablet-landscape:aspect-square',
        'tablet-landscape:max-h-[86svh]',
        'tablet-landscape:max-w-[86svh]',
      ]),
    );
    // At the right of its columns, its right edge two rem past the start
    // of the reading column's: one column, less two rem, of padding.
    const holder = canvas.parentElement!.getAttribute('class')!.split(/\s+/);
    expect(holder).toEqual(
      expect.arrayContaining([
        'tablet-landscape:col-span-8',
        'tablet-landscape:justify-end',
        'tablet-landscape:pr-[calc((100%-21rem)/8-2rem)]',
      ]),
    );
  });

  it('holds the canvas in view until the last card has passed the reading line', () => {
    const { container } = renderWithIntl(<DesignPrinciples />);

    // The canvas is held for as long as the reading column runs on. The
    // reader reads at 58% of the window's height, so the column runs at
    // least the remaining 42% past the last card.
    const column = container.querySelector('[data-reading-column]')!;
    const room = /tablet-landscape:pb-\[(\d+)svh\]/.exec(
      column.getAttribute('class')!,
    );
    expect(Number(room?.[1])).toBeGreaterThanOrEqual(42);
  });

  it('uses no relative colours, which older Safari drops', () => {
    const { container } = renderWithIntl(<DesignPrinciples />);

    expect(container.innerHTML).toMatch(/color-mix/);
    expect(container.innerHTML).not.toMatch(/\bfrom var\(/);
    for (const file of [
      'DesignPrinciples.tsx',
      'DesignPrinciplesScene.tsx',
      'designPrinciplesGeometry.ts',
    ]) {
      const source = readFileSync(join(__dirname, '..', file), 'utf8');
      expect(source, file).not.toMatch(/oklch\(from/);
    }
  });

  it("names every animation the scene's own, and defines every one it runs", () => {
    const { container } = renderWithIntl(<DesignPrinciples />);

    const scene = container.querySelector('[data-theme-interview] svg')!;
    const styles = Array.from(
      scene.querySelectorAll('style'),
      (style) => style.textContent ?? '',
    ).join('\n');
    const defined = Array.from(
      styles.matchAll(/@keyframes\s+([\w-]+)/g),
      (match) => match[1]!,
    );
    expect(defined.length).toBeGreaterThan(0);
    for (const name of defined) expect(name).toMatch(/^nc-/);
    const used = Array.from(
      scene.querySelectorAll('[class*="animate-["]'),
    ).flatMap((element) =>
      Array.from(
        (element.getAttribute('class') ?? '').matchAll(/animate-\[([\w-]+)_/g),
        (match) => match[1]!,
      ),
    );
    expect(used.length).toBeGreaterThan(0);
    for (const name of used) expect(defined).toContain(name);
  });

  it('draws every connection as one unbroken line, and no dashed ones', () => {
    // The typed network, at rest: its nine connections, every one fully
    // drawn.
    const { container } = render(
      <DesignPrinciplesScene phase={motionValue(2)} animated={false} />,
    );
    // Motion writes a stroke's opacity as a style.
    const connections = [
      ...container.querySelectorAll<SVGPathElement>(
        'path[class*="stroke-edge-"]',
      ),
    ].filter((path) => path.style.opacity !== '0');
    expect(connections).toHaveLength(9);
    for (const path of connections) {
      // Drawn along its length (Motion's pathLength), one dash the length of
      // the whole path: never a repeating dash.
      expect(path.getAttribute('pathLength')).toBe('1');
      const [dash] = (path.getAttribute('stroke-dasharray') ?? '1')
        .split(/[\s,]+/)
        .map(Number.parseFloat);
      expect(dash).toBe(1);
    }
  });

  it('shows the finished interview to a reader who sees no motion, the answer recorded in place', () => {
    // With reduced motion the scene rests on the form being read and has no
    // reading position.
    const { container } = render(
      <DesignPrinciplesScene
        phase={motionValue(INTERVIEWER_CONFIG)}
        animated={false}
      />,
    );
    const scene = container.querySelector('svg')!;
    const shown = (element: Element | null) => {
      expect(element).not.toBeNull();
      for (
        let node: Element | null = element;
        node && node !== scene;
        node = node.parentElement
      ) {
        // Motion writes visibility as an attribute on SVG, opacity and
        // scale as styles.
        const style = (node as SVGElement).style;
        if (
          node.getAttribute('visibility') === 'hidden' ||
          style.visibility === 'hidden' ||
          style.opacity === '0' ||
          /scale\(0\)/.test(style.transform)
        ) {
          return false;
        }
      }
      return true;
    };
    const circleAt = (x: number, y: number, extra = '') =>
      scene.querySelector(`circle[cx="${x}"][cy="${y}"]${extra}`);

    // The answer is on the screen, marked; its empty slot is gone.
    expect(shown(scene.querySelector(`circle[r="${ANSWER_SIZE + 6}"]`))).toBe(
      true,
    );
    expect(
      shown(circleAt(ANSWER_SLOT.x, ANSWER_SLOT.y, '[stroke-dasharray]')),
    ).toBe(false);
    // The prompt's blank is filled, in the answer's colour.
    const filled = circleAt(PROMPT.blank.x, PROMPT.blank.y, '[fill^="url("]');
    expect(shown(filled)).toBe(true);
    // The trail runs back to the participant.
    for (const dot of ANSWER_TRAIL) {
      expect(shown(circleAt(dot.x, dot.y)), `${dot.x} ${dot.y}`).toBe(true);
    }

    // No tenth node: the only mark in a node's colour off the network is the
    // filled blank, and the participant's bubble keeps no copy of the answer.
    const coloured = Array.from(scene.querySelectorAll('circle')).filter(
      (circle) => circle.getAttribute('fill')?.startsWith('url('),
    );
    expect(coloured).toEqual([filled]);
    const voices = Array.from(
      scene.querySelectorAll('g[transform^="translate("]'),
    );
    const participant = voices.find((voice) =>
      voice
        .getAttribute('transform')!
        .startsWith(
          `translate(${ANSWER_BUBBLE.tail.tip.x} ${ANSWER_BUBBLE.tail.tip.y})`,
        ),
    );
    const prompt = voices.find((voice) =>
      voice
        .getAttribute('transform')!
        .startsWith(
          `translate(${PROMPT_BUBBLE.tail.tip.x} ${PROMPT_BUBBLE.tail.tip.y})`,
        ),
    );
    expect(participant).toBeDefined();
    expect(prompt?.contains(filled)).toBe(true);
    expect(participant!.querySelectorAll('circle')).toHaveLength(0);
    expect(shown(participant!)).toBe(true);
  });

  it('keeps the scene out of the accessibility tree', () => {
    const { container } = renderWithIntl(<DesignPrinciples />);

    const scenes = container.querySelectorAll('svg');
    expect(scenes.length).toBeGreaterThan(0);
    for (const scene of scenes) {
      expect(scene.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });
});
