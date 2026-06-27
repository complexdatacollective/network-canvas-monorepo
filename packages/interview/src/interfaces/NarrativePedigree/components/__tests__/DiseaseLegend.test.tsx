import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import DiseaseLegend from '../DiseaseLegend';

const diseases = [
  { id: 'huntingtons', label: "Huntington's", color: '#e53e3e' },
  { id: 'brca', label: 'BRCA1', color: '#3182ce' },
];

describe('DiseaseLegend', () => {
  describe('rendering', () => {
    it('renders an "All diseases" control', () => {
      render(
        <DiseaseLegend
          diseases={diseases}
          selectedDiseaseId={null}
          onSelect={vi.fn()}
        />,
      );
      expect(
        screen.getByRole('button', { name: /all diseases/i }),
      ).toBeInTheDocument();
    });

    it('renders one control per disease', () => {
      render(
        <DiseaseLegend
          diseases={diseases}
          selectedDiseaseId={null}
          onSelect={vi.fn()}
        />,
      );
      expect(
        screen.getByRole('button', { name: /huntington's/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /brca1/i }),
      ).toBeInTheDocument();
    });

    it('renders no extra controls beyond "All diseases" + one per disease', () => {
      render(
        <DiseaseLegend
          diseases={diseases}
          selectedDiseaseId={null}
          onSelect={vi.fn()}
        />,
      );
      // 1 "All diseases" + 2 diseases = 3 buttons
      expect(screen.getAllByRole('button')).toHaveLength(3);
    });
  });

  describe('active state reflects selectedDiseaseId', () => {
    it('"All diseases" is pressed when selectedDiseaseId is null', () => {
      render(
        <DiseaseLegend
          diseases={diseases}
          selectedDiseaseId={null}
          onSelect={vi.fn()}
        />,
      );
      expect(
        screen.getByRole('button', { name: /all diseases/i }),
      ).toHaveAttribute('aria-pressed', 'true');
    });

    it('disease button is pressed when it is the selectedDiseaseId', () => {
      render(
        <DiseaseLegend
          diseases={diseases}
          selectedDiseaseId="huntingtons"
          onSelect={vi.fn()}
        />,
      );
      expect(
        screen.getByRole('button', { name: /huntington's/i }),
      ).toHaveAttribute('aria-pressed', 'true');
    });

    it('"All diseases" is not pressed when a disease is selected', () => {
      render(
        <DiseaseLegend
          diseases={diseases}
          selectedDiseaseId="huntingtons"
          onSelect={vi.fn()}
        />,
      );
      expect(
        screen.getByRole('button', { name: /all diseases/i }),
      ).toHaveAttribute('aria-pressed', 'false');
    });

    it('non-selected disease buttons are not pressed', () => {
      render(
        <DiseaseLegend
          diseases={diseases}
          selectedDiseaseId="huntingtons"
          onSelect={vi.fn()}
        />,
      );
      expect(screen.getByRole('button', { name: /brca1/i })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });
  });

  describe('interaction: calling onSelect', () => {
    it('clicking a non-active disease calls onSelect with its id', async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();
      render(
        <DiseaseLegend
          diseases={diseases}
          selectedDiseaseId={null}
          onSelect={onSelect}
        />,
      );
      await user.click(screen.getByRole('button', { name: /huntington's/i }));
      expect(onSelect).toHaveBeenCalledWith('huntingtons');
    });

    it('clicking the active disease calls onSelect(null)', async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();
      render(
        <DiseaseLegend
          diseases={diseases}
          selectedDiseaseId="huntingtons"
          onSelect={onSelect}
        />,
      );
      await user.click(screen.getByRole('button', { name: /huntington's/i }));
      expect(onSelect).toHaveBeenCalledWith(null);
    });

    it('clicking "All diseases" when a disease is active calls onSelect(null)', async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();
      render(
        <DiseaseLegend
          diseases={diseases}
          selectedDiseaseId="huntingtons"
          onSelect={onSelect}
        />,
      );
      await user.click(screen.getByRole('button', { name: /all diseases/i }));
      expect(onSelect).toHaveBeenCalledWith(null);
    });

    it('clicking "All diseases" when already null still calls onSelect(null)', async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();
      render(
        <DiseaseLegend
          diseases={diseases}
          selectedDiseaseId={null}
          onSelect={onSelect}
        />,
      );
      await user.click(screen.getByRole('button', { name: /all diseases/i }));
      expect(onSelect).toHaveBeenCalledWith(null);
    });
  });

  describe('accessibility', () => {
    it('each control is focusable (tabIndex not negative)', () => {
      render(
        <DiseaseLegend
          diseases={diseases}
          selectedDiseaseId={null}
          onSelect={vi.fn()}
        />,
      );
      screen.getAllByRole('button').forEach((btn) => {
        expect(btn).not.toHaveAttribute('tabindex', '-1');
      });
    });

    it('"All diseases" control has an accessible name', () => {
      render(
        <DiseaseLegend
          diseases={diseases}
          selectedDiseaseId={null}
          onSelect={vi.fn()}
        />,
      );
      const btn = screen.getByRole('button', { name: /all diseases/i });
      expect(btn.textContent?.trim()).toBeTruthy();
    });

    it('each disease control has an accessible name matching its label', () => {
      render(
        <DiseaseLegend
          diseases={diseases}
          selectedDiseaseId={null}
          onSelect={vi.fn()}
        />,
      );
      diseases.forEach((d) => {
        expect(
          screen.getByRole('button', { name: new RegExp(d.label, 'i') }),
        ).toBeInTheDocument();
      });
    });
  });
});
