import { describe, expect, it } from 'vitest';

import {
  getStageDeletedAnnouncement,
  getStageMovedAnnouncement,
} from '../announcements';

describe('timeline announcements', () => {
  it('reports where a moved stage landed and how long the list is', () => {
    expect(getStageMovedAnnouncement(1, 2, 4)).toBe(
      'Moved stage 1 to position 2 of 4.',
    );
  });

  it('agrees with itself about how many stages are left', () => {
    expect(getStageDeletedAnnouncement(1, 3)).toBe(
      'Deleted stage 1. 3 stages remain.',
    );
    expect(getStageDeletedAnnouncement(2, 1)).toBe(
      'Deleted stage 2. 1 stage remains.',
    );
    expect(getStageDeletedAnnouncement(1, 0)).toBe(
      'Deleted stage 1. No stages remain.',
    );
  });
});
