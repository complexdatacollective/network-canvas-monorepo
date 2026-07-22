import type { SvgElement, ZoneElement } from '~/model/types';

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

// A zone is any rect/ellipse/polygon element carrying a non-null zoneLabel; lines
// and text can never be zones. Used to add zone chrome and branch keyboard
// activation without re-deriving the whole zone list.
export function isZoneElement(el: SvgElement): el is ZoneElement {
  return (
    (el.kind === 'rect' || el.kind === 'ellipse' || el.kind === 'polygon') &&
    el.zoneLabel !== null
  );
}

// Screen-reader label for a zone-marked element, e.g. `Ellipse, zone "inner"`.
export function zoneAriaLabel(el: ZoneElement): string {
  const label =
    el.zoneLabel === null || el.zoneLabel.trim() === ''
      ? 'unlabelled'
      : el.zoneLabel;
  return `${elementKindLabel(el)}, zone “${label}”`;
}
