import { describe, expect, it } from 'vitest';

import { isArchivedLineHost } from '../archivedLineHost';

describe('isArchivedLineHost', () => {
  it('recognises the host of the running major line', () => {
    expect(isArchivedLineHost('v8.architect.networkcanvas.com', '8.5.1')).toBe(
      true,
    );
  });

  it('does not treat the production host as an archive', () => {
    expect(isArchivedLineHost('architect.networkcanvas.com', '8.5.1')).toBe(
      false,
    );
    expect(isArchivedLineHost('localhost', '9.0.0')).toBe(false);
  });

  it("does not treat another line's host as this line's archive", () => {
    expect(isArchivedLineHost('v8.architect.networkcanvas.com', '9.0.0')).toBe(
      false,
    );
    expect(isArchivedLineHost('v80.architect.networkcanvas.com', '8.5.1')).toBe(
      false,
    );
  });
});
