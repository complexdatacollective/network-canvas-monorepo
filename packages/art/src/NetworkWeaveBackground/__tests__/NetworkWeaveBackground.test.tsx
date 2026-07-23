import { render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import NetworkWeaveBackground from '../NetworkWeaveBackground';

describe('NetworkWeaveBackground', () => {
  it('renders as a decorative full-size background', () => {
    const { container } = render(
      <NetworkWeaveBackground
        className="custom-background"
        style={{ opacity: 0.4 }}
      />,
    );

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('focusable')).toBe('false');
    expect(svg?.getAttribute('preserveAspectRatio')).toBe('none');
    expect(svg?.classList.contains('custom-background')).toBe(true);
    expect(svg?.style.width).toBe('100%');
    expect(svg?.style.height).toBe('100%');
    expect(svg?.style.pointerEvents).toBe('none');
    expect(svg?.style.opacity).toBe('0.4');
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

    for (const tributary of container.querySelectorAll(
      '.network-weave__tributary',
    )) {
      expect(tributary.getAttribute('d')).toMatch(/^M -/);
      expect(tributary.getAttribute('d')).toContain(' C ');
    }

    expect(container.querySelector('circle')).toBeNull();
    expect(container.querySelector('.network-weave__quiet-zone')).toBeNull();
    expect(container.querySelector('filter')).toBeNull();
  });

  it('gives the incoming lines and moving flow dots visual weight', () => {
    const { container } = render(
      <NetworkWeaveBackground complexity={12} strands={3} />,
    );

    for (const tributary of container.querySelectorAll(
      '.network-weave__tributary',
    )) {
      expect(Number(tributary.getAttribute('stroke-width'))).toBeGreaterThan(2);
    }
    for (const flow of container.querySelectorAll(
      '.network-weave__tributary-flow',
    )) {
      expect(Number(flow.getAttribute('stroke-width'))).toBeGreaterThanOrEqual(
        5,
      );
    }
  });

  it('uses a growing guide with unclipped rounded flow signals', () => {
    const { container } = render(
      <NetworkWeaveBackground complexity={12} strands={3} />,
    );
    const guides = container.querySelectorAll('.network-weave__ribbon-guide');
    const flows = container.querySelectorAll('.network-weave__ribbon-flow');

    expect(guides).toHaveLength(3);
    expect(flows).toHaveLength(9);
    guides.forEach((guide) => {
      const coordinates =
        guide
          .getAttribute('d')
          ?.match(/-?\d+(?:\.\d+)?/g)
          ?.map(Number) ?? [];
      const startWidth = Math.abs(
        (coordinates.at(-1) ?? 0) - (coordinates[1] ?? 0),
      );
      const endWidth = Math.abs((coordinates[9] ?? 0) - (coordinates[7] ?? 0));

      expect(endWidth).toBeGreaterThan(startWidth * 5);
      expect(guide.getAttribute('fill-opacity')).toBe('0.18');
    });
    flows.forEach((flow) => {
      expect(flow.tagName).toBe('rect');
      expect(flow.getAttribute('mask')).toBeNull();
      expect(flow.getAttribute('rx')).toBe('16');
      expect(flow.getAttribute('ry')).toBe('6');
      expect(flow.getAttribute('fill-opacity')).toBe('0.78');
      expect(flow.getAttribute('style')).toContain('offset-path: path(');
      expect(flow.getAttribute('style')).not.toContain("path('M -");
    });
    expect(container.querySelector('mask')).toBeNull();
    expect(container.querySelector('.network-weave__ribbon-flow-reveal')).toBe(
      null,
    );
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
        const coordinates =
          container
            .querySelectorAll('.network-weave__ribbon-guide')
            [laneIndex]?.getAttribute('data-centerline')
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

    expect(animated).toContain('@media (prefers-reduced-motion: reduce)');
    expect(animated).toContain('network-weave-ribbon-drift');
    expect(animated).toContain('network-weave-tributary-drift');
    expect(staticMarkup).not.toContain('@keyframes');
  });

  it('moves incoming dots faster than outgoing ribbon signals', () => {
    const { container } = render(
      <NetworkWeaveBackground animated speedFactor={2} />,
    );
    const styles = container.querySelector('style')?.textContent ?? '';
    const ribbonDuration = Number(
      styles.match(/ribbon-drift-\S+ ([\d.]+)s/)?.[1],
    );
    const tributaryDuration = Number(
      styles.match(/tributary-drift-\S+ ([\d.]+)s/)?.[1],
    );

    expect(ribbonDuration).toBe(4.5);
    expect(tributaryDuration).toBe(2.25);
    expect(tributaryDuration).toBeLessThan(ribbonDuration);
    expect(ribbonDuration / tributaryDuration).toBe(2);
  });

  it('loops flow motion without phase jumps', () => {
    const { container } = render(<NetworkWeaveBackground animated />);
    const styles = container.querySelector('style')?.textContent ?? '';

    expect(styles).toContain(
      'from { offset-distance: 0%; transform: scale(0.55, 0.35); } to { offset-distance: 100%; transform: scale(1.4, 3.8); }',
    );
    expect(styles).toContain(
      'from { stroke-dashoffset: 0; } to { stroke-dashoffset: -159; }',
    );

    for (const flow of container.querySelectorAll(
      '.network-weave__tributary-flow',
    )) {
      expect(flow.getAttribute('stroke-dasharray')).toBe('1 52');
    }
    for (const flow of container.querySelectorAll(
      '.network-weave__tributary-flow',
    )) {
      expect(flow.getAttribute('stroke-dashoffset')).toBeNull();
    }
    for (const signal of container.querySelectorAll(
      '.network-weave__ribbon-flow',
    )) {
      expect(signal.getAttribute('mask')).toBeNull();
    }
    expect(styles).not.toContain('opacity:');
    expect(container.innerHTML).toContain('animation-delay: -');
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
});
