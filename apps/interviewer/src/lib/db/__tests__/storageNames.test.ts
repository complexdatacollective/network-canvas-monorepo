import { describe, expect, it } from 'vitest';

import { DB_NAME } from '../storageNames';

describe('storage names', () => {
  // Interviewer 8 at /v8/ opens this same database by this name, and an 8.x
  // device already holds its protocols and interviews in it.
  it('is the database Interviewer 8 has always used', () => {
    expect(DB_NAME).toBe('interviewer');
  });
});
