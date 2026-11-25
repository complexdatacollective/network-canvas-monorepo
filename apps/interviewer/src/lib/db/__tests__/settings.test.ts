// fake-indexeddb must be imported before Dexie opens a database.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { db, getSettings, updateSettings } from '../db';
import type { StoredSettings } from '../types';

type SettingsRowBeforeInteractionSounds = Omit<
  StoredSettings,
  'interactionSounds'
>;

const resetDatabase = async () => {
  db.close();
  await db.delete({ disableAutoOpen: false });
};

beforeEach(resetDatabase);
afterEach(resetDatabase);

describe('the interaction sounds setting', () => {
  it('reads as off on a device whose settings row predates it', async () => {
    // A row written before the setting existed, by an earlier release or by
    // Interviewer 8, has no `interactionSounds` field at all.
    await db
      .table<SettingsRowBeforeInteractionSounds, 'device'>('settings')
      .put({
        id: 'device',
        exportGraphML: false,
        exportCSV: true,
        useScreenLayoutCoordinates: false,
        screenLayoutHeight: 1080,
        screenLayoutWidth: 1920,
        dismissedUpdates: [],
        idleTimeoutMinutes: 5,
        requireUnlockOnEnter: true,
        requireUnlockOnExit: false,
        requireUnlockOnExport: false,
        sampleProtocolDismissed: false,
        analyticsEnabled: true,
        allowStageNavigation: true,
      });

    const settings = await getSettings();

    expect(settings.interactionSounds).toBe(false);
    // The rest of the row is the device's own.
    expect(settings.exportGraphML).toBe(false);
    expect(settings.idleTimeoutMinutes).toBe(5);
  });

  it('stays on once turned on, after the database is reopened', async () => {
    expect((await getSettings()).interactionSounds).toBe(false);

    await updateSettings({ interactionSounds: true });
    db.close();
    await db.open();

    expect((await getSettings()).interactionSounds).toBe(true);
    expect((await db.settings.get('device'))?.interactionSounds).toBe(true);
  });
});
