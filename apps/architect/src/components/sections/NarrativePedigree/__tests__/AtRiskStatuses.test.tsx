import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderStageForm } from '~/components/StageEditor/__tests__/stageFormTestHarness';

import AtRiskStatuses from '../AtRiskStatuses';

const renderSection = () =>
  renderStageForm({
    children: (
      <AtRiskStatuses
        stagePath={null}
        stagePosition={0}
        interfaceType="NarrativePedigree"
      />
    ),
  });

describe('AtRiskStatuses', () => {
  it('renders the section title', () => {
    renderSection();
    expect(screen.getByText('At-Risk Statuses')).toBeDefined();
  });

  it('binds the toggle to showAtRiskStatuses, defaulting to off, with the expected label', () => {
    const view = renderSection();
    const toggle = screen.getByRole('switch', {
      name: 'Show possible (at-risk) statuses',
    });
    expect(toggle).not.toBeChecked();
    expect(view.getFormValues().showAtRiskStatuses).toBe(false);
  });

  it('explains what is displayed, how it is calculated, and why it defaults off', () => {
    renderSection();
    // WHAT — the "may develop / may carry" at-risk symbols.
    expect(screen.getAllByText(/may develop/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/may carry/i).length).toBeGreaterThan(0);
    // HOW — derived from inheritance pattern, not observed status.
    expect(screen.getAllByText(/inheritance pattern/i).length).toBeGreaterThan(
      0,
    );
    // WHY (caution + Bennett 2022 reference)
    expect(screen.getByText(/clinician-directed use/i)).toBeDefined();
    expect(screen.getAllByText(/Bennett/).length).toBeGreaterThan(0);
  });

  it('does not reference the removed "may be affected" (homozygous) marker', () => {
    renderSection();
    expect(screen.queryByText(/may be affected/i)).toBeNull();
  });
});
