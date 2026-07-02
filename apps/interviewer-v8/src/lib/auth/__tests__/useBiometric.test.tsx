import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const isBiometricSupportedMock = vi.fn<() => Promise<boolean>>();
vi.mock('../api', () => ({
  isBiometricSupported: () => isBiometricSupportedMock(),
}));

import { useBiometric } from '../useBiometric';

function Probe() {
  const b = useBiometric();
  return (
    <span data-testid="s">
      {b.status}
      {b.status === 'unavailable' ? `:${b.reason}` : ''}
    </span>
  );
}

afterEach(() => isBiometricSupportedMock.mockReset());

describe('useBiometric (web / WebAuthn PRF)', () => {
  it('reports available when PRF is supported', async () => {
    isBiometricSupportedMock.mockResolvedValue(true);
    render(<Probe />);
    await waitFor(() =>
      expect(screen.getByTestId('s')).toHaveTextContent('available'),
    );
  });

  it('reports unavailable with a reason when PRF is unsupported', async () => {
    isBiometricSupportedMock.mockResolvedValue(false);
    render(<Probe />);
    await waitFor(() =>
      expect(screen.getByTestId('s')).toHaveTextContent(/unavailable:/),
    );
  });

  it('reports unavailable when the check throws', async () => {
    isBiometricSupportedMock.mockRejectedValue(new Error('boom'));
    render(<Probe />);
    await waitFor(() =>
      expect(screen.getByTestId('s')).toHaveTextContent(/unavailable:/),
    );
  });
});
