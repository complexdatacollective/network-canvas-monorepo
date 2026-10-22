import { render } from '@testing-library/react';
import { StrictMode } from 'react';
import { expect, it, vi } from 'vitest';

const install = vi.hoisted(() => vi.fn(() => Promise.resolve('registered')));
vi.mock('../legacyInterviewerServiceWorker', () => ({
  installLegacyInterviewerInBackground: install,
}));
const captureException = vi.hoisted(() => vi.fn());
vi.mock('~/lib/analytics/AnalyticsProvider', () => ({
  useAnalytics: () => ({ captureException }),
}));

const { LegacyInterviewerBackgroundInstall } =
  await import('../LegacyInterviewerBackgroundInstall');

it('starts the background install once rendered and reports its failures', () => {
  expect(install).not.toHaveBeenCalled();
  render(
    <StrictMode>
      <LegacyInterviewerBackgroundInstall />
    </StrictMode>,
  );
  // StrictMode runs the effect twice; the install itself asks once per load.
  expect(install).toHaveBeenCalled();

  const [report] = install.mock.calls[0] as unknown as [
    (error: unknown) => void,
  ];
  const failure = new Error('register failed');
  report(failure);
  expect(captureException).toHaveBeenCalledExactlyOnceWith(failure, {
    feature: 'legacy-interviewer-offline',
  });
});
