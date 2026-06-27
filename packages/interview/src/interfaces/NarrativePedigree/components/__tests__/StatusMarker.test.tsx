import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Status } from '../../genetics/status';
import { StatusMarker } from '../StatusMarker';

describe('StatusMarker', () => {
  describe('sticker variant — data-status attribute', () => {
    const statuses: Status[] = [
      'affected',
      'obligateAffected',
      'obligateCarrier',
      'atRiskAffected',
      'atRiskCarrier',
      'unknown',
    ];

    it.each(statuses)(
      'renders data-status="%s" for sticker variant',
      (status) => {
        render(
          <StatusMarker status={status} color="#e53e3e" variant="sticker" />,
        );
        const el = document.querySelector(`[data-status="${status}"]`);
        expect(el).toBeInTheDocument();
      },
    );
  });

  describe('classic variant — data-status attribute', () => {
    const statuses: Status[] = [
      'affected',
      'obligateAffected',
      'obligateCarrier',
      'atRiskAffected',
      'atRiskCarrier',
      'unknown',
    ];

    it.each(statuses)(
      'renders data-status="%s" for classic variant',
      (status) => {
        render(
          <StatusMarker
            status={status}
            color="#e53e3e"
            variant="classic"
            shape="square"
          />,
        );
        const el = document.querySelector(`[data-status="${status}"]`);
        expect(el).toBeInTheDocument();
      },
    );
  });

  describe('sticker variant — distinguishing SVG elements per status', () => {
    it('affected: renders a filled <circle> in the disease color', () => {
      const { container } = render(
        <StatusMarker status="affected" color="#e53e3e" variant="sticker" />,
      );
      const circles = container.querySelectorAll('circle');
      const filled = Array.from(circles).find(
        (c) => c.getAttribute('fill') === '#e53e3e',
      );
      expect(filled).toBeTruthy();
    });

    it('obligateAffected: renders two <circle> elements (double ring)', () => {
      const { container } = render(
        <StatusMarker
          status="obligateAffected"
          color="#dd6b20"
          variant="sticker"
        />,
      );
      const circles = container.querySelectorAll('circle');
      expect(circles.length).toBe(2);
    });

    it('obligateCarrier: renders [data-centre-dot]', () => {
      const { container } = render(
        <StatusMarker
          status="obligateCarrier"
          color="#d69e2e"
          variant="sticker"
        />,
      );
      expect(container.querySelector('[data-centre-dot]')).toBeTruthy();
    });

    it('atRiskAffected: renders [data-half-fill] path', () => {
      const { container } = render(
        <StatusMarker
          status="atRiskAffected"
          color="#38a169"
          variant="sticker"
        />,
      );
      expect(container.querySelector('[data-half-fill]')).toBeTruthy();
    });

    it('atRiskCarrier: renders [data-centre-dot]', () => {
      const { container } = render(
        <StatusMarker
          status="atRiskCarrier"
          color="#3182ce"
          variant="sticker"
        />,
      );
      expect(container.querySelector('[data-centre-dot]')).toBeTruthy();
    });

    it('unknown: renders [data-question-mark] with ? text', () => {
      const { container } = render(
        <StatusMarker status="unknown" color="#805ad5" variant="sticker" />,
      );
      const qMark = container.querySelector('[data-question-mark]');
      expect(qMark).toBeTruthy();
      expect(qMark?.textContent).toBe('?');
    });
  });

  describe('classic variant — distinguishing SVG elements per status', () => {
    it('affected: renders [data-filled-shape]', () => {
      const { container } = render(
        <StatusMarker
          status="affected"
          color="#e53e3e"
          variant="classic"
          shape="square"
        />,
      );
      expect(container.querySelector('[data-filled-shape]')).toBeTruthy();
    });

    it('obligateAffected: renders [data-filled-shape] and [data-double-outline]', () => {
      const { container } = render(
        <StatusMarker
          status="obligateAffected"
          color="#dd6b20"
          variant="classic"
          shape="circle"
        />,
      );
      expect(container.querySelector('[data-filled-shape]')).toBeTruthy();
      expect(container.querySelector('[data-double-outline]')).toBeTruthy();
    });

    it('obligateCarrier: renders [data-centre-dot]', () => {
      const { container } = render(
        <StatusMarker
          status="obligateCarrier"
          color="#d69e2e"
          variant="classic"
          shape="circle"
        />,
      );
      expect(container.querySelector('[data-centre-dot]')).toBeTruthy();
    });

    it('atRiskCarrier: renders [data-centre-dot]', () => {
      const { container } = render(
        <StatusMarker
          status="atRiskCarrier"
          color="#3182ce"
          variant="classic"
          shape="circle"
        />,
      );
      expect(container.querySelector('[data-centre-dot]')).toBeTruthy();
    });

    it('atRiskAffected: renders [data-half-fill]', () => {
      const { container } = render(
        <StatusMarker
          status="atRiskAffected"
          color="#38a169"
          variant="classic"
          shape="square"
        />,
      );
      expect(container.querySelector('[data-half-fill]')).toBeTruthy();
    });

    it('unknown: renders [data-question-mark] with ? text', () => {
      const { container } = render(
        <StatusMarker
          status="unknown"
          color="#805ad5"
          variant="classic"
          shape="diamond"
        />,
      );
      const qMark = container.querySelector('[data-question-mark]');
      expect(qMark).toBeTruthy();
      expect(qMark?.textContent).toBe('?');
    });
  });

  describe('color prop is applied', () => {
    it('sticker/affected: fill attribute matches color prop', () => {
      const { container } = render(
        <StatusMarker status="affected" color="#123456" variant="sticker" />,
      );
      const filled = container.querySelector('circle[fill="#123456"]');
      expect(filled).toBeTruthy();
    });

    it('sticker/unknown: fill attribute on [data-question-mark] matches color prop', () => {
      const { container } = render(
        <StatusMarker status="unknown" color="#abcdef" variant="sticker" />,
      );
      const qMark = container.querySelector('[data-question-mark]');
      expect(qMark?.getAttribute('fill')).toBe('#abcdef');
    });

    it('classic/affected: fill attribute on [data-filled-shape] matches color prop', () => {
      const { container } = render(
        <StatusMarker
          status="affected"
          color="#fedcba"
          variant="classic"
          shape="circle"
        />,
      );
      const shape = container.querySelector('[data-filled-shape]');
      expect(shape?.getAttribute('fill')).toBe('#fedcba');
    });
  });

  describe('classic variant — shape-aware rendering', () => {
    it.each(['square', 'circle', 'diamond'] as const)(
      'affected renders without error for shape=%s',
      (shape) => {
        expect(() =>
          render(
            <StatusMarker
              status="affected"
              color="#f00"
              variant="classic"
              shape={shape}
            />,
          ),
        ).not.toThrow();
      },
    );

    it('affected/circle renders a <circle> not a <rect>', () => {
      const { container } = render(
        <StatusMarker
          status="affected"
          color="#f00"
          variant="classic"
          shape="circle"
        />,
      );
      expect(
        container.querySelector('[data-filled-shape]')?.tagName.toLowerCase(),
      ).toBe('circle');
    });

    it('affected/square renders a <rect>', () => {
      const { container } = render(
        <StatusMarker
          status="affected"
          color="#f00"
          variant="classic"
          shape="square"
        />,
      );
      expect(
        container.querySelector('[data-filled-shape]')?.tagName.toLowerCase(),
      ).toBe('rect');
    });

    it('affected/diamond renders a <rect> with transform=rotate(45)', () => {
      const { container } = render(
        <StatusMarker
          status="affected"
          color="#f00"
          variant="classic"
          shape="diamond"
        />,
      );
      const shape = container.querySelector('[data-filled-shape]');
      expect(shape?.tagName.toLowerCase()).toBe('rect');
      expect(shape?.getAttribute('transform')).toMatch(/rotate\(45/);
    });
  });

  describe('aria-hidden on root SVG', () => {
    it('sticker variant SVG is aria-hidden', () => {
      const { container } = render(
        <StatusMarker status="affected" color="#f00" variant="sticker" />,
      );
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('aria-hidden')).toBeTruthy();
    });

    it('classic variant SVG is aria-hidden', () => {
      const { container } = render(
        <StatusMarker
          status="affected"
          color="#f00"
          variant="classic"
          shape="square"
        />,
      );
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('aria-hidden')).toBeTruthy();
    });
  });
});
