import type { SvgElement, Zone } from '~/model/types';

import { assertNever } from './assertNever';

export function elementKindLabel(el: SvgElement): string {
  switch (el.kind) {
    case 'rect':
      return 'Rectangle';
    case 'ellipse':
      return 'Ellipse';
    case 'line':
      return 'Line';
    case 'polygon':
      return 'Polygon';
    case 'text':
      return 'Text';
    default:
      return assertNever(el);
  }
}

function zoneShapeLabel(zone: Zone): string {
  switch (zone.shape) {
    case 'rect':
      return 'rectangle';
    case 'circle':
      return 'circle';
    case 'polygon':
      return 'polygon';
    default:
      return assertNever(zone);
  }
}

export function zoneAriaLabel(zone: Zone): string {
  const label = zone.label.trim() === '' ? 'unlabelled' : zone.label;
  return `Zone “${label}”, ${zoneShapeLabel(zone)}`;
}
