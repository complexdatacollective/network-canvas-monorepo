import { describe, expect, it } from 'vitest';

import { resolveTimelineNavTarget } from '../timelineNavigation';

describe('resolveTimelineNavTarget', () => {
  // '' means "don't move the researcher". Each row is (change recorded at,
  // researcher currently on, destination).
  it.each([
    // A change recorded on a page that hosts the history controls is revealed
    // by returning to it.
    ['/protocol', '/protocol/assets', '/protocol'],
    ['/protocol/assets', '/protocol', '/protocol/assets'],
    ['/protocol/codebook', '/protocol/assets', '/protocol/codebook'],
    // Committed stage edits collapse to the stage list, never the editor.
    ['/protocol/stage/stage-1', '/protocol/codebook', '/protocol'],
    ['/protocol/stage/new', '/protocol/codebook', '/protocol'],
    // Already there: nothing to reveal by moving.
    ['/protocol', '/protocol', ''],
    ['/protocol/codebook', '/protocol/codebook', ''],
    ['/protocol/stage/stage-1', '/protocol', ''],
    // No page reveals these.
    ['/protocol/summary', '/protocol', ''],
    ['/protocol/experiments', '/protocol', ''],
    ['/protocol/experiments', '/protocol/codebook', ''],
    ['/', '/protocol', ''],
    ['/unknown', '/protocol', ''],
    // A path-less (legacy/non-browser) entry records no page at all.
    ['', '/protocol/assets', ''],
  ])(
    'resolves a change recorded at %s, viewed from %s, to %s',
    (recordedPath, currentPath, expected) => {
      expect(resolveTimelineNavTarget(recordedPath, currentPath)).toBe(
        expected,
      );
    },
  );

  // The Summary report renders the whole protocol, so the change is already
  // visible where the researcher is; moving them would take them out of the
  // report to show them something it was already showing.
  it('never moves the researcher off the Summary report', () => {
    for (const recordedPath of [
      '/protocol',
      '/protocol/assets',
      '/protocol/codebook',
      '/protocol/stage/stage-1',
    ]) {
      expect(resolveTimelineNavTarget(recordedPath, '/protocol/summary')).toBe(
        '',
      );
    }
  });

  // The whitelist is closed: an unrecognised locus can never route the
  // researcher out of the protocol editor.
  it('never routes an unrecognised path out of the editor', () => {
    for (const path of ['/', '/protocol/unknown', 'protocol', '/stage/1']) {
      expect(resolveTimelineNavTarget(path, '/protocol/codebook')).toBe('');
    }
  });
});
