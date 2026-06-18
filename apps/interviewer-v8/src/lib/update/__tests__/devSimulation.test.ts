import { afterEach, describe, expect, it, vi } from 'vitest';

import { simulatedWebUpdate } from '../devSimulation';

afterEach(() => vi.unstubAllEnvs());

describe('simulatedWebUpdate', () => {
  it('returns a simulated update in dev (the vitest default)', () => {
    const info = simulatedWebUpdate();
    expect(info?.version).toBe('8.1.0');
    expect(info?.releaseNotesMarkdown).toContain('simulated');
    expect(info?.releaseName).toContain('simulated');
  });

  it('returns null in a production build', () => {
    vi.stubEnv('DEV', false);
    expect(simulatedWebUpdate()).toBeNull();
  });
});
