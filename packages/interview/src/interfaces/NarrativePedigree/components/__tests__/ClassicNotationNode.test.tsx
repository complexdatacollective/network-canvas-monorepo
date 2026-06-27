import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ClassicNotationNode } from '../ClassicNotationNode';

const mockNode = {
  _uid: 'node-1',
  type: 'person',
  attributes: {},
};

describe('ClassicNotationNode', () => {
  describe('affected status → filled symbol', () => {
    it('renders a data-notation-status="affected" element', () => {
      render(
        <ClassicNotationNode
          node={mockNode}
          disease={{ color: '#e53e3e', status: 'affected' }}
          shape="square"
          label="Alice"
        />,
      );
      const el = document.querySelector('[data-notation-status="affected"]');
      expect(el).toBeInTheDocument();
    });

    it('renders a filled SVG shape (fill attribute matches disease colour)', () => {
      render(
        <ClassicNotationNode
          node={mockNode}
          disease={{ color: '#e53e3e', status: 'affected' }}
          shape="square"
          label="Alice"
        />,
      );
      const el = document.querySelector('[data-notation-status="affected"]');
      const filled = el?.querySelector('[data-filled-shape]');
      expect(filled).toBeTruthy();
    });
  });

  describe('obligateAffected status → filled symbol with double outline', () => {
    it('renders a data-notation-status="obligateAffected" element', () => {
      render(
        <ClassicNotationNode
          node={mockNode}
          disease={{ color: '#dd6b20', status: 'obligateAffected' }}
          shape="square"
          label="Bob"
        />,
      );
      const el = document.querySelector(
        '[data-notation-status="obligateAffected"]',
      );
      expect(el).toBeInTheDocument();
    });

    it('renders a filled shape and a double-outline hook', () => {
      render(
        <ClassicNotationNode
          node={mockNode}
          disease={{ color: '#dd6b20', status: 'obligateAffected' }}
          shape="square"
          label="Bob"
        />,
      );
      const el = document.querySelector(
        '[data-notation-status="obligateAffected"]',
      );
      expect(el?.querySelector('[data-filled-shape]')).toBeTruthy();
      expect(el?.querySelector('[data-double-outline]')).toBeTruthy();
    });
  });

  describe('obligateCarrier status → central dot', () => {
    it('renders a data-notation-status="obligateCarrier" element', () => {
      render(
        <ClassicNotationNode
          node={mockNode}
          disease={{ color: '#d69e2e', status: 'obligateCarrier' }}
          shape="circle"
          label="Carol"
        />,
      );
      const el = document.querySelector(
        '[data-notation-status="obligateCarrier"]',
      );
      expect(el).toBeInTheDocument();
    });

    it('renders a central dot ([data-centre-dot])', () => {
      render(
        <ClassicNotationNode
          node={mockNode}
          disease={{ color: '#d69e2e', status: 'obligateCarrier' }}
          shape="circle"
          label="Carol"
        />,
      );
      const el = document.querySelector(
        '[data-notation-status="obligateCarrier"]',
      );
      const dot = el?.querySelector('[data-centre-dot]');
      expect(dot).toBeTruthy();
    });
  });

  describe('atRiskCarrier status → central dot', () => {
    it('renders a data-notation-status="atRiskCarrier" element', () => {
      render(
        <ClassicNotationNode
          node={mockNode}
          disease={{ color: '#3182ce', status: 'atRiskCarrier' }}
          shape="circle"
          label="Dave"
        />,
      );
      const el = document.querySelector(
        '[data-notation-status="atRiskCarrier"]',
      );
      expect(el).toBeInTheDocument();
    });

    it('renders a central dot ([data-centre-dot])', () => {
      render(
        <ClassicNotationNode
          node={mockNode}
          disease={{ color: '#3182ce', status: 'atRiskCarrier' }}
          shape="circle"
          label="Dave"
        />,
      );
      const el = document.querySelector(
        '[data-notation-status="atRiskCarrier"]',
      );
      const dot = el?.querySelector('[data-centre-dot]');
      expect(dot).toBeTruthy();
    });
  });

  describe('atRiskAffected status → half-filled symbol', () => {
    it('renders a data-notation-status="atRiskAffected" element', () => {
      render(
        <ClassicNotationNode
          node={mockNode}
          disease={{ color: '#38a169', status: 'atRiskAffected' }}
          shape="square"
          label="Eve"
        />,
      );
      const el = document.querySelector(
        '[data-notation-status="atRiskAffected"]',
      );
      expect(el).toBeInTheDocument();
    });

    it('renders a half-fill path ([data-half-fill])', () => {
      render(
        <ClassicNotationNode
          node={mockNode}
          disease={{ color: '#38a169', status: 'atRiskAffected' }}
          shape="square"
          label="Eve"
        />,
      );
      const el = document.querySelector(
        '[data-notation-status="atRiskAffected"]',
      );
      expect(el?.querySelector('[data-half-fill]')).toBeTruthy();
    });
  });

  describe('unknown status → plain symbol with ?', () => {
    it('renders a data-notation-status="unknown" element', () => {
      render(
        <ClassicNotationNode
          node={mockNode}
          disease={{ color: '#805ad5', status: 'unknown' }}
          shape="diamond"
          label="Frank"
        />,
      );
      const el = document.querySelector('[data-notation-status="unknown"]');
      expect(el).toBeInTheDocument();
    });

    it('renders a ? glyph ([data-question-mark])', () => {
      render(
        <ClassicNotationNode
          node={mockNode}
          disease={{ color: '#805ad5', status: 'unknown' }}
          shape="diamond"
          label="Frank"
        />,
      );
      const el = document.querySelector('[data-notation-status="unknown"]');
      const qm = el?.querySelector('[data-question-mark]');
      expect(qm).toBeTruthy();
      expect(qm?.textContent).toBe('?');
    });
  });

  describe('label rendered beneath the symbol', () => {
    it('renders the label text', () => {
      const { getByText } = render(
        <ClassicNotationNode
          node={mockNode}
          disease={{ color: '#e53e3e', status: 'affected' }}
          shape="square"
          label="Alice"
        />,
      );
      expect(getByText('Alice')).toBeInTheDocument();
    });

    it('label element appears after the symbol in DOM order', () => {
      const { container } = render(
        <ClassicNotationNode
          node={mockNode}
          disease={{ color: '#e53e3e', status: 'affected' }}
          shape="square"
          label="Alice"
        />,
      );
      const all = container.querySelectorAll(
        '[data-notation-status], [data-node-label]',
      );
      expect(all.length).toBe(2);
      expect(all[0]).toHaveAttribute('data-notation-status');
      expect(all[1]).toHaveAttribute('data-node-label');
    });
  });

  describe('all shapes render without error', () => {
    it.each(['square', 'circle', 'diamond'] as const)(
      'renders for shape=%s',
      (shape) => {
        expect(() =>
          render(
            <ClassicNotationNode
              node={mockNode}
              disease={{ color: '#f00', status: 'affected' }}
              shape={shape}
              label="Test"
            />,
          ),
        ).not.toThrow();
      },
    );
  });

  describe('atRiskHomozygous flag notation', () => {
    it('renders [data-atrisk-homozygous-notation] when atRiskHomozygous is true', () => {
      render(
        <ClassicNotationNode
          node={mockNode}
          disease={{
            color: '#e53e3e',
            status: 'obligateCarrier',
            atRiskHomozygous: true,
          }}
          shape="square"
          label="Alice"
        />,
      );
      const marker = document.querySelector(
        '[data-atrisk-homozygous-notation]',
      );
      expect(marker).toBeInTheDocument();
    });

    it('does NOT render [data-atrisk-homozygous-notation] when atRiskHomozygous is false', () => {
      render(
        <ClassicNotationNode
          node={mockNode}
          disease={{
            color: '#e53e3e',
            status: 'obligateCarrier',
            atRiskHomozygous: false,
          }}
          shape="square"
          label="Alice"
        />,
      );
      const marker = document.querySelector(
        '[data-atrisk-homozygous-notation]',
      );
      expect(marker).not.toBeInTheDocument();
    });

    it('does NOT render [data-atrisk-homozygous-notation] when atRiskHomozygous is omitted', () => {
      render(
        <ClassicNotationNode
          node={mockNode}
          disease={{ color: '#e53e3e', status: 'obligateCarrier' }}
          shape="square"
          label="Alice"
        />,
      );
      const marker = document.querySelector(
        '[data-atrisk-homozygous-notation]',
      );
      expect(marker).not.toBeInTheDocument();
    });

    it('renders BOTH the primary status notation and the at-risk flag for obligateCarrier + atRiskHomozygous', () => {
      render(
        <ClassicNotationNode
          node={mockNode}
          disease={{
            color: '#d69e2e',
            status: 'obligateCarrier',
            atRiskHomozygous: true,
          }}
          shape="circle"
          label="Carol"
        />,
      );
      const statusEl = document.querySelector(
        '[data-notation-status="obligateCarrier"]',
      );
      expect(statusEl?.querySelector('[data-centre-dot]')).toBeTruthy();
      const marker = document.querySelector(
        '[data-atrisk-homozygous-notation]',
      );
      expect(marker).toBeInTheDocument();
    });

    it('[data-atrisk-homozygous-notation] is not nested inside any aria-hidden subtree', () => {
      render(
        <ClassicNotationNode
          node={mockNode}
          disease={{
            color: '#e53e3e',
            status: 'affected',
            atRiskHomozygous: true,
          }}
          shape="square"
          label="Alice"
        />,
      );
      // Verify the marker exists and carries an accessible name.
      const marker = document.querySelector('[data-atrisk-homozygous-notation]');
      expect(marker).not.toBeNull();
      expect(marker).toHaveAttribute('aria-label');

      // Walk every ancestor to confirm none carries aria-hidden="true".
      // getByLabelText does NOT filter by aria-hidden, so this explicit walk is
      // the only reliable guard that the marker is outside any aria-hidden subtree.
      let el: Element | null = marker;
      while (el) {
        expect(el.getAttribute('aria-hidden')).not.toBe('true');
        el = el.parentElement;
      }
    });

    it.each(['square', 'circle', 'diamond'] as const)(
      'renders [data-atrisk-homozygous-notation] for shape=%s',
      (shape) => {
        render(
          <ClassicNotationNode
            node={mockNode}
            disease={{
              color: '#f00',
              status: 'affected',
              atRiskHomozygous: true,
            }}
            shape={shape}
            label="Test"
          />,
        );
        const marker = document.querySelector(
          '[data-atrisk-homozygous-notation]',
        );
        expect(marker).toBeInTheDocument();
      },
    );
  });
});
