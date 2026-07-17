import { render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';

vi.mock('~/components/IssueAnchor', () => ({ default: () => null }));

import Rules from '../Rules';

const RulesComponent = Rules as unknown as ComponentType<{
  codebook: Record<string, unknown>;
  allowEdgeRules?: boolean;
  onChange?: (value: unknown) => void;
}>;

const renderRules = (allowEdgeRules?: boolean) =>
  render(
    <DialogProvider>
      <RulesComponent
        codebook={{ node: {}, edge: {} }}
        allowEdgeRules={allowEdgeRules}
      />
    </DialogProvider>,
  );

describe('Rules', () => {
  it('offers an edge rule by default', () => {
    renderRules();

    expect(
      screen.getByRole('button', { name: 'Add edge rule' }),
    ).toBeInTheDocument();
  });

  it('offers an edge rule when they are allowed', () => {
    renderRules(true);

    expect(
      screen.getByRole('button', { name: 'Add edge rule' }),
    ).toBeInTheDocument();
  });

  it('hides the edge rule button when edge rules are not allowed', () => {
    renderRules(false);

    expect(
      screen.queryByRole('button', { name: 'Add edge rule' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add alter rule' }),
    ).toBeInTheDocument();
  });
});
