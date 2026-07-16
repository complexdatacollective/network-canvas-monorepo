import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getBrowserStorageProfile,
  StorageRiskBanner,
  type StorageRisk,
} from '../StorageRiskBanner';

afterEach(() => {
  vi.unstubAllGlobals();
});

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
        'bg-white',
        'text-(--component-text)',
        `focus:outline-${intent}`,
      );
      expect(screen.getByRole('button', { name: 'Dismiss' })).toHaveClass(
        'bg-white',
        'text-(--component-text)',
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

describe('getBrowserStorageProfile', () => {
  it.each([
    {
      userAgent: 'Mozilla/5.0 AppleWebKit/537.36 Chrome/140.0 Safari/537.36',
      userAgentData: {
        brands: [{ brand: 'Google Chrome', version: '140' }],
      },
      expected: { browserName: 'Chrome', engine: 'chromium', risk: 3 },
    },
    {
      userAgent: 'Mozilla/5.0 Gecko/20100101 Firefox/141.0',
      expected: { browserName: 'Firefox', engine: 'gecko', risk: 2 },
    },
    {
      userAgent:
        'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
      expected: { browserName: 'Safari', engine: 'webkit', risk: 1 },
    },
    {
      userAgent:
        'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 CriOS/140.0 Mobile/15E148 Safari/604.1',
      expected: { browserName: 'Chrome on iOS', engine: 'webkit', risk: 1 },
    },
  ])(
    'identifies $expected.browserName and its risk',
    ({ userAgent, userAgentData, expected }) => {
      vi.stubGlobal('navigator', { userAgent, userAgentData });
      expect(getBrowserStorageProfile()).toEqual(expected);
    },
  );
});
