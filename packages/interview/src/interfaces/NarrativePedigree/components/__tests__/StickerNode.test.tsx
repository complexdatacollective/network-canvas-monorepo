import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StickerNode, STICKER_CAP } from '../StickerNode';
import type { DiseaseSticker } from '../StickerNode';

describe('StickerNode', () => {
  describe('three diseases with distinct statuses', () => {
    const diseases: DiseaseSticker[] = [
      { id: 'd1', color: '#ff0000', status: 'affected' },
      { id: 'd2', color: '#00ff00', status: 'obligateCarrier' },
      { id: 'd3', color: '#0000ff', status: 'unknown' },
    ];

    it('renders three sticker markers', () => {
      render(<StickerNode label="Test" shape="square" diseases={diseases} />);
      const stickers = document.querySelectorAll('[data-sticker-status]');
      expect(stickers).toHaveLength(3);
    });

    it('renders a sticker with status=affected', () => {
      render(<StickerNode label="Test" shape="square" diseases={diseases} />);
      const affected = document.querySelector(
        '[data-sticker-status="affected"]',
      );
      expect(affected).toBeInTheDocument();
    });

    it('renders a sticker with status=obligateCarrier', () => {
      render(<StickerNode label="Test" shape="square" diseases={diseases} />);
      const obligateCarrier = document.querySelector(
        '[data-sticker-status="obligateCarrier"]',
      );
      expect(obligateCarrier).toBeInTheDocument();
    });

    it('renders a sticker with status=unknown', () => {
      render(<StickerNode label="Test" shape="square" diseases={diseases} />);
      const unknown = document.querySelector('[data-sticker-status="unknown"]');
      expect(unknown).toBeInTheDocument();
    });

    it('does NOT omit the unknown sticker (unknown = ? style, not absence)', () => {
      render(<StickerNode label="Test" shape="square" diseases={diseases} />);
      const stickers = document.querySelectorAll('[data-sticker-status]');
      expect(stickers).toHaveLength(3);
    });
  });

  describe('status → notation glyph mapping', () => {
    // Each status maps to a standard-notation glyph hook drawn by StatusMarker.
    // Display merge: affected and obligateAffected both draw [data-filled-shape].
    it.each([
      ['affected', '[data-filled-shape]'],
      ['obligateAffected', '[data-filled-shape]'],
      ['obligateCarrier', '[data-centre-dot]'],
      ['atRiskAffected', '[data-half-fill]'],
      ['atRiskCarrier', '[data-centre-dot]'],
      ['unknown', '[data-question-mark]'],
    ] as const)('status=%s renders %s', (status, glyphSelector) => {
      const disease: DiseaseSticker = { id: 'dx', color: '#red', status };
      render(<StickerNode label="Test" shape="square" diseases={[disease]} />);
      const sticker = document.querySelector(
        `[data-sticker-status="${status}"]`,
      );
      expect(sticker).toBeInTheDocument();
      expect(sticker?.querySelector(glyphSelector)).toBeTruthy();
    });
  });

  describe('unknown status is shown as ? marker (not absent)', () => {
    it('renders a question-mark text in the unknown sticker', () => {
      const diseases: DiseaseSticker[] = [
        { id: 'dx', color: '#aaa', status: 'unknown' },
      ];
      render(<StickerNode label="Test" shape="square" diseases={diseases} />);
      const sticker = document.querySelector('[data-sticker-status="unknown"]');
      expect(sticker).toBeInTheDocument();
      expect(sticker?.textContent).toContain('?');
    });
  });

  describe('overflow: square/diamond reserve-last-slot branch (9 diseases)', () => {
    const nineDiseases: DiseaseSticker[] = Array.from(
      { length: 9 },
      (_, i) => ({
        id: `d${i}`,
        color: `#${i}00000`,
        status: 'affected' as const,
      }),
    );

    it.each(['square', 'diamond'] as const)(
      'shape=%s: renders exactly 7 sticker markers (not 8) when 9 diseases supplied',
      (shape) => {
        render(
          <StickerNode label="Test" shape={shape} diseases={nineDiseases} />,
        );
        const stickers = document.querySelectorAll('[data-sticker-status]');
        expect(stickers).toHaveLength(7);
      },
    );

    it.each(['square', 'diamond'] as const)(
      'shape=%s: overflow badge shows +2 (not +1) when last slot is reserved',
      (shape) => {
        render(
          <StickerNode label="Test" shape={shape} diseases={nineDiseases} />,
        );
        const overflow = document.querySelector('[data-overflow-marker]');
        expect(overflow).toBeInTheDocument();
        expect(overflow?.textContent).toContain('+2');
      },
    );
  });

  describe('overflow: 9 diseases caps at STICKER_CAP with +N marker', () => {
    const totalDiseases = STICKER_CAP + 1;
    const manyDiseases: DiseaseSticker[] = Array.from(
      { length: totalDiseases },
      (_, i) => ({
        id: `d${i}`,
        color: `#${i}00000`,
        status: 'affected' as const,
      }),
    );

    it('renders at most STICKER_CAP stickers', () => {
      render(
        <StickerNode label="Test" shape="circle" diseases={manyDiseases} />,
      );
      const stickers = document.querySelectorAll('[data-sticker-status]');
      expect(stickers.length).toBeLessThanOrEqual(STICKER_CAP);
    });

    it('shows a +N overflow marker when diseases exceed STICKER_CAP', () => {
      render(
        <StickerNode label="Test" shape="circle" diseases={manyDiseases} />,
      );
      const overflow = document.querySelector('[data-overflow-marker]');
      expect(overflow).toBeInTheDocument();
    });

    it('+N overflow marker shows the correct remainder count', () => {
      render(
        <StickerNode label="Test" shape="circle" diseases={manyDiseases} />,
      );
      const overflow = document.querySelector('[data-overflow-marker]');
      const expected = `+${totalDiseases - STICKER_CAP}`;
      expect(overflow?.textContent).toContain(expected);
    });

    it('+N overflow marker is a non-interactive span (not a button)', () => {
      render(
        <StickerNode label="Test" shape="circle" diseases={manyDiseases} />,
      );
      const overflow = document.querySelector('[data-overflow-marker]');
      expect(overflow?.tagName.toLowerCase()).toBe('span');
    });
  });

  describe('no diseases', () => {
    it('renders the node without stickers', () => {
      render(<StickerNode label="Test" shape="circle" diseases={[]} />);
      const stickers = document.querySelectorAll('[data-sticker-status]');
      expect(stickers).toHaveLength(0);
    });
  });

  describe('shapes', () => {
    it.each(['square', 'circle', 'diamond'] as const)(
      'renders without error for shape=%s',
      (shape) => {
        const diseases: DiseaseSticker[] = [
          { id: 'dx', color: '#f00', status: 'affected' },
        ];
        expect(() =>
          render(
            <StickerNode label="Test" shape={shape} diseases={diseases} />,
          ),
        ).not.toThrow();
      },
    );
  });

  describe('accessibility', () => {
    it('each sticker has an accessible label', () => {
      const diseases: DiseaseSticker[] = [
        { id: 'dx', color: '#f00', status: 'affected' },
      ];
      render(<StickerNode label="Test" shape="square" diseases={diseases} />);
      const stickers = document.querySelectorAll('[data-sticker-status]');
      for (const sticker of stickers) {
        expect(
          sticker.getAttribute('aria-label') ?? sticker.getAttribute('title'),
        ).toBeTruthy();
      }
    });
  });

  describe('atRiskHomozygous flag indicator', () => {
    it('renders [data-atrisk-homozygous-marker] when atRiskHomozygous is true', () => {
      const disease: DiseaseSticker = {
        id: 'dx',
        color: '#ff0000',
        status: 'obligateCarrier',
        atRiskHomozygous: true,
      };
      render(<StickerNode label="Test" shape="square" diseases={[disease]} />);
      const marker = document.querySelector('[data-atrisk-homozygous-marker]');
      expect(marker).toBeInTheDocument();
    });

    it('does NOT render [data-atrisk-homozygous-marker] when atRiskHomozygous is false', () => {
      const disease: DiseaseSticker = {
        id: 'dx',
        color: '#ff0000',
        status: 'obligateCarrier',
        atRiskHomozygous: false,
      };
      render(<StickerNode label="Test" shape="square" diseases={[disease]} />);
      const marker = document.querySelector('[data-atrisk-homozygous-marker]');
      expect(marker).not.toBeInTheDocument();
    });

    it('does NOT render [data-atrisk-homozygous-marker] when atRiskHomozygous is omitted', () => {
      const disease: DiseaseSticker = {
        id: 'dx',
        color: '#ff0000',
        status: 'obligateCarrier',
      };
      render(<StickerNode label="Test" shape="square" diseases={[disease]} />);
      const marker = document.querySelector('[data-atrisk-homozygous-marker]');
      expect(marker).not.toBeInTheDocument();
    });

    it('renders BOTH the primary status marker and the at-risk flag for obligateCarrier + atRiskHomozygous', () => {
      const disease: DiseaseSticker = {
        id: 'dx',
        color: '#d69e2e',
        status: 'obligateCarrier',
        atRiskHomozygous: true,
      };
      render(<StickerNode label="Test" shape="square" diseases={[disease]} />);
      const statusMarker = document.querySelector(
        '[data-sticker-status="obligateCarrier"]',
      );
      const atRiskMarker = document.querySelector(
        '[data-atrisk-homozygous-marker]',
      );
      expect(statusMarker).toBeInTheDocument();
      expect(atRiskMarker).toBeInTheDocument();
      expect(statusMarker).not.toBe(atRiskMarker);
    });

    it('[data-atrisk-homozygous-marker] is decorative — aria-hidden with no accessible label', () => {
      const disease: DiseaseSticker = {
        id: 'dx',
        color: '#ff0000',
        status: 'obligateCarrier',
        atRiskHomozygous: true,
      };
      render(<StickerNode label="Test" shape="square" diseases={[disease]} />);
      const marker = document.querySelector('[data-atrisk-homozygous-marker]');
      expect(marker).toBeInTheDocument();

      // The status is announced as text by the per-node summary in
      // NarrativePedigreeView; the triangle itself carries no accessible label
      // and is hidden from the accessibility tree (so getByLabelText can't find
      // it).
      expect(marker).not.toHaveAttribute('aria-label');
      expect(
        screen.queryByLabelText(/risk of being affected/i),
      ).not.toBeInTheDocument();

      // Confirm an aria-hidden ancestor (or the marker itself) hides it from AT.
      let node: Element | null = marker;
      let hidden = false;
      while (node) {
        if (node.getAttribute('aria-hidden') === 'true') {
          hidden = true;
          break;
        }
        node = node.parentElement;
      }
      expect(hidden).toBe(true);
    });
  });

  describe('SVG visual structure per status (standard notation)', () => {
    it('affected marker renders a [data-filled-shape] in the disease colour', () => {
      render(
        <StickerNode
          label="Test"
          shape="square"
          diseases={[{ id: 'dx', color: '#e53e3e', status: 'affected' }]}
        />,
      );
      const sticker = document.querySelector(
        '[data-sticker-status="affected"]',
      );
      expect(sticker).toBeInTheDocument();
      const filled = sticker?.querySelector('[data-filled-shape]');
      expect(filled).toBeTruthy();
      expect(filled?.getAttribute('fill')).toBe('#e53e3e');
    });

    it('affected/circle renders the filled shape as a <circle>', () => {
      render(
        <StickerNode
          label="Test"
          shape="circle"
          diseases={[{ id: 'dx', color: '#e53e3e', status: 'affected' }]}
        />,
      );
      const sticker = document.querySelector(
        '[data-sticker-status="affected"]',
      );
      const filled = sticker?.querySelector('[data-filled-shape]');
      expect(filled?.tagName.toLowerCase()).toBe('circle');
    });

    it('unknown marker renders a ? text glyph via [data-question-mark]', () => {
      render(
        <StickerNode
          label="Test"
          shape="square"
          diseases={[{ id: 'dx', color: '#805ad5', status: 'unknown' }]}
        />,
      );
      const sticker = document.querySelector('[data-sticker-status="unknown"]');
      expect(sticker).toBeInTheDocument();
      const qMark = sticker?.querySelector('[data-question-mark]');
      expect(qMark).toBeTruthy();
      expect(qMark?.textContent).toBe('?');
    });

    it('atRiskCarrier marker renders a [data-centre-dot]', () => {
      render(
        <StickerNode
          label="Test"
          shape="square"
          diseases={[{ id: 'dx', color: '#3182ce', status: 'atRiskCarrier' }]}
        />,
      );
      const sticker = document.querySelector(
        '[data-sticker-status="atRiskCarrier"]',
      );
      expect(sticker).toBeInTheDocument();
      expect(sticker?.querySelector('[data-centre-dot]')).toBeTruthy();
    });

    it('obligateCarrier marker renders a [data-centre-dot]', () => {
      render(
        <StickerNode
          label="Test"
          shape="square"
          diseases={[{ id: 'dx', color: '#d69e2e', status: 'obligateCarrier' }]}
        />,
      );
      const sticker = document.querySelector(
        '[data-sticker-status="obligateCarrier"]',
      );
      expect(sticker).toBeInTheDocument();
      expect(sticker?.querySelector('[data-centre-dot]')).toBeTruthy();
    });

    it('atRiskAffected marker renders a [data-half-fill] path', () => {
      render(
        <StickerNode
          label="Test"
          shape="square"
          diseases={[{ id: 'dx', color: '#38a169', status: 'atRiskAffected' }]}
        />,
      );
      const sticker = document.querySelector(
        '[data-sticker-status="atRiskAffected"]',
      );
      expect(sticker).toBeInTheDocument();
      expect(sticker?.querySelector('[data-half-fill]')).toBeTruthy();
    });

    // Display merge: obligateAffected draws the same filled glyph as affected,
    // with no double-outline distinguisher.
    it('obligateAffected marker renders the same filled glyph as affected', () => {
      render(
        <StickerNode
          label="Test"
          shape="square"
          diseases={[
            { id: 'dx', color: '#dd6b20', status: 'obligateAffected' },
          ]}
        />,
      );
      const sticker = document.querySelector(
        '[data-sticker-status="obligateAffected"]',
      );
      expect(sticker).toBeInTheDocument();
      expect(sticker?.querySelector('[data-filled-shape]')).toBeTruthy();
      expect(sticker?.querySelector('[data-double-outline]')).toBeNull();
    });
  });

  describe('perimeter markers are always circular', () => {
    it.each(['square', 'circle', 'diamond'] as const)(
      'renders a circular sticker glyph regardless of node shape (shape=%s)',
      (shape) => {
        render(
          <StickerNode
            label="Test"
            shape={shape}
            diseases={[{ id: 'dx', color: '#e53e3e', status: 'affected' }]}
          />,
        );
        const filled = document
          .querySelector('[data-sticker-status="affected"]')
          ?.querySelector('[data-filled-shape]');
        // Perimeter markers are circles regardless of the node shape; only the
        // single-condition node-Sticker conforms to the node shape.
        expect(filled?.tagName.toLowerCase()).toBe('circle');
      },
    );
  });
});
