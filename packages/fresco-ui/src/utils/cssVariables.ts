import { type CSSProperties } from 'react';

/**
 * Inline style that also carries CSS custom properties. React's CSSProperties
 * has no index signature for `--name` keys, so an object literal with one
 * would need a cast; annotating it with this type accepts them as written.
 */
export type CSSVariablesStyle = CSSProperties & Record<`--${string}`, string>;
