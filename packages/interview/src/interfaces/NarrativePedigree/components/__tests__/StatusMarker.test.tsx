import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Status } from '../../genetics/status';
import { StatusMarker } from '../StatusMarker';

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

  describe('distinguishing SVG elements per status', () => {
    it('affected: renders [data-filled-shape]', () => {
      const { container } = render(
        <StatusMarker status="affected" color="#e53e3e" shape="square" />,
      );
      expect(container.querySelector('[data-filled-shape]')).toBeTruthy();
    });

    // Display merge: obligateAffected draws the same filled glyph as affected
    // (no double-outline distinguisher) — the engine still computes it, but the
    // participant view collapses both into "Has this condition".
    it('obligateAffected: renders the same filled glyph as affected', () => {
      const { container } = render(
        <StatusMarker
          status="obligateAffected"
          color="#dd6b20"
          shape="circle"
        />,
      );
      expect(container.querySelector('[data-filled-shape]')).toBeTruthy();
      expect(container.querySelector('[data-double-outline]')).toBeNull();
    });

    it('obligateCarrier: renders [data-centre-dot]', () => {
      const { container } = render(
        <StatusMarker
          status="obligateCarrier"
          color="#d69e2e"
          shape="circle"
        />,
      );
      expect(container.querySelector('[data-centre-dot]')).toBeTruthy();
    });

    it('atRiskCarrier: renders [data-centre-dot]', () => {
      const { container } = render(
        <StatusMarker status="atRiskCarrier" color="#3182ce" shape="circle" />,
      );
      expect(container.querySelector('[data-centre-dot]')).toBeTruthy();
    });

    it('atRiskAffected: renders [data-half-fill]', () => {
      const { container } = render(
        <StatusMarker status="atRiskAffected" color="#38a169" shape="square" />,
      );
      expect(container.querySelector('[data-half-fill]')).toBeTruthy();
    });

    it('unknown: renders [data-question-mark] with ? text', () => {
      const { container } = render(
        <StatusMarker status="unknown" color="#805ad5" shape="diamond" />,
      );
      const qMark = container.querySelector('[data-question-mark]');
      expect(qMark).toBeTruthy();
      expect(qMark?.textContent).toBe('?');
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

    it('unknown: fill attribute on [data-question-mark] matches color prop', () => {
      const { container } = render(
        <StatusMarker status="unknown" color="#abcdef" shape="circle" />,
      );
      const qMark = container.querySelector('[data-question-mark]');
      expect(qMark?.getAttribute('fill')).toBe('#abcdef');
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

    it('affected/diamond renders a <rect> with transform=rotate(45)', () => {
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

  describe('aria-hidden on root SVG', () => {
    it('SVG is aria-hidden', () => {
      const { container } = render(
        <StatusMarker status="affected" color="#f00" shape="square" />,
      );
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('aria-hidden')).toBeTruthy();
    });
  });
});
