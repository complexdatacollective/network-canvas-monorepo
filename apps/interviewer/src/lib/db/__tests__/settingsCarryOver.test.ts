// fake-indexeddb must be imported before Dexie opens a database.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  deleteLegacyInterviewerDatabase,
  fingerprintDatabase,
  LEGACY_DB_NAME,
  seedLegacyInterviewerDatabase,
} from '~/testUtils/legacyInterviewerDatabase';

import { db, getSettings, updateSettings } from '../db';
import { pickCarriedSettings } from '../legacySettings';
import { DEFAULT_SETTINGS } from '../types';

// Every field a device chooses in Interviewer 8's settings, none at its
// default, plus the ones that name things in Interviewer 8's own library.
const LEGACY_DEVICE_ROW = {
  id: 'device',
  exportGraphML: false,
  exportCSV: false,
  useScreenLayoutCoordinates: true,
  screenLayoutHeight: 768,
  screenLayoutWidth: 1024,
  idleTimeoutMinutes: 60,
  requireUnlockOnEnter: false,
  requireUnlockOnExit: true,
  requireUnlockOnExport: true,
  analyticsEnabled: false,
  allowStageNavigation: false,
  dismissedUpdates: ['8.4.0'],
  lastActiveProtocolHash: 'legacy-hash',
  lastActiveSessionId: 'legacy-session',
  sampleProtocolDismissed: true,
};

beforeEach(async () => {
  await db.settings.clear();
  await deleteLegacyInterviewerDatabase();
});
afterEach(async () => {
  await db.settings.clear();
  await deleteLegacyInterviewerDatabase();
});

describe("carrying Interviewer 8's settings over", () => {
  it("starts from Interviewer 8's device preferences the first time", async () => {
    await seedLegacyInterviewerDatabase({ settings: [LEGACY_DEVICE_ROW] });
    const before = await fingerprintDatabase(LEGACY_DB_NAME);

    const settings = await getSettings();

    expect(settings).toEqual({
      ...DEFAULT_SETTINGS,
      exportGraphML: false,
      exportCSV: false,
      useScreenLayoutCoordinates: true,
      screenLayoutHeight: 768,
      screenLayoutWidth: 1024,
      idleTimeoutMinutes: 60,
      requireUnlockOnEnter: false,
      requireUnlockOnExit: true,
      requireUnlockOnExport: true,
      analyticsEnabled: false,
      allowStageNavigation: false,
    });
    // Saved, so the copy happens once.
    expect(await db.settings.get('device')).toEqual(settings);
    // Read only.
    expect(await fingerprintDatabase(LEGACY_DB_NAME)).toBe(before);
  });

  it('never copies again once this app has settings of its own', async () => {
    await getSettings();
    await seedLegacyInterviewerDatabase({ settings: [LEGACY_DEVICE_ROW] });

    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
    await updateSettings({ idleTimeoutMinutes: 5 });
    expect((await getSettings()).idleTimeoutMinutes).toBe(5);
  });

  it('keeps a change made by another caller while it was reading', async () => {
    await seedLegacyInterviewerDatabase({ settings: [LEGACY_DEVICE_ROW] });

    // The first read finds no row and goes to read Interviewer 8's; a row is
    // written before it comes back.
    const reading = getSettings();
    await db.settings.put({ ...DEFAULT_SETTINGS, idleTimeoutMinutes: 1 });

    expect((await reading).idleTimeoutMinutes).toBe(1);
    expect((await db.settings.get('device'))?.idleTimeoutMinutes).toBe(1);
  });

  it('uses the defaults, and creates nothing, on a device that never ran Interviewer 8', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(await fingerprintDatabase(LEGACY_DB_NAME)).toBeUndefined();
  });

  it('uses the defaults when Interviewer 8 has no settings row', async () => {
    await seedLegacyInterviewerDatabase({});
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('pickCarriedSettings', () => {
  it('drops values this app would never have written', () => {
    expect(
      pickCarriedSettings({
        exportGraphML: 'yes',
        screenLayoutHeight: -1,
        screenLayoutWidth: Number.NaN,
        idleTimeoutMinutes: 7,
        requireUnlockOnEnter: null,
        analyticsEnabled: false,
      }),
    ).toEqual({ analyticsEnabled: false });
    expect(pickCarriedSettings(undefined)).toEqual({});
    expect(pickCarriedSettings('device')).toEqual({});
  });
});
