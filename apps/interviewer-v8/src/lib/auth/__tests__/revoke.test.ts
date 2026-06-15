// fake-indexeddb must be imported before Dexie opens a database.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';

import { getSettings, updateSettings } from '../../db/api';
import { enrolWithoutLock, revoke, status } from '../api';

describe('revoke (web)', () => {
  it('wipes the database and vault metadata', async () => {
    await enrolWithoutLock();
    await updateSettings({ requireUnlockOnExit: true });

    await revoke();

    const s = await status();
    expect(s.configured).toBe(false);
    // Settings were wiped with the database; reads return defaults.
    const settings = await getSettings();
    expect(settings.requireUnlockOnExit).toBe(false);
  });

  it('keeps the database usable for re-enrolment in the same session', async () => {
    await enrolWithoutLock();
    await updateSettings({ requireUnlockOnExit: true });

    // Reset from the settings menu, then run the setup wizard again without
    // reloading the page. The finish handler writes settings; a Dexie
    // DatabaseClosedError here previously broke the post-wizard redirect.
    await revoke();
    await enrolWithoutLock();

    await expect(
      updateSettings({ requireUnlockOnEnter: false }),
    ).resolves.toMatchObject({ requireUnlockOnEnter: false });
  });
});
