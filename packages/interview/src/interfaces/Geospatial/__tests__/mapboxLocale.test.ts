import { describe, expect, it } from 'vitest';

import { createAppIntl } from '@codaco/app-i18n/messages';

import { getMapboxLocale, updateMapboxControlLocale } from '../mapboxLocale';

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
// gives them in English.
describe('native Mapbox control names', () => {
  it('supplies English control labels at construction and applies them to the same DOM', () => {
    const intl = createAppIntl({ locale: 'en' });
    expect(getMapboxLocale(intl)).toEqual({
      'Map.Title': 'Map',
      'LogoControl.Title': 'Mapbox homepage',
      'AttributionControl.ToggleAttribution': 'Toggle attribution',
    });
    const map = makeMapControls();
    updateMapboxControlLocale(map, intl);
    expect(map.canvas).toHaveAccessibleName('Map');
    expect(map.logo).toHaveAccessibleName('Mapbox homepage');
    expect(map.button).toHaveAccessibleName('Toggle attribution');
    expect(map.icon).not.toHaveAttribute('title');
    expect(map.container.children).toHaveLength(4);
    expect(map.container.firstChild).toBe(map.canvas);
    expect(map.logo.href).toBe('https://www.mapbox.com/');
    expect(map.credits.textContent).toBe('© Authored map source / Mapbox');
    expect(map.button).toHaveAttribute('aria-expanded', 'true');
  });
});
