import { describe, expect, it } from 'vitest';

import { getMapboxLocale, markMapboxControlNames } from '../mapboxLocale';

function makeMapControls() {
  const container = document.createElement('div');
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'Map');
  const logo = document.createElement('a');
  logo.className = 'mapboxgl-ctrl-logo';
  logo.href = 'https://www.mapbox.com/';
  logo.setAttribute('aria-label', 'Mapbox homepage');
  const button = document.createElement('button');
  button.className = 'mapboxgl-ctrl-attrib-button';
  button.setAttribute('aria-label', 'Toggle attribution');
  button.setAttribute('aria-expanded', 'true');
  button.title = 'Toggle attribution';
  const icon = document.createElement('span');
  icon.className = 'mapboxgl-ctrl-icon';
  icon.title = 'Toggle attribution';
  button.append(icon);
  const credits = document.createElement('div');
  credits.className = 'mapboxgl-ctrl-attrib-inner';
  credits.textContent = '© Authored map source / Mapbox';
  container.append(canvas, logo, button, credits);
  return {
    container,
    canvas,
    logo,
    button,
    icon,
    credits,
    getCanvas: () => canvas,
    getContainer: () => container,
  };
}

// The map's control names are read by screen readers only, so the interview
// gives them in English, marks them English, and shows none of them.
describe('native Mapbox control names', () => {
  it('supplies English control labels at construction', () => {
    expect(getMapboxLocale()).toEqual({
      'Map.Title': 'Map',
      'LogoControl.Title': 'Mapbox homepage',
      'AttributionControl.ToggleAttribution': 'Toggle attribution',
    });
  });

  it('marks the named controls English and removes the attribution tooltip', () => {
    const map = makeMapControls();
    markMapboxControlNames(map);
    expect(map.canvas).toHaveAttribute('lang', 'en');
    expect(map.logo).toHaveAttribute('lang', 'en');
    expect(map.button).toHaveAttribute('lang', 'en');
    expect(map.button).not.toHaveAttribute('title');
    expect(map.icon).not.toHaveAttribute('title');
    expect(map.button).toHaveAccessibleName('Toggle attribution');
    // The credits are the map's sources, in their own words: left unmarked.
    expect(map.credits).not.toHaveAttribute('lang');
    expect(map.credits.textContent).toBe('© Authored map source / Mapbox');
    expect(map.button).toHaveAttribute('aria-expanded', 'true');
  });
});
