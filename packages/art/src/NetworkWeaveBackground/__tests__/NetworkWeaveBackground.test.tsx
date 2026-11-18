import { act, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import NetworkWeaveBackground from '../NetworkWeaveBackground';
import { NETWORK_WEAVE_DOT_SPACING } from '../NetworkWeaveDots';
import createNetworkWeaveScene, {
  NETWORK_WEAVE_HEIGHT,
  NETWORK_WEAVE_SIGNAL_SEGMENTS,
  NETWORK_WEAVE_WIDTH,
  sampleCubicByLength,
} from '../networkWeaveScene';

const motionPreference = vi.hoisted(() => ({
  reduced: false as boolean | null,
}));

vi.mock('@codaco/fresco-ui/reducedMotion', () => ({
  usePrefersReducedMotion: () => motionPreference.reduced,
}));

const numbers = (text: string | null | undefined) =>
  text?.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];

/** The stylesheet the background renders alongside its moving parts. */
const stylesOf = (container: HTMLElement) =>
  container.querySelector('style')?.textContent ?? '';

/** What the dots' layer has been stepped to, in scene units. */
const dashOffsetOf = (container: HTMLElement) => {
  const dots = container.querySelector<SVGSVGElement>('.network-weave__dots');
  if (!dots) throw new Error('The dots layer did not render');
  return dots.style.getPropertyValue('--network-weave-dash');
};

/** How many steps a delay is, and how far that is from a whole number. */
const flowDelay = (delay: number, step: number) => Math.abs(delay) / step;
const flowUnit = (steps: number) => Math.abs(steps - Math.round(steps));

/** Gives the signal stage a size, as a laid-out page would. */
const sizeEveryElement = (width: number, height: number) => {
  const restore = [
    vi
      .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockReturnValue(width),
    vi
      .spyOn(HTMLElement.prototype, 'clientHeight', 'get')
      .mockReturnValue(height),
  ];
  return () => restore.forEach((spy) => spy.mockRestore());
};

beforeEach(() => {
  motionPreference.reduced = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('NetworkWeaveBackground', () => {
  it('renders as a decorative full-size background', () => {
    const { container } = render(
      <NetworkWeaveBackground
        className="custom-background"
        style={{ opacity: 0.4 }}
      />,
    );

    const background = container.firstElementChild;
    if (!(background instanceof HTMLElement)) {
      throw new Error('The background did not render');
    }
    expect(background.getAttribute('aria-hidden')).toBe('true');
    expect(background.classList.contains('custom-background')).toBe(true);
    expect(background.style.width).toBe('100%');
    expect(background.style.height).toBe('100%');
    expect(background.style.pointerEvents).toBe('none');
    expect(background.style.opacity).toBe('0.4');

    // Both drawings stretch to the background's box, whatever its shape.
    const drawings = container.querySelectorAll('svg');
    expect(drawings.length).toBeGreaterThan(0);
    for (const drawing of drawings) {
      expect(drawing.getAttribute('focusable')).toBe('false');
      expect(drawing.getAttribute('preserveAspectRatio')).toBe('none');
    }
  });

  it('fades the whole scene together by its intensity', () => {
    const { container } = render(<NetworkWeaveBackground intensity={0.3} />);
    const scene = container.querySelector<HTMLElement>('.network-weave__scene');

    // One group holds the ribbons, the dots and the signals, so they fade as
    // one drawing and blend only with each other.
    expect(scene?.style.opacity).toBe('0.3');
    expect(scene?.style.isolation).toBe('isolate');
    expect(scene?.querySelector('.network-weave__ribbon')).not.toBeNull();
    expect(scene?.querySelector('.network-weave__dots')).not.toBeNull();
    expect(scene?.querySelector('.network-weave__ribbon-flow')).not.toBeNull();
  });

  it('generates deterministic geometry from the seed', () => {
    const first = renderToStaticMarkup(
      <NetworkWeaveBackground seed="research-network" animated={false} />,
    );
    const second = renderToStaticMarkup(
      <NetworkWeaveBackground seed="research-network" animated={false} />,
    );
    const different = renderToStaticMarkup(
      <NetworkWeaveBackground seed="community-network" animated={false} />,
    );

    expect(first).toBe(second);
    expect(first).not.toBe(different);
  });

  it('uses the configured complexity, strands, and colors', () => {
    const { container } = render(
      <NetworkWeaveBackground
        complexity={12}
        strands={3}
        colors={['#123456', '#abcdef', '#fedcba']}
        animated={false}
      />,
    );

    expect(
      container.querySelectorAll('.network-weave__tributary'),
    ).toHaveLength(12);
    expect(container.querySelectorAll('.network-weave__ribbon')).toHaveLength(
      3,
    );
    expect(container.innerHTML).toContain('#123456');
    expect(container.innerHTML).toContain('#abcdef');
    expect(container.innerHTML).toContain('#fedcba');
  });

  it('uses tapered ribbons without independent shape marks', () => {
    const { container } = render(
      <NetworkWeaveBackground complexity={12} strands={3} animated={false} />,
    );

    const ribbons = container.querySelectorAll('.network-weave__ribbon');
    for (const ribbon of ribbons) {
      const path = ribbon.getAttribute('d');
      const coordinates =
        path?.match(/-?\d+(?:\.\d+)?/g)?.map((value) => Number(value)) ?? [];
      const upperStart = coordinates[1] ?? Number.POSITIVE_INFINITY;
      const lowerStart = coordinates.at(-1) ?? Number.NEGATIVE_INFINITY;

      expect(path).toMatch(/Z$/);
      expect(ribbon.getAttribute('fill')).toMatch(/^url\(/);
      expect(ribbon.getAttribute('stroke')).toBeNull();
      expect(Math.abs(lowerStart - upperStart)).toBeGreaterThan(5);
      expect(Math.abs(lowerStart - upperStart)).toBeLessThan(8);
    }

    const tributaries = container.querySelectorAll('.network-weave__tributary');
    expect(tributaries.length).toBeGreaterThan(0);
    for (const tributary of tributaries) {
      expect(tributary.getAttribute('d')).toMatch(/^M -/);
      expect(tributary.getAttribute('d')).toContain(' C ');
      expect(Number(tributary.getAttribute('stroke-width'))).toBeGreaterThan(0);
    }

    expect(container.querySelector('circle')).toBeNull();
    expect(container.querySelector('.network-weave__quiet-zone')).toBeNull();
    expect(container.querySelector('filter')).toBeNull();
  });

  it('uses a growing guide with unclipped rounded flow signals', () => {
    const colors = ['#123456', '#abcdef', '#fedcba'];
    const { container } = render(
      <NetworkWeaveBackground complexity={12} strands={3} colors={colors} />,
    );
    const guides = container.querySelectorAll('.network-weave__ribbon-guide');
    const flows = container.querySelectorAll<HTMLElement>(
      '.network-weave__ribbon-flow',
    );

    expect(guides).toHaveLength(3);
    expect(flows).toHaveLength(9);
    guides.forEach((guide) => {
      const coordinates = numbers(guide.getAttribute('d'));
      const startWidth = Math.abs(
        (coordinates.at(-1) ?? 0) - (coordinates[1] ?? 0),
      );
      const endWidth = Math.abs((coordinates[9] ?? 0) - (coordinates[7] ?? 0));

      expect(endWidth).toBeGreaterThan(startWidth * 5);
    });
    // Three signals to a ribbon, each in its ribbon's colour.
    flows.forEach((flow, index) => {
      expect(flow.style.backgroundColor).toBe(
        // jsdom reports the colour it was given as rgb().
        Object.assign(document.createElement('div').style, {
          backgroundColor: colors[Math.floor(index / 3)],
        }).backgroundColor,
      );
    });
    const [, radiusX, radiusY] =
      stylesOf(container).match(/border-radius: ([\d.]+)px \/ ([\d.]+)px/) ??
      [];
    expect(Number(radiusX)).toBeGreaterThan(0);
    expect(Number(radiusY)).toBeGreaterThan(0);
    expect(container.querySelector('mask')).toBeNull();
    expect(container.innerHTML).not.toContain('mask');
  });

  it('keeps the moving parts out of the drawing that holds the ribbons', () => {
    const { container } = render(<NetworkWeaveBackground />);
    const ribbons = container.querySelector('.network-weave__ribbons');
    const dots = container.querySelector('.network-weave__dots');

    // Anything that moves inside the ribbons' drawing has the whole of it
    // repainted for every frame it moves in.
    expect(ribbons?.querySelector('.network-weave__ribbon')).not.toBeNull();
    expect(ribbons?.querySelector('.network-weave__tributary-flow')).toBeNull();
    expect(ribbons?.querySelector('.network-weave__ribbon-flow')).toBeNull();
    expect(dots).not.toBe(ribbons);
    expect(
      dots?.querySelectorAll('.network-weave__tributary-flow').length,
    ).toBe(container.querySelectorAll('.network-weave__tributary').length);
    for (const flow of container.querySelectorAll(
      '.network-weave__ribbon-flow',
    )) {
      expect(flow.closest('svg')).toBeNull();
    }
    // The signals are moved by `transform` alone, the one kind of movement a
    // browser can make without repainting.
    const keyframes =
      stylesOf(container)
        .split('\n')
        .find((rule) => rule.trim().startsWith('@keyframes')) ?? '';
    const declarations = [...keyframes.matchAll(/\{\s*([a-z-]+):/g)].map(
      (match) => match[1],
    );
    expect(declarations.length).toBe(NETWORK_WEAVE_SIGNAL_SEGMENTS + 1);
    expect(new Set(declarations)).toEqual(new Set(['transform']));
  });

  it('keeps tributary and ribbon tangents continuous at the join', () => {
    const verifyTangents = (
      orientation: 'horizontal' | 'vertical',
      reverse: boolean,
    ) => {
      const { container } = render(
        <NetworkWeaveBackground
          complexity={12}
          strands={3}
          orientation={orientation}
          reverse={reverse}
          animated={false}
        />,
      );
      const tributaries = container.querySelectorAll(
        '.network-weave__tributary',
      );
      const centerlines = container.querySelectorAll(
        '.network-weave__ribbon-guide',
      );

      tributaries.forEach((tributary, index) => {
        const tributaryCoordinates =
          tributary
            .getAttribute('d')
            ?.match(/-?\d+(?:\.\d+)?/g)
            ?.map(Number) ?? [];
        const centerlineCoordinates =
          centerlines[index % 3]
            ?.getAttribute('data-centerline')
            ?.match(/-?\d+(?:\.\d+)?/g)
            ?.map(Number) ?? [];
        const incomingX =
          (tributaryCoordinates[6] ?? 0) - (tributaryCoordinates[4] ?? 0);
        const incomingY =
          (tributaryCoordinates[7] ?? 0) - (tributaryCoordinates[5] ?? 0);
        const outgoingX =
          (centerlineCoordinates[2] ?? 0) - (centerlineCoordinates[0] ?? 0);
        const outgoingY =
          (centerlineCoordinates[3] ?? 0) - (centerlineCoordinates[1] ?? 0);
        const crossProduct = Math.abs(
          incomingX * outgoingY - incomingY * outgoingX,
        );
        const magnitude =
          Math.hypot(incomingX, incomingY) * Math.hypot(outgoingX, outgoingY);

        expect(crossProduct / magnitude).toBeLessThan(0.001);
      });
    };

    verifyTangents('horizontal', false);
    verifyTangents('vertical', true);
  });

  it.each([
    ['horizontal', false],
    ['horizontal', true],
    ['vertical', false],
    ['vertical', true],
  ] as const)(
    'places the %s flow convergence at the configured coordinates when reverse is %s',
    (orientation, reverse) => {
      const { container } = render(
        <NetworkWeaveBackground
          complexity={12}
          strands={3}
          convergence={{ x: 0.29, y: 0.6 }}
          orientation={orientation}
          reverse={reverse}
          animated={false}
        />,
      );
      const middleGuide = container.querySelectorAll(
        '.network-weave__ribbon-guide',
      )[1];
      const coordinates =
        middleGuide
          ?.getAttribute('data-centerline')
          ?.match(/-?\d+(?:\.\d+)?/g)
          ?.map(Number) ?? [];

      expect((coordinates[0] ?? 0) / 1600).toBeCloseTo(0.29, 4);
      expect((coordinates[1] ?? 0) / 900).toBeCloseTo(0.6, 4);
    },
  );

  it.each([
    ['horizontal', false],
    ['horizontal', true],
    ['vertical', false],
    ['vertical', true],
  ] as const)(
    'keeps the %s flow monotonic at coordinate edges when reverse is %s',
    (orientation, reverse) => {
      for (const convergence of [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]) {
        const { container } = render(
          <NetworkWeaveBackground
            complexity={12}
            strands={3}
            convergence={convergence}
            orientation={orientation}
            reverse={reverse}
            animated={false}
          />,
        );
        const middleGuide = container.querySelectorAll(
          '.network-weave__ribbon-guide',
        )[1];
        const coordinates =
          middleGuide
            ?.getAttribute('data-centerline')
            ?.match(/-?\d+(?:\.\d+)?/g)
            ?.map(Number) ?? [];
        const axisCoordinates =
          orientation === 'horizontal'
            ? [coordinates[0], coordinates[2], coordinates[4], coordinates[6]]
            : [coordinates[1], coordinates[3], coordinates[5], coordinates[7]];
        const deltas = axisCoordinates
          .slice(1)
          .map(
            (coordinate, index) =>
              (coordinate ?? 0) - (axisCoordinates[index] ?? 0),
          );

        expect(deltas.every((delta) => (reverse ? delta < 0 : delta > 0))).toBe(
          true,
        );
      }
    },
  );

  it.each([
    ['horizontal', false],
    ['horizontal', true],
    ['vertical', false],
    ['vertical', true],
  ] as const)(
    'keeps the %s ribbon arcs continuous across lane positions when reverse is %s',
    (orientation, reverse) => {
      const convergenceAt = (cross: number) =>
        orientation === 'horizontal'
          ? { x: 0.5, y: cross }
          : { x: cross, y: 0.5 };
      const { container, rerender } = render(
        <NetworkWeaveBackground
          complexity={12}
          strands={4}
          convergence={convergenceAt(0.081)}
          orientation={orientation}
          reverse={reverse}
          animated={false}
        />,
      );
      const firstControlCross = (laneIndex: number) => {
        const guides = container.querySelectorAll(
          '.network-weave__ribbon-guide',
        );
        const coordinates =
          guides[laneIndex]
            ?.getAttribute('data-centerline')
            ?.match(/-?\d+(?:\.\d+)?/g)
            ?.map(Number) ?? [];
        expect(coordinates).toHaveLength(8);

        return (
          (orientation === 'horizontal' ? coordinates[3] : coordinates[2]) ?? 0
        );
      };
      const crossings = [
        { laneIndex: 0, before: 0.081, after: 0.079 },
        { laneIndex: 1, before: 0.141, after: 0.139 },
        { laneIndex: 2, before: 0.859, after: 0.861 },
        { laneIndex: 3, before: 0.919, after: 0.921 },
      ];

      crossings.forEach(({ laneIndex, before, after }) => {
        rerender(
          <NetworkWeaveBackground
            complexity={12}
            strands={4}
            convergence={convergenceAt(before)}
            orientation={orientation}
            reverse={reverse}
            animated={false}
          />,
        );
        const controlBefore = firstControlCross(laneIndex);

        rerender(
          <NetworkWeaveBackground
            complexity={12}
            strands={4}
            convergence={convergenceAt(after)}
            orientation={orientation}
            reverse={reverse}
            animated={false}
          />,
        );
        const controlAfter = firstControlCross(laneIndex);

        expect(Math.abs(controlAfter - controlBefore)).toBeLessThan(4);
      });
    },
  );

  it('supports vertical and reversed flows', () => {
    const horizontal = renderToStaticMarkup(
      <NetworkWeaveBackground seed="layout" animated={false} />,
    );
    const vertical = renderToStaticMarkup(
      <NetworkWeaveBackground
        seed="layout"
        orientation="vertical"
        animated={false}
      />,
    );
    const reversed = renderToStaticMarkup(
      <NetworkWeaveBackground seed="layout" reverse animated={false} />,
    );

    expect(vertical).not.toBe(horizontal);
    expect(reversed).not.toBe(horizontal);
  });

  it('configures the trailing flare and ribbon blend mode', () => {
    const compact = renderToStaticMarkup(
      <NetworkWeaveBackground flare={0} animated={false} />,
    );
    const flared = renderToStaticMarkup(
      <NetworkWeaveBackground
        flare={2}
        blendMode="multiply"
        animated={false}
      />,
    );
    const { container } = render(
      <NetworkWeaveBackground blendMode="multiply" animated={false} />,
    );

    expect(flared).not.toBe(compact);
    for (const ribbon of container.querySelectorAll('.network-weave__ribbon')) {
      expect(ribbon.getAttribute('style')).toContain(
        'mix-blend-mode: multiply',
      );
    }
  });

  it('disables its optional motion for reduced-motion preferences', () => {
    const animated = renderToStaticMarkup(
      <NetworkWeaveBackground animated speedFactor={2} />,
    );
    const staticMarkup = renderToStaticMarkup(
      <NetworkWeaveBackground animated={false} />,
    );

    // Reduced under an `always` provider, and under the system preference
    // unless a provider says `never`.
    expect(animated).toContain(
      ":root[data-reduced-motion='always'] .network-weave-ribbon-flow",
    );
    expect(animated).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{ :root:not\(\[data-reduced-motion='never'\]\) \.network-weave-ribbon-flow/,
    );
    expect(animated).toContain('network-weave-ribbon-drift');
    expect(staticMarkup).not.toContain('@keyframes');
    expect(staticMarkup).not.toContain('network-weave__ribbon-flow');
    expect(staticMarkup).not.toContain('network-weave__tributary-flow');
  });

  it('steps the dots along their tributaries, at the speed asked for', () => {
    vi.useFakeTimers({
      toFake: ['setInterval', 'clearInterval', 'performance'],
    });
    const travelAfterOneSecond = (speedFactor: number) => {
      const { container, unmount } = render(
        <NetworkWeaveBackground speedFactor={speedFactor} />,
      );
      const before = Number.parseFloat(dashOffsetOf(container));
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      const after = Number.parseFloat(dashOffsetOf(container));
      unmount();
      // The offset counts down, wrapping once per dot spacing.
      return (
        (before - after + NETWORK_WEAVE_DOT_SPACING) % NETWORK_WEAVE_DOT_SPACING
      );
    };

    const slow = travelAfterOneSecond(0.2);
    const fast = travelAfterOneSecond(0.4);

    expect(slow).toBeGreaterThan(1);
    expect(fast / slow).toBeCloseTo(2, 1);
  });

  it('leaves the dots where they are under reduced motion', () => {
    vi.useFakeTimers({
      toFake: ['setInterval', 'clearInterval', 'performance'],
    });
    motionPreference.reduced = true;
    const { container } = render(<NetworkWeaveBackground />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(dashOffsetOf(container)).toBe('');
  });

  it('does not step the dots before the motion preference is known', () => {
    vi.useFakeTimers({
      toFake: ['setInterval', 'clearInterval', 'performance'],
    });
    motionPreference.reduced = null;
    const { container } = render(<NetworkWeaveBackground />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(dashOffsetOf(container)).toBe('');
  });

  it('redraws the dots a few times a second, not on every frame', () => {
    vi.useFakeTimers({
      toFake: ['setInterval', 'clearInterval', 'performance'],
    });
    // The speed the websites use: the dots drift a few scene units a second.
    const { container } = render(<NetworkWeaveBackground speedFactor={0.18} />);
    const offsets = new Set<string>();
    for (let frame = 0; frame < 60; frame += 1) {
      act(() => {
        vi.advanceTimersByTime(1000 / 60);
      });
      offsets.add(dashOffsetOf(container));
    }

    // Sixty display frames pass; the dots are redrawn for a fraction of them.
    expect(offsets.size).toBeGreaterThanOrEqual(8);
    expect(offsets.size).toBeLessThanOrEqual(15);
  });

  it('speeds the signals up with the speed factor', () => {
    const durationAt = (speedFactor: number) => {
      const { container, unmount } = render(
        <NetworkWeaveBackground animated speedFactor={speedFactor} />,
      );
      const duration = Number(
        stylesOf(container).match(/ribbon-drift-\S+ ([\d.]+)s/)?.[1],
      );
      unmount();
      return duration;
    };

    expect(durationAt(1) / durationAt(2)).toBeCloseTo(2, 5);
  });

  it('loops flow motion without phase jumps', () => {
    const { container } = render(<NetworkWeaveBackground animated />);

    const tributaryFlows = container.querySelectorAll<SVGPathElement>(
      '.network-weave__tributary-flow',
    );
    expect(tributaryFlows.length).toBeGreaterThan(0);
    for (const flow of tributaryFlows) {
      // The dots' offset wraps once per dot spacing, so a wrap is invisible
      // only if that spacing is the dash pattern's own period.
      const dashPeriod = numbers(flow.getAttribute('stroke-dasharray')).reduce(
        (sum, length) => sum + length,
        0,
      );
      expect(dashPeriod).toBe(NETWORK_WEAVE_DOT_SPACING);
      expect(flow.style.strokeDashoffset).toContain(
        'var(--network-weave-dash, 0px)',
      );
    }

    // A signal ends its journey past the far edge and starts again at the
    // convergence, from the first stop to the last.
    const styles = stylesOf(container);
    expect(styles).toMatch(
      /@keyframes \S+ \{ 0% \{ transform: translate\(var\(--weave-stop-0\)\)/,
    );
    expect(styles).toContain(
      `100% { transform: translate(var(--weave-stop-${NETWORK_WEAVE_SIGNAL_SEGMENTS}))`,
    );
    expect(styles).not.toContain('opacity: 0;');
    expect(container.innerHTML).toContain('animation-delay: -');
  });

  it('steps every signal at the same moments', () => {
    for (const speedFactor of [0.18, 0.35, 1, 2.6]) {
      const { container, unmount } = render(
        <NetworkWeaveBackground animated speedFactor={speedFactor} />,
      );
      const [, duration, stepsPerSegment] =
        stylesOf(container).match(
          /ribbon-drift-\S+ ([\d.]+)s steps\((\d+)\) infinite/,
        ) ?? [];
      const step =
        (Number(duration) * 1000) /
        (NETWORK_WEAVE_SIGNAL_SEGMENTS * Number(stepsPerSegment));

      // About thirty steps a second, whatever the speed.
      expect(1000 / step).toBeGreaterThan(24);
      expect(1000 / step).toBeLessThan(36);

      const delays = [
        ...container.querySelectorAll<HTMLElement>(
          '.network-weave__ribbon-flow',
        ),
      ].map((flow) => Number.parseFloat(flow.style.animationDelay));
      expect(new Set(delays).size).toBe(delays.length);
      for (const delay of delays) {
        expect(flowUnit(flowDelay(delay, step))).toBeLessThan(0.001);
      }
      unmount();
    }
  });

  it('follows each ribbon with its signals', () => {
    const { container } = render(
      <NetworkWeaveBackground complexity={12} strands={3} />,
    );
    const guides = container.querySelectorAll('.network-weave__ribbon-guide');
    const groups = new Set(
      [
        ...container.querySelectorAll<HTMLElement>(
          '.network-weave__ribbon-flow',
        ),
      ].map((flow) => flow.parentElement),
    );

    expect(groups.size).toBe(guides.length);
    [...groups].forEach((group, index) => {
      const centerline = numbers(
        guides[index]?.getAttribute('data-centerline'),
      );
      const stop = (position: number) =>
        numbers(group?.style.getPropertyValue(`--weave-stop-${position}`));

      // The first stop is the centreline's start and the last is its end.
      expect(stop(0)[0]).toBeCloseTo(centerline[0] ?? Number.NaN, 1);
      expect(stop(0)[1]).toBeCloseTo(centerline[1] ?? Number.NaN, 1);
      expect(stop(NETWORK_WEAVE_SIGNAL_SEGMENTS)[0]).toBeCloseTo(
        centerline[6] ?? Number.NaN,
        1,
      );
      expect(stop(NETWORK_WEAVE_SIGNAL_SEGMENTS)[1]).toBeCloseTo(
        centerline[7] ?? Number.NaN,
        1,
      );
      expect(
        group?.style.getPropertyValue(
          `--weave-turn-${NETWORK_WEAVE_SIGNAL_SEGMENTS}`,
        ),
      ).toMatch(/deg$/);
    });
  });

  it('stretches the signals to the size of the background', () => {
    const restore = sizeEveryElement(800, 1350);
    const { container } = render(<NetworkWeaveBackground />);
    restore();
    const stage = container.querySelector<HTMLElement>(
      '.network-weave__signals',
    );

    expect(
      Number(stage?.style.getPropertyValue('--network-weave-scale-x')),
    ).toBeCloseTo(800 / NETWORK_WEAVE_WIDTH, 6);
    expect(
      Number(stage?.style.getPropertyValue('--network-weave-scale-y')),
    ).toBeCloseTo(1350 / NETWORK_WEAVE_HEIGHT, 6);
    expect(stage?.hasAttribute('data-measured')).toBe(true);
  });

  it('keeps the signals hidden until their size is known', () => {
    // jsdom lays nothing out, so the stage measures as empty.
    const { container } = render(<NetworkWeaveBackground />);
    const stage = container.querySelector<HTMLElement>(
      '.network-weave__signals',
    );

    expect(stage?.hasAttribute('data-measured')).toBe(false);
    expect(stylesOf(container)).toContain(
      '.network-weave__signals:not([data-measured]) { visibility: hidden; }',
    );
  });

  it('draws the dots only over the part of the scene the tributaries cross', () => {
    const boxOf = (
      props: Parameters<typeof NetworkWeaveBackground>[0],
    ): { left: number; top: number; width: number; height: number } | null => {
      const { container, unmount } = render(
        <NetworkWeaveBackground {...props} />,
      );
      const dots = container.querySelector<SVGSVGElement>(
        '.network-weave__dots',
      );
      const box = dots
        ? {
            left: Number.parseFloat(dots.style.left),
            top: Number.parseFloat(dots.style.top),
            width: Number.parseFloat(dots.style.width),
            height: Number.parseFloat(dots.style.height),
          }
        : null;
      unmount();
      return box;
    };

    const horizontal = boxOf({ convergence: { x: 0.4, y: 0.5 } });
    expect(horizontal?.left).toBe(0);
    expect(horizontal?.width).toBeGreaterThan(40);
    expect(horizontal?.width).toBeLessThan(41);
    expect(horizontal?.height).toBe(100);

    const reversed = boxOf({ convergence: { x: 0.4, y: 0.5 }, reverse: true });
    expect(reversed?.width).toBeGreaterThan(60);
    expect(reversed?.width).toBeLessThan(61);
    expect((reversed?.left ?? 0) + (reversed?.width ?? 0)).toBeCloseTo(100, 3);

    const vertical = boxOf({
      convergence: { x: 0.5, y: 0.25 },
      orientation: 'vertical',
    });
    expect(vertical?.top).toBe(0);
    expect(vertical?.width).toBe(100);
    expect(vertical?.height).toBeGreaterThan(25);
    expect(vertical?.height).toBeLessThan(26);

    // A convergence on the edge the tributaries flow in from leaves them
    // outside the scene, with nothing to step.
    expect(boxOf({ convergence: { x: 0, y: 0 } })).toBeNull();
    expect(
      boxOf({ convergence: { x: 0.5, y: 0 }, orientation: 'vertical' }),
    ).toBeNull();
    expect(boxOf({ convergence: { x: 1, y: 0.5 }, reverse: true })).toBeNull();
  });

  it('falls back safely when numeric props are not finite', () => {
    const markup = renderToStaticMarkup(
      <NetworkWeaveBackground
        complexity={Number.NaN}
        strands={Number.POSITIVE_INFINITY}
        intensity={Number.NEGATIVE_INFINITY}
        flare={Number.NaN}
        speedFactor={Number.NaN}
        convergence={{ x: Number.NaN, y: Number.NaN }}
      />,
    );

    expect(markup).not.toContain('NaN');
    expect(markup).not.toContain('Infinity');
  });

  it('keeps every tributary inside the box its dots are drawn in', () => {
    for (const orientation of ['horizontal', 'vertical'] as const) {
      for (const reverse of [false, true]) {
        for (const seed of ['one', 'two', 'three']) {
          const scene = createNetworkWeaveScene({
            seed,
            complexity: 24,
            strands: 4,
            colorCount: 5,
            convergence: { x: 0.37, y: 0.58 },
            orientation,
            reverse,
            flare: 1.5,
          });
          const bounds = scene.tributaryBounds;
          if (!bounds) throw new Error('The tributaries have no bounds');

          for (const tributary of scene.tributaries) {
            const coordinates = numbers(tributary.d);
            // A curve stays inside its control points, so it is enough that
            // the ones inside the scene are inside the box.
            for (let index = 0; index < coordinates.length; index += 2) {
              const x = coordinates[index] ?? 0;
              const y = coordinates[index + 1] ?? 0;
              const along = orientation === 'horizontal' ? x : y;
              const start = orientation === 'horizontal' ? bounds.x : bounds.y;
              const size =
                orientation === 'horizontal' ? bounds.width : bounds.height;
              if (reverse) expect(along).toBeGreaterThanOrEqual(start);
              else expect(along).toBeLessThanOrEqual(start + size);
            }
          }
        }
      }
    }
  });
});

describe('sampleCubicByLength', () => {
  // Control points bunched at one end: the curve's own parameter crowds its
  // points there.
  const bunched = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 20, y: 5 },
    { x: 1000, y: 400 },
  ] as const;

  it('spaces its stops evenly along the curve', () => {
    const stops = sampleCubicByLength([...bunched], 16);
    const gaps = stops
      .slice(1)
      .map((stop, index) =>
        Math.hypot(
          stop.x - (stops[index]?.x ?? 0),
          stop.y - (stops[index]?.y ?? 0),
        ),
      );

    expect(stops).toHaveLength(17);
    expect(stops[0]).toMatchObject({ x: 0, y: 0 });
    expect(stops.at(-1)?.x).toBeCloseTo(1000, 6);
    expect(stops.at(-1)?.y).toBeCloseTo(400, 6);
    // Evenly spaced in the curve's parameter, the first gap would be a
    // hundredth of the last.
    expect(Math.min(...gaps) / Math.max(...gaps)).toBeGreaterThan(0.97);
  });

  it.each([
    { name: 'anticlockwise', bend: 1 },
    { name: 'clockwise', bend: -1 },
  ])('turns the short way from each stop to the next, $name', ({ bend }) => {
    // Heading left, the curve's direction crosses half a turn, where an
    // angle read on its own jumps by a whole turn: one way for a curve
    // bending anticlockwise, the other for its mirror image.
    const stops = sampleCubicByLength(
      [
        { x: 0, y: 0 },
        { x: -100, y: 30 * bend },
        { x: -200, y: -30 * bend },
        { x: -300, y: 0 },
      ],
      24,
    );
    const headings = stops.map((stop) => stop.angle);
    const turns = headings
      .slice(1)
      .map((heading, index) => Math.abs(heading - (headings[index] ?? 0)));

    expect(Math.max(...turns)).toBeLessThan(30);
    // The curve does cross: its headings lie on both sides of half a turn.
    expect(Math.min(...headings.map(Math.abs))).toBeLessThan(180);
    expect(Math.max(...headings.map(Math.abs))).toBeGreaterThan(180);
  });
});
