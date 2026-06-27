import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { StickerNode, STICKER_CAP } from '../StickerNode';
import type { DiseaseSticker } from '../StickerNode';

describe('StickerNode', () => {
  describe('three diseases with distinct statuses', () => {
    const diseases: DiseaseSticker[] = [
      { color: '#ff0000', status: 'affected' },
      { color: '#00ff00', status: 'obligateCarrier' },
      { color: '#0000ff', status: 'unknown' },
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

  describe('status → style mapping', () => {
    it.each([
      ['affected', 'sticker-solid'],
      ['obligateAffected', 'sticker-double-ring'],
      ['obligateCarrier', 'sticker-ring-dot'],
      ['atRiskAffected', 'sticker-half'],
      ['atRiskCarrier', 'sticker-dot'],
      ['unknown', 'sticker-question'],
    ] as const)('status=%s has class %s', (status, expectedClass) => {
      const disease: DiseaseSticker = { color: '#red', status };
      render(<StickerNode label="Test" shape="square" diseases={[disease]} />);
      const sticker = document.querySelector(
        `[data-sticker-status="${status}"]`,
      );
      expect(sticker).toBeInTheDocument();
      expect(sticker).toHaveClass(expectedClass);
    });
  });

  describe('unknown status is shown as ? marker (not absent)', () => {
    it('renders a question-mark text in the unknown sticker', () => {
      const diseases: DiseaseSticker[] = [{ color: '#aaa', status: 'unknown' }];
      render(<StickerNode label="Test" shape="square" diseases={diseases} />);
      const sticker = document.querySelector('[data-sticker-status="unknown"]');
      expect(sticker).toBeInTheDocument();
      expect(sticker?.textContent).toContain('?');
    });
  });

  describe('overflow: 7 diseases caps at STICKER_CAP with +N marker', () => {
    const sevenDiseases: DiseaseSticker[] = Array.from(
      { length: 7 },
      (_, i) => ({
        color: `#${i}00000`,
        status: 'affected' as const,
      }),
    );

    it('renders at most STICKER_CAP stickers', () => {
      render(
        <StickerNode label="Test" shape="square" diseases={sevenDiseases} />,
      );
      const stickers = document.querySelectorAll('[data-sticker-status]');
      expect(stickers.length).toBeLessThanOrEqual(STICKER_CAP);
    });

    it('shows a +N overflow marker when diseases exceed STICKER_CAP', () => {
      render(
        <StickerNode label="Test" shape="square" diseases={sevenDiseases} />,
      );
      const overflow = document.querySelector('[data-overflow-marker]');
      expect(overflow).toBeInTheDocument();
    });

    it('+N overflow marker shows the correct remainder count', () => {
      render(
        <StickerNode label="Test" shape="square" diseases={sevenDiseases} />,
      );
      const overflow = document.querySelector('[data-overflow-marker]');
      const expected = `+${7 - STICKER_CAP}`;
      expect(overflow?.textContent).toContain(expected);
    });

    it('reveals the full list when the +N marker is activated', async () => {
      const user = userEvent.setup();
      render(
        <StickerNode label="Test" shape="square" diseases={sevenDiseases} />,
      );
      const overflow = document.querySelector('[data-overflow-marker]');
      expect(overflow).toBeInTheDocument();

      if (!(overflow instanceof HTMLElement)) {
        throw new Error('Expected overflow marker to be an HTMLElement');
      }
      await user.click(overflow);

      const fullList = document.querySelector('[data-overflow-list]');
      expect(fullList).toBeInTheDocument();
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
          { color: '#f00', status: 'affected' },
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
        { color: '#f00', status: 'affected' },
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
});
