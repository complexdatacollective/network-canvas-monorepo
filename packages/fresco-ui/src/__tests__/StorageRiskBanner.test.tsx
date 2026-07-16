import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StorageRiskBanner, type StorageRisk } from '../StorageRiskBanner';

describe('StorageRiskBanner', () => {
  it.each([
    {
      risk: 1 as StorageRisk,
      role: 'alert',
      intent: 'destructive',
      label: 'High data-loss risk',
    },
    {
      risk: 2 as StorageRisk,
      role: 'status',
      intent: 'warning',
      label: 'Medium data-loss risk',
    },
    {
      risk: 3 as StorageRisk,
      role: 'status',
      intent: 'info',
      label: 'Low data-loss risk',
    },
  ])(
    'maps risk $risk to the $intent alert and button intent',
    ({ risk, role, intent, label }) => {
      render(
        <StorageRiskBanner
          aria-label={`Risk ${risk}`}
          risk={risk}
          installAction={() => {}}
          onDismiss={() => {}}
        >
          Stored data warning
        </StorageRiskBanner>,
      );

      expect(screen.getByRole(role, { name: `Risk ${risk}` })).toHaveClass(
        `bg-${intent}`,
      );
      expect(screen.getByText(new RegExp(label))).toHaveClass('sr-only');
      expect(screen.getByRole('button', { name: 'Install' })).toHaveClass(
        `focus:outline-${intent}`,
      );
    },
  );

  it('omits the install action and keeps dismissal operable', () => {
    const onDismiss = vi.fn();
    render(
      <StorageRiskBanner risk={2} onDismiss={onDismiss}>
        Stored data warning
      </StorageRiskBanner>,
    );

    expect(
      screen.queryByRole('button', { name: 'Install' }),
    ).not.toBeInTheDocument();
    screen.getByRole('button', { name: 'Dismiss' }).click();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
