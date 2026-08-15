import { render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';

vi.mock('~/components/IssueAnchor', () => ({ default: () => null }));

import Rules, { type RulesOuterProps } from '../Rules';

// `compose` erases the enhanced component's props, so the cast restores them.
// It is the real outer props type, not a hand-written stand-in: a label this
// component starts requiring has to appear here too.
const RulesComponent = Rules as unknown as ComponentType<RulesOuterProps>;

const LABELS = {
  addAlterRuleLabel: 'Add new filter alter rule',
  addEdgeRuleLabel: 'Add new filter edge rule',
} as const;

const renderRules = (allowEdgeRules?: boolean) =>
  render(
    <DialogProvider>
      <RulesComponent
        {...LABELS}
        codebook={{ node: {}, edge: {} }}
        allowEdgeRules={allowEdgeRules}
      />
    </DialogProvider>,
  );

describe('Rules', () => {
  it('offers an edge rule by default', () => {
    renderRules();

    expect(
      screen.getByRole('button', { name: LABELS.addEdgeRuleLabel }),
    ).toBeInTheDocument();
  });

  it('offers an edge rule when they are allowed', () => {
    renderRules(true);

    expect(
      screen.getByRole('button', { name: LABELS.addEdgeRuleLabel }),
    ).toBeInTheDocument();
  });

  it('hides the edge rule button when edge rules are not allowed', () => {
    renderRules(false);

    expect(
      screen.queryByRole('button', { name: LABELS.addEdgeRuleLabel }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: LABELS.addAlterRuleLabel }),
    ).toBeInTheDocument();
  });

  it('names its add buttons from the caller, not from a default', () => {
    // The whole point of the required labels: two builders in one editor must
    // be able to differ. A hard-coded name here would make that impossible.
    render(
      <DialogProvider>
        <RulesComponent
          type="query"
          codebook={{ node: {}, edge: {}, ego: {} }}
          addAlterRuleLabel="Add new skip logic alter rule"
          addEdgeRuleLabel="Add new skip logic edge rule"
          addEgoRuleLabel="Add new skip logic ego rule"
        />
      </DialogProvider>,
    );

    for (const name of [
      'Add new skip logic alter rule',
      'Add new skip logic edge rule',
      'Add new skip logic ego rule',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('offers no ego rule outside a query rule set', () => {
    renderRules();

    expect(
      screen.queryByRole('button', { name: /ego rule$/ }),
    ).not.toBeInTheDocument();
  });
});
