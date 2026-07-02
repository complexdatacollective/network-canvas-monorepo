import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('~/components/Form/ValidatedField', () => ({
  default: ({
    name,
    componentProps,
  }: {
    name: string;
    componentProps?: { label?: string };
  }) => (
    <div data-testid={`field-${name}`}>
      {componentProps?.label && <span>{componentProps.label}</span>}
    </div>
  ),
}));

vi.mock('~/components/EditorLayout', () => ({
  Row: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Section: ({
    children,
    title,
    summary,
  }: {
    children: React.ReactNode;
    title: string;
    summary?: React.ReactNode;
  }) => (
    <div>
      <h2>{title}</h2>
      <div>{summary}</div>
      {children}
    </div>
  ),
}));

import AtRiskStatuses from '../AtRiskStatuses';

const renderSection = () =>
  render(
    <AtRiskStatuses
      form="edit-stage"
      stagePath={null}
      interfaceType="NarrativePedigree"
    />,
  );

describe('AtRiskStatuses', () => {
  it('renders the section title', () => {
    renderSection();
    expect(screen.getByText('At-Risk Statuses')).toBeDefined();
  });

  it('binds the toggle to showAtRiskStatuses with the expected label', () => {
    renderSection();
    const field = screen.getByTestId('field-showAtRiskStatuses');
    expect(field.textContent).toContain('Show possible (at-risk) statuses');
  });

  it('explains what is displayed, how it is calculated, and why it defaults off', () => {
    renderSection();
    // WHAT — the "may develop / may carry / may be affected" symbols.
    expect(screen.getAllByText(/may develop/i).length).toBeGreaterThan(0);
    // HOW — derived from inheritance pattern, not observed status.
    expect(screen.getByText(/inheritance pattern/i)).toBeDefined();
    // WHY (caution + Bennett 2022 reference)
    expect(screen.getByText(/clinician-directed use/i)).toBeDefined();
    expect(screen.getByText(/Bennett/)).toBeDefined();
  });
});
