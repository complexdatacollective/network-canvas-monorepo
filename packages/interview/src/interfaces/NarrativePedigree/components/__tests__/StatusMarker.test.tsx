import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Status } from '../../genetics/status';
import { HomozygousMarker, StatusMarker } from '../StatusMarker';

describe('StatusMarker', () => {
  describe('data-status attribute', () => {
    const statuses: Status[] = [
      'affected',
      'obligateAffected',
      'obligateCarrier',
      'atRiskAffected',
      'atRiskCarrier',
      'unknown',
    ];

    it.each(statuses)('renders data-status="%s"', (status) => {
      render(<StatusMarker status={status} color="#e53e3e" shape="square" />);
      const el = document.querySelector(`[data-status="${status}"]`);
      expect(el).toBeInTheDocument();
    });
  });

  describe('distinguishing SVG elements per status (Bennett 2022)', () => {
    it('affected: renders a solid [data-filled-shape]', () => {
      const { container } = render(
        <StatusMarker status="affected" color="#e53e3e" shape="square" />,
      );
      expect(container.querySelector('[data-filled-shape]')).toBeTruthy();
    });

    // obligateAffected ("will develop it") is a single vertical line through the
    // centre — NOT a solid fill (that distinction is now drawn, per Bennett).
    it('obligateAffected: renders a [data-vertical-line], not a fill', () => {
      const { container } = render(
        <StatusMarker
          status="obligateAffected"
          color="#dd6b20"
          shape="circle"
        />,
      );
      expect(container.querySelector('[data-vertical-line]')).toBeTruthy();
      expect(container.querySelector('[data-filled-shape]')).toBeNull();
    });

    it('obligateCarrier: renders a [data-hatch-fill] horizontal line-fill', () => {
      const { container } = render(
        <StatusMarker
          status="obligateCarrier"
          color="#d69e2e"
          shape="circle"
        />,
      );
      expect(container.querySelector('[data-hatch-fill]')).toBeTruthy();
      // The 2022 revision drops the central dot.
      expect(container.querySelector('[data-centre-dot]')).toBeNull();
    });

    it('atRiskCarrier: hatch + a broken-out "?" on a white break', () => {
      const { container } = render(
        <StatusMarker status="atRiskCarrier" color="#3182ce" shape="circle" />,
      );
      expect(container.querySelector('[data-hatch-fill]')).toBeTruthy();
      expect(container.querySelector('[data-query-break]')).toBeTruthy();
      const qMark = container.querySelector('[data-question-mark]');
      expect(qMark?.textContent).toBe('?');
    });

    it('atRiskAffected: broken vertical line + "?" on a white break', () => {
      const { container } = render(
        <StatusMarker status="atRiskAffected" color="#38a169" shape="square" />,
      );
      expect(container.querySelector('[data-vertical-line]')).toBeTruthy();
      expect(container.querySelector('[data-query-break]')).toBeTruthy();
      const qMark = container.querySelector('[data-question-mark]');
      expect(qMark?.textContent).toBe('?');
    });

    it('unknown: plain outline only — no fill, line, hatch, or "?"', () => {
      const { container } = render(
        <StatusMarker status="unknown" color="#805ad5" shape="diamond" />,
      );
      expect(container.querySelector('[data-filled-shape]')).toBeNull();
      expect(container.querySelector('[data-vertical-line]')).toBeNull();
      expect(container.querySelector('[data-hatch-fill]')).toBeNull();
      expect(container.querySelector('[data-question-mark]')).toBeNull();
      expect(container.querySelector('[data-shape-outline]')).toBeTruthy();
    });
  });

  describe('color prop is applied', () => {
    it('affected: fill attribute on [data-filled-shape] matches color prop', () => {
      const { container } = render(
        <StatusMarker status="affected" color="#fedcba" shape="circle" />,
      );
      const shape = container.querySelector('[data-filled-shape]');
      expect(shape?.getAttribute('fill')).toBe('#fedcba');
    });

    it('obligateAffected: stroke on the vertical line uses the color prop', () => {
      const { container } = render(
        <StatusMarker
          status="obligateAffected"
          color="#abcdef"
          shape="circle"
        />,
      );
      // The unbroken line carries data-vertical-line on the <line> itself.
      const line = container.querySelector('line[data-vertical-line]');
      expect(line?.getAttribute('stroke')).toBe('#abcdef');
    });
  });

  describe('shape-aware rendering', () => {
    it.each(['square', 'circle', 'diamond'] as const)(
      'affected renders without error for shape=%s',
      (shape) => {
        expect(() =>
          render(<StatusMarker status="affected" color="#f00" shape={shape} />),
        ).not.toThrow();
      },
    );

    it('affected/circle renders a <circle> not a <rect>', () => {
      const { container } = render(
        <StatusMarker status="affected" color="#f00" shape="circle" />,
      );
      expect(
        container.querySelector('[data-filled-shape]')?.tagName.toLowerCase(),
      ).toBe('circle');
    });

    it('affected/square renders a <rect>', () => {
      const { container } = render(
        <StatusMarker status="affected" color="#f00" shape="square" />,
      );
      expect(
        container.querySelector('[data-filled-shape]')?.tagName.toLowerCase(),
      ).toBe('rect');
    });

    it('affected/diamond renders a <rect> with a rotate(45) transform', () => {
      const { container } = render(
        <StatusMarker status="affected" color="#f00" shape="diamond" />,
      );
      const shape = container.querySelector('[data-filled-shape]');
      expect(shape?.tagName.toLowerCase()).toBe('rect');
      expect(shape?.getAttribute('transform')).toMatch(/rotate\(45/);
    });
  });

  describe('disease-coloured shape outline', () => {
    it('obligateCarrier: renders [data-shape-outline] with the disease color', () => {
      const { container } = render(
        <StatusMarker
          status="obligateCarrier"
          color="#d69e2e"
          shape="circle"
        />,
      );
      const outline = container.querySelector('[data-shape-outline]');
      expect(outline).toBeTruthy();
      expect(outline?.getAttribute('stroke')).toBe('#d69e2e');
    });

    it('affected: renders [data-shape-outline] alongside the fill', () => {
      const { container } = render(
        <StatusMarker status="affected" color="#e53e3e" shape="square" />,
      );
      expect(container.querySelector('[data-shape-outline]')).toBeTruthy();
      expect(container.querySelector('[data-filled-shape]')).toBeTruthy();
    });

    it.each(['square', 'circle', 'diamond'] as const)(
      'renders [data-shape-outline] for all shapes (obligateCarrier, shape=%s)',
      (shape) => {
        const { container } = render(
          <StatusMarker status="obligateCarrier" color="#f00" shape={shape} />,
        );
        expect(container.querySelector('[data-shape-outline]')).toBeTruthy();
      },
    );
  });

  describe('surfaceColor on the at-risk "?" disc', () => {
    // The "?" disc is the symbol field behind the at-risk glyph. Dimmed callers
    // pass a background-blended surfaceColor so the disc recedes with the rest of
    // the symbol instead of staying a bright white island on a dimmed node.
    it('atRiskAffected: disc adopts the surfaceColor prop', () => {
      const { container } = render(
        <StatusMarker
          status="atRiskAffected"
          color="#38a169"
          shape="square"
          surfaceColor="#102030"
        />,
      );
      expect(
        container.querySelector('[data-query-break]')?.getAttribute('fill'),
      ).toBe('#102030');
    });

    it('atRiskCarrier: disc adopts the surfaceColor prop', () => {
      const { container } = render(
        <StatusMarker
          status="atRiskCarrier"
          color="#3182ce"
          shape="circle"
          surfaceColor="#102030"
        />,
      );
      expect(
        container.querySelector('[data-query-break]')?.getAttribute('fill'),
      ).toBe('#102030');
    });

    it('defaults the disc to white when no surfaceColor is given', () => {
      const { container } = render(
        <StatusMarker status="atRiskAffected" color="#38a169" shape="square" />,
      );
      expect(
        container.querySelector('[data-query-break]')?.getAttribute('fill'),
      ).toBe('white');
    });
  });

  describe('aria-hidden on root SVG', () => {
    it('SVG is aria-hidden', () => {
      const { container } = render(
        <StatusMarker status="affected" color="#f00" shape="square" />,
      );
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('aria-hidden')).toBeTruthy();
    });
  });

  describe('HomozygousMarker override glyph', () => {
    it('renders data-status="atRiskHomozygous"', () => {
      render(<HomozygousMarker color="#e53e3e" shape="square" />);
      expect(
        document.querySelector('[data-status="atRiskHomozygous"]'),
      ).toBeInTheDocument();
    });

    it('is a solid fill (condition colour) with a centred WHITE "?"', () => {
      const { container } = render(
        <HomozygousMarker color="#e53e3e" shape="circle" />,
      );
      const filled = container.querySelector('[data-filled-shape]');
      expect(filled?.getAttribute('fill')).toBe('#e53e3e');
      const qMark = container.querySelector('[data-question-mark]');
      expect(qMark?.textContent).toBe('?');
      expect(qMark?.getAttribute('fill')).toBe('white');
      // No white circular break behind the "?" — it reads on the solid fill.
      expect(container.querySelector('[data-query-break]')).toBeNull();
    });
  });
});
