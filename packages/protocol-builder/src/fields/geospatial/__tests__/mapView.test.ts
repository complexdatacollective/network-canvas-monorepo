import { describe, expect, it } from 'vitest';

import { readMessage } from '../../../testing/i18n.ts';
import {
  centerIssue,
  hasMapViewChanged,
  isMapCenter,
  MAX_ZOOM,
  MIN_ZOOM,
  resolveCenter,
  resolveZoom,
  zoomIssue,
} from '../mapView.ts';

/**
 * What a researcher actually reads about a bad view.
 *
 * Both rules travel through `messageRuleValidation`, which is a string-only
 * contract, so they hand back an encoded descriptor and the form's error
 * region decodes it. Decoding here is the same step, which is what keeps these
 * assertions about the sentence rather than about the envelope carrying it —
 * an envelope that contains the English either way, and so would pass whatever
 * the message said.
 */
const read = (
  issue: (value: unknown) => string | undefined,
  value: unknown,
): string | undefined => {
  const encoded = issue(value);
  return encoded === undefined ? undefined : readMessage(encoded);
};

describe('the view a geospatial stage opens on', () => {
  it('recognises a longitude and latitude pair, and nothing else', () => {
    expect(isMapCenter([-74, 40.7])).toBe(true);
    expect(isMapCenter([0, 0])).toBe(true);
    expect(isMapCenter([-74])).toBe(false);
    expect(isMapCenter([-74, 40.7, 3])).toBe(false);
    expect(isMapCenter(['-74', '40.7'])).toBe(false);
    expect(isMapCenter([Number.NaN, 0])).toBe(false);
    expect(isMapCenter(undefined)).toBe(false);
    expect(isMapCenter({ lng: -74, lat: 40.7 })).toBe(false);
  });

  it('opens on the middle of the world when the stage names no centre', () => {
    expect(resolveCenter([-74, 40.7])).toEqual([-74, 40.7]);
    expect(resolveCenter(undefined)).toEqual([0, 0]);
    expect(resolveCenter('somewhere')).toEqual([0, 0]);
  });

  it('opens fully zoomed out when the stage names no zoom', () => {
    expect(resolveZoom(10)).toBe(10);
    expect(resolveZoom(undefined)).toBe(MIN_ZOOM);
    expect(resolveZoom('10')).toBe(MIN_ZOOM);
    expect(resolveZoom(Number.NaN)).toBe(MIN_ZOOM);
  });

  describe('deciding whether the map has been moved', () => {
    it('reports a pan and a zoom separately', () => {
      expect(hasMapViewChanged([-74, 40.7], 10, [-74, 40.7], 10)).toBe(false);
      expect(hasMapViewChanged([-73, 40.7], 10, [-74, 40.7], 10)).toBe(true);
      expect(hasMapViewChanged([-74, 41], 10, [-74, 40.7], 10)).toBe(true);
      expect(hasMapViewChanged([-74, 40.7], 11, [-74, 40.7], 10)).toBe(true);
    });

    /**
     * A stage that never had a view counts as moved the moment the map can be
     * read, so the researcher may accept where it happens to be rather than
     * having to nudge it first.
     */
    it('counts a stage with no stored view as already moved', () => {
      expect(hasMapViewChanged([0, 0], MIN_ZOOM, undefined, undefined)).toBe(
        true,
      );
    });
  });

  describe('what is wrong with a stored centre', () => {
    it('says nothing about an empty one, which the field itself reports', () => {
      expect(centerIssue(undefined)).toBeUndefined();
      expect(centerIssue(null)).toBeUndefined();
    });

    it('accepts a pair inside the world', () => {
      expect(centerIssue([-74, 40.7])).toBeUndefined();
      expect(centerIssue([180, 90])).toBeUndefined();
      expect(centerIssue([-180, -90])).toBeUndefined();
    });

    it('names the coordinate that is out of range', () => {
      expect(read(centerIssue, [181, 0])).toBe(
        'Longitude must be between -180 and 180.',
      );
      expect(read(centerIssue, [0, 91])).toBe(
        'Latitude must be between -90 and 90.',
      );
      expect(read(centerIssue, [-74])).toContain('longitude and a latitude');
      expect(read(centerIssue, 'here')).toContain('longitude and a latitude');
    });
  });

  /**
   * The schema enforces the same range, but only against a path once the save
   * has already been refused — so the rule is stated here too, in the words
   * that sit under the control the researcher typed into.
   */
  describe('what is wrong with a stored zoom', () => {
    it('says nothing about an empty one, which the field itself reports', () => {
      expect(zoomIssue(undefined)).toBeUndefined();
      expect(zoomIssue(null)).toBeUndefined();
    });

    it('accepts every level Mapbox has', () => {
      expect(zoomIssue(MIN_ZOOM)).toBeUndefined();
      expect(zoomIssue(MAX_ZOOM)).toBeUndefined();
      expect(zoomIssue(10)).toBeUndefined();
    });

    it('refuses one beyond either end, and one that is not a number', () => {
      expect(read(zoomIssue, MAX_ZOOM + 1)).toBe(
        'Starting zoom must be a whole number between 0 and 22.',
      );
      expect(read(zoomIssue, -1)).toBe(
        'Starting zoom must be a whole number between 0 and 22.',
      );
      expect(read(zoomIssue, '10')).toBe(
        'Starting zoom must be a whole number between 0 and 22.',
      );
    });
  });

  it('holds Mapbox’s own zoom range', () => {
    expect(MIN_ZOOM).toBe(0);
    expect(MAX_ZOOM).toBe(22);
  });
});
