import { describe, expect, it } from 'vitest';

import {
  assetImportSurface,
  refusedCommitMessage,
  REFUSAL_SURFACES,
} from '../protocolLockMessages';

// The module's own list, never a copy of it: a surface added there and not
// here would otherwise be exempt from every assertion below.
const SURFACES = REFUSAL_SURFACES;

describe('refusedCommitMessage', () => {
  // The guard over the loops below: an empty list would pass every one of them
  // without executing a single assertion.
  it('covers every surface that can refuse', () => {
    expect(SURFACES.length).toBeGreaterThan(0);
  });

  it('lets a commit through only when this tab owns the protocol', () => {
    for (const surface of SURFACES) {
      expect(refusedCommitMessage('owned', surface)).toBeNull();
      expect(refusedCommitMessage('open-elsewhere', surface)).not.toBeNull();
      expect(refusedCommitMessage('reclaim-blocked', surface)).not.toBeNull();
    }
  });

  /**
   * The reason a commit was refused is the SAME fact for every surface, and it
   * used to be retyped per surface — the API Key Browser carried its own pair
   * of sentences that said it differently. What legitimately differs is only
   * the way out, so the shared half is pinned here: a surface added with a
   * fresh explanation of the situation fails this.
   */
  it('states the situation identically at every surface', () => {
    const openElsewhere = SURFACES.map((surface) =>
      refusedCommitMessage('open-elsewhere', surface),
    );
    for (const message of openElsewhere) {
      expect(message).toContain(
        'This protocol is open in another tab, which holds the saved copy.',
      );
    }

    const reclaimBlocked = SURFACES.map((surface) =>
      refusedCommitMessage('reclaim-blocked', surface),
    );
    for (const message of reclaimBlocked) {
      expect(message).toContain(
        'These changes cannot be saved over the version the other tab saved.',
      );
    }
  });

  // Whole sentences, never fragments, so every one of them can be localised.
  it('gives each surface its own way out, as a whole sentence', () => {
    const waysOut = new Set(
      SURFACES.map((surface) =>
        refusedCommitMessage('reclaim-blocked', surface),
      ),
    );
    expect(waysOut.size).toBe(SURFACES.length);

    for (const surface of SURFACES) {
      for (const lockState of ['open-elsewhere', 'reclaim-blocked'] as const) {
        const message = refusedCommitMessage(lockState, surface);
        expect(message?.trim()).toMatch(/\.$/);
      }
    }
  });

  /**
   * Adding a resource file is the one surface that is not itself the thing
   * holding the reclaim up, so its way out has to name whichever blocker
   * actually fired. `useProtocolTabLock` checks an open nested editor FIRST,
   * and that is the state in which `NestedDraftReclaimDialog` is on screen and
   * `StageDraftConflictDialog` is explicitly suppressed — so a refusal that
   * pointed at a stage-draft choice there described a question nobody asked.
   */
  describe('asset import', () => {
    it('sends the researcher to the editor that is holding the reclaim', () => {
      expect(
        refusedCommitMessage(
          'reclaim-blocked',
          assetImportSurface(/* blockedByNestedEditor */ true),
        ),
      ).toContain('Finish or cancel the editor you still have open');
    });

    it('sends the researcher to the stage-draft choice when that is the blocker', () => {
      expect(
        refusedCommitMessage('reclaim-blocked', assetImportSurface(false)),
      ).toContain('unsaved changes to that stage');
    });

    it('names no blocker at all when no reclaim is under way', () => {
      for (const blockedByNestedEditor of [true, false]) {
        expect(
          refusedCommitMessage(
            'open-elsewhere',
            assetImportSurface(blockedByNestedEditor),
          ),
        ).toBe(
          'This protocol is open in another tab, which holds the saved copy. Close the other tab, then add the file again.',
        );
      }
    });
  });
});
