import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { UpdateInfo } from '../types';

const checkForUpdate = vi.hoisted(() => vi.fn());
const getSettings = vi.hoisted(() => vi.fn());
const updateSettings = vi.hoisted(() => vi.fn());
const add = vi.hoisted(() => vi.fn((_data: unknown) => 'toast-id'));
const close = vi.hoisted(() => vi.fn());
const openDialog = vi.hoisted(() => vi.fn());
const closeDialog = vi.hoisted(() => vi.fn());

vi.mock('../checkForUpdate', () => ({
  checkForUpdate: () => checkForUpdate(),
}));
vi.mock('~/lib/db/api', () => ({
  getSettings: () => getSettings(),
  updateSettings: (patch: unknown) => updateSettings(patch),
}));
vi.mock('@codaco/fresco-ui/Toast', () => ({
  useToast: () => ({ add, close }),
}));
vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({ openDialog, closeDialog }),
}));
vi.mock('~/components/UpdateDialog', () => ({
  UpdateNotes: () => null,
  UpdateActions: () => null,
  UpdateToastActions: () => null,
}));

const info: UpdateInfo = {
  version: '8.1.0',
  currentVersion: '8.0.0',
  releaseName: 'Shiny',
  releaseNotesMarkdown: 'notes',
  releaseUrl: 'https://example.test/r',
  publishedAt: null,
};

async function importHook() {
  const mod = await import('../useUpdateCheck');
  return mod.useUpdateCheck;
}

beforeEach(() => {
  vi.resetModules(); // resets the module-level run-once guard
  checkForUpdate.mockReset();
  getSettings.mockReset();
  updateSettings.mockReset();
  add.mockReset().mockReturnValue('toast-id');
  close.mockReset();
});

afterEach(() => vi.clearAllMocks());

describe('useUpdateCheck', () => {
  it('shows a toast for a fresh, non-skipped release', async () => {
    checkForUpdate.mockResolvedValue(info);
    getSettings.mockResolvedValue({ dismissedUpdates: [] });

    const useUpdateCheck = await importHook();
    renderHook(() => useUpdateCheck());

    await waitFor(() => expect(add).toHaveBeenCalledOnce());
    expect(add.mock.calls[0]?.[0]).toMatchObject({
      title: 'Update available',
      variant: 'info',
      timeout: 0,
    });
  });

  it('does not show a toast when the version was skipped', async () => {
    checkForUpdate.mockResolvedValue(info);
    getSettings.mockResolvedValue({ dismissedUpdates: ['8.1.0'] });

    const useUpdateCheck = await importHook();
    renderHook(() => useUpdateCheck());

    await waitFor(() => expect(getSettings).toHaveBeenCalled());
    expect(add).not.toHaveBeenCalled();
  });

  it('does nothing when no update is available', async () => {
    checkForUpdate.mockResolvedValue(null);

    const useUpdateCheck = await importHook();
    renderHook(() => useUpdateCheck());

    await waitFor(() => expect(checkForUpdate).toHaveBeenCalled());
    expect(getSettings).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });
});
