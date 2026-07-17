import { Ban } from 'lucide-react';
import type { ReactElement } from 'react';

import { cx } from '@codaco/fresco-ui/utils/cva';

import { SWATCHES } from './palette';

// A hex colour to seed the native picker with when the current value can't be
// shown there (null, or a non-hex colour string).
const CUSTOM_FALLBACK = '#ffffff';

const HEX = /^#[0-9a-fA-F]{6}$/;

type ColorControlProps = {
  label: string;
  value: string | null;
  // `continuous` is true while the native colour picker is being dragged, so the
  // caller can coalesce that stream into a single undo step; discrete swatch and
  // "None" picks report false.
  onCommit: (value: string | null, continuous: boolean) => void;
  // Offers a "None" option (stroke may be absent; a fill must always be a
  // colour, so fill controls omit this).
  allowNone?: boolean;
};

const swatchBase = cx(
  'focusable border-outline/60 relative size-6 rounded-full border',
  'transition-transform hover:scale-110',
);

function selectedRing(selected: boolean): string {
  return selected
    ? 'ring-2 ring-primary ring-offset-1 ring-offset-surface'
    : '';
}

export function ColorControl({
  label,
  value,
  onCommit,
  allowNone = false,
}: ColorControlProps): ReactElement {
  const nativeValue =
    value !== null && HEX.test(value) ? value : CUSTOM_FALLBACK;
  // A custom value is one not represented by any preset swatch (and not "None").
  const isCustom =
    value !== null && !SWATCHES.some((swatch) => swatch.value === value);

  return (
    <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
      <legend className="text-text/70 mb-1.5 text-xs font-medium">
        {label}
      </legend>
      <div className="flex flex-wrap items-center gap-1.5">
        {allowNone && (
          <button
            type="button"
            aria-label="No colour"
            aria-pressed={value === null}
            onClick={() => onCommit(null, false)}
            className={cx(
              swatchBase,
              'bg-surface-2 text-text/70 flex items-center justify-center',
              selectedRing(value === null),
            )}
          >
            <Ban aria-hidden className="size-3.5" />
          </button>
        )}
        {SWATCHES.map((swatch) => (
          <button
            key={swatch.value}
            type="button"
            aria-label={swatch.label}
            aria-pressed={value === swatch.value}
            onClick={() => onCommit(swatch.value, false)}
            style={{ backgroundColor: swatch.value }}
            className={cx(swatchBase, selectedRing(value === swatch.value))}
          />
        ))}
        <label
          className={cx(
            swatchBase,
            // The focus lives on the nested native colour input, so surface its
            // keyboard focus ring on the label (which is what the user sees).
            'focusable-within overflow-hidden p-0',
            selectedRing(isCustom),
          )}
          style={isCustom ? { backgroundColor: value ?? undefined } : undefined}
        >
          <span className="sr-only">Custom colour</span>
          <input
            type="color"
            value={nativeValue}
            onChange={(event) => onCommit(event.target.value, true)}
            // Enlarged and offset so the native swatch fills the round button
            // rather than showing the browser's default bevelled chrome.
            className="absolute -inset-1 size-8 cursor-pointer border-0 bg-transparent p-0"
          />
        </label>
      </div>
    </fieldset>
  );
}
