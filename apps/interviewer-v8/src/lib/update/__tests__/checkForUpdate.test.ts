import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { checkForUpdate } from '../checkForUpdate';
import type { RemoteRelease } from '../githubReleases';
import type { UpdateInfo } from '../types';

const platform = vi.hoisted(() => ({ isElectron: false, isCapacitor: false }));
const fetchLatestRelease = vi.hoisted(() => vi.fn());
const getInfo = vi.hoisted(() => vi.fn());
const simulatedWebUpdate = vi.hoisted(() => vi.fn());

vi.mock('../../platform/platform', () => ({
  get isElectron() {
    return platform.isElectron;
  },
  get isCapacitor() {
    return platform.isCapacitor;
  },
}));

vi.mock('../githubReleases', () => ({
  fetchLatestRelease: () => fetchLatestRelease(),
}));

vi.mock('../devSimulation', () => ({
  simulatedWebUpdate: () => simulatedWebUpdate(),
}));

vi.mock('@capacitor/app', () => ({
  App: { getInfo: () => getInfo() },
}));

const remote: RemoteRelease = {
  version: '8.1.0',
  releaseName: 'Shiny',
  body: '## notes',
  htmlUrl: 'https://example.test/r',
  publishedAt: '2026-06-01T00:00:00Z',
};

const simulated: UpdateInfo = {
  version: '8.1.0',
  currentVersion: '8.0.0-alpha.0',
  releaseName: 'Simulated',
  releaseNotesMarkdown: '## notes',
  releaseUrl: 'https://example.test/r',
  publishedAt: null,
};

beforeEach(() => {
  platform.isElectron = false;
  platform.isCapacitor = false;
  fetchLatestRelease.mockReset();
  getInfo.mockReset();
  simulatedWebUpdate.mockReset().mockReturnValue(null);
});

afterEach(() => {
  Reflect.deleteProperty(window, 'electronAPI');
});

describe('checkForUpdate (web)', () => {
  it('returns the simulated update when one is provided (dev)', async () => {
    simulatedWebUpdate.mockReturnValue(simulated);
    expect(await checkForUpdate()).toEqual(simulated);
  });

  it('returns null when simulation is off (production web)', async () => {
    simulatedWebUpdate.mockReturnValue(null);
    expect(await checkForUpdate()).toBeNull();
  });
});

describe('checkForUpdate (capacitor)', () => {
  beforeEach(() => {
    platform.isCapacitor = true;
  });

  it('returns update info when the remote release is newer', async () => {
    getInfo.mockResolvedValue({ version: '8.0.0' });
    fetchLatestRelease.mockResolvedValue(remote);

    const info = await checkForUpdate();
    expect(info).toEqual({
      version: '8.1.0',
      currentVersion: '8.0.0',
      releaseName: 'Shiny',
      releaseNotesMarkdown: '## notes',
      releaseUrl: 'https://example.test/r',
      publishedAt: '2026-06-01T00:00:00Z',
    });
  });

  it('returns null when already up to date', async () => {
    getInfo.mockResolvedValue({ version: '8.1.0' });
    fetchLatestRelease.mockResolvedValue(remote);
    expect(await checkForUpdate()).toBeNull();
  });

  it('returns null when there is no release', async () => {
    getInfo.mockResolvedValue({ version: '8.0.0' });
    fetchLatestRelease.mockResolvedValue(null);
    expect(await checkForUpdate()).toBeNull();
  });
});

describe('checkForUpdate (electron)', () => {
  beforeEach(() => {
    platform.isElectron = true;
  });

  it('delegates to the electron update bridge', async () => {
    const check = vi.fn().mockResolvedValue({
      version: '8.1.0',
      currentVersion: '8.0.0',
      releaseName: 'Shiny',
      releaseNotesMarkdown: '## notes',
      releaseUrl: 'https://example.test/r',
      publishedAt: null,
    });
    Object.assign(window, { electronAPI: { update: { check } } });

    const info = await checkForUpdate();
    expect(check).toHaveBeenCalledOnce();
    expect(info?.version).toBe('8.1.0');
  });

  it('returns null when the bridge is unavailable', async () => {
    expect(await checkForUpdate()).toBeNull();
  });
});
