import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';

import BoundaryOptions from '../BoundaryOptions';

const renderSection = (committedStage?: Record<string, unknown>) =>
  renderStageForm({
    committedStage: committedStage ? asStage(committedStage) : null,
    children: (
      <BoundaryOptions
        stagePath={null}
        stagePosition={0}
        interfaceType="FamilyPedigree"
      />
    ),
  });

// The visible label text also carries a required-indicator asterisk in the
// DOM (`aria-hidden`, but still part of the label's textContent), so lookups
// match on the leading label text rather than an exact string.
const grandparentsLabel = /^Require Grandparents/;
const coParentsLabel = /^Require Co-Parents' Families/;

describe('BoundaryOptions', () => {
  it('renders a field for requireGrandparents', () => {
    renderSection();
    expect(screen.getByLabelText(grandparentsLabel)).toBeInTheDocument();
  });

  it('renders a field for requireChildrenContributors', () => {
    renderSection();
    expect(screen.getByLabelText(coParentsLabel)).toBeInTheDocument();
  });

  it('marks both boundary fields as required', () => {
    renderSection();
    expect(screen.getByLabelText(grandparentsLabel)).toBeRequired();
    expect(screen.getByLabelText(coParentsLabel)).toBeRequired();
  });

  it('seeds each select from the committed stage value', () => {
    renderSection({
      boundaries: {
        requireGrandparents: 'required',
        requireChildrenContributors: 'off',
      },
    });
    expect(screen.getByLabelText(grandparentsLabel)).toHaveValue('required');
    expect(screen.getByLabelText(coParentsLabel)).toHaveValue('off');
  });

  it('explains the enforcement levels', () => {
    renderSection();
    // "Off"/"Recommended"/"Required" each also appear as select option text
    // and (for "Required") the fields' sr-only required indicator, so this
    // only asserts the documentation bullet's own strong-tagged term exists.
    expect(screen.getByText('Off', { selector: 'strong' })).toBeInTheDocument();
    expect(
      screen.getByText('Recommended', { selector: 'strong' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Required', { selector: 'strong' }),
    ).toBeInTheDocument();
  });

  it('does not use the phrase "family tree"', () => {
    const { container } = renderSection();
    expect(container.textContent).not.toContain('family tree');
  });
});
