import type { SVGProps } from 'react';

/**
 * Whether an icon is decoration: hidden from screen readers because the
 * control it sits in carries the name. A decorative icon gets no `<title>`,
 * which a browser would still show as a tooltip, repeating the control's name
 * (and, inside an interview, in English whatever the interview's language).
 */
export const isDecorativeIcon = (props: SVGProps<SVGSVGElement>): boolean =>
  props['aria-hidden'] === true || props['aria-hidden'] === 'true';
