import { describe, expect, it } from 'vitest';

import {
  centerIssue,
  hasMapViewChanged,
  isMapCenter,
  MAX_ZOOM,
  MIN_ZOOM,
  resolveCenter,
  resolveZoom,
} from '../mapView.ts';

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
      expect(centerIssue([181, 0])).toContain('Longitude');
      expect(centerIssue([0, 91])).toContain('Latitude');
      expect(centerIssue([-74])).toContain('longitude and a latitude');
      expect(centerIssue('here')).toContain('longitude and a latitude');
    });
  });

  it('holds Mapbox’s own zoom range', () => {
    expect(MIN_ZOOM).toBe(0);
    expect(MAX_ZOOM).toBe(22);
  });
});
