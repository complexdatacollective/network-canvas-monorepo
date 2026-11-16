import { describe, expect, it } from 'vitest';

import { getMapboxLocale } from '../mapboxLocale';

// The map's control names are read by screen readers only, so the interview
// gives them in English.
describe('native Mapbox control names', () => {
  it('supplies English control labels at construction', () => {
    expect(getMapboxLocale()).toEqual({
      'Map.Title': 'Map',
      'LogoControl.Title': 'Mapbox homepage',
      'AttributionControl.ToggleAttribution': 'Toggle attribution',
    });
  });
});
