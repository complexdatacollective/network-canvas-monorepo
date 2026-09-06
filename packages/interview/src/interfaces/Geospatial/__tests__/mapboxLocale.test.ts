import { describe, expect, it } from 'vitest';

import { createAppIntl } from '@codaco/app-i18n/messages';

import { interviewCatalogs } from '../../../locales/catalogs';
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

describe('native Mapbox control localization', () => {
  it('supplies Spanish control labels at construction and updates the same DOM on a live switch', () => {
    const es = createAppIntl({ locale: 'es', messages: interviewCatalogs.es });
    expect(getMapboxLocale(es)).toEqual({
      'Map.Title': 'Mapa',
      'LogoControl.Title': 'Página de inicio de Mapbox',
      'AttributionControl.ToggleAttribution': 'Mostrar u ocultar los créditos',
    });
    const map = makeMapControls();
    updateMapboxControlLocale(map, es);
    expect(map.canvas).toHaveAccessibleName('Mapa');
    expect(map.logo).toHaveAccessibleName('Página de inicio de Mapbox');
    expect(map.button).toHaveAccessibleName('Mostrar u ocultar los créditos');
    expect(map.icon.title).toBe('Mostrar u ocultar los créditos');
    expect(map.container.children).toHaveLength(4);
    expect(map.container.firstChild).toBe(map.canvas);
    expect(map.logo.href).toBe('https://www.mapbox.com/');
    expect(map.credits.textContent).toBe('© Authored map source / Mapbox');
    expect(map.button).toHaveAttribute('aria-expanded', 'true');

    updateMapboxControlLocale(map, createAppIntl({ locale: 'en-GB' }));
    expect(map.canvas).toHaveAccessibleName('Map');
    expect(map.logo).toHaveAccessibleName('Mapbox homepage');
    expect(map.button).toHaveAccessibleName('Toggle attribution');
    expect(map.icon.title).toBe('Toggle attribution');
  });
});
