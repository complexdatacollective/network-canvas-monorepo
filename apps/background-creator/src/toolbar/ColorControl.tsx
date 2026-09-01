import { Ban, type LucideIcon, PaintBucket, Type } from 'lucide-react';
import type { ReactElement } from 'react';

import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import {
  controlVariants,
  groupSpacingVariants,
  inputControlVariants,
  stateVariants,
} from '@codaco/fresco-ui/styles/controlVariants';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { resolvePaint } from '~/model/paint';
import { useEditorStore } from '~/state/editorStore';

import { SWATCHES, THEME_SWATCHES } from './palette';

// A hex colour to seed the native picker with when the current value can't be
// shown there (null, or a non-hex colour string).
const CUSTOM_FALLBACK = '#ffffff';

const HEX = /^#[0-9a-fA-F]{6}$/;

// A glyph on each theme swatch distinguishes it from its literal near-twin in
// the palette (theme text ≈ white, theme background ≈ near black) — without
// one, a sighted mouse user cannot tell which of the two look-alikes carries
// theme adaptation. The glyph paints in the OPPOSITE sentinel's colour for
// guaranteed contrast.
const THEME_GLYPHS: Record<string, LucideIcon> = {
  text: Type,
  background: PaintBucket,
};

// Best-effort resolution of a sentinel's current colour to #rrggbb so the
// native picker opens near the colour the user sees instead of pure white. A
// computed-style probe resolves the var(); canvas normalises whatever colour
// serialisation the browser returns. Falls back to the plain seed when either
// step is unavailable (jsdom, detached documents).
function sentinelSeedHex(cssColor: string): string {
  try {
    const probe = document.createElement('span');
    probe.style.color = cssColor;
    probe.style.display = 'none';
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return CUSTOM_FALLBACK;
    ctx.fillStyle = resolved;
    const normalized = ctx.fillStyle;
    return HEX.test(normalized) ? normalized : CUSTOM_FALLBACK;
  } catch {
    return CUSTOM_FALLBACK;
  }
}

const swatchBase = cx(
  'focusable border-outline/60 relative size-6 rounded-full border',
  'transition-transform hover:scale-110',
);

// The same input-like container chrome fresco-ui's RadioGroup field renders
// its options inside, so the swatch grid presents as a labelled field.
const swatchContainer = cx(
  controlVariants(),
  inputControlVariants(),
  stateVariants(),
  groupSpacingVariants({ size: 'sm' }),
  'min-w-0 flex-wrap justify-start',
);

function selectedRing(selected: boolean): string {
  return selected
    ? 'ring-2 ring-primary ring-offset-1 ring-offset-surface'
    : '';
}

type ColorSwatchInputProps = {
  // Attached to the swatch container, matching RadioGroupField's handling of
  // the field-provided id.
  'id'?: string;
  'value': string | null;
  // A discrete pick (swatch or "None"); one history step per call.
  'onChange': (value: string | null) => void;
  // The native picker's drag stream; callers coalesce it into one undo step.
  'onContinuousChange'?: (value: string) => void;
  // Ends the current picker's coalescing run (its popup blurred), so a later
  // session on the same element is a separate undo step.
  'onContinuousEnd'?: () => void;
  // Names the swatch group for assistive tech — each swatch button only says
  // "White", "Custom colour", etc., so without this the user cannot tell Fill
  // from Stroke from Text colour.
  'groupLabel': string;
  'allowNone'?: boolean;
  'aria-describedby'?: string;
};

function ColorSwatchInput({
  id,
  value,
  onChange,
  onContinuousChange,
  onContinuousEnd,
  groupLabel,
  allowNone = false,
  'aria-describedby': ariaDescribedBy,
}: ColorSwatchInputProps): ReactElement {
  const nativeValue =
    value !== null && HEX.test(value)
      ? value
      : value === 'text' || value === 'background'
        ? sentinelSeedHex(resolvePaint(value))
        : CUSTOM_FALLBACK;
  // A custom value is one not represented by any preset swatch (and not "None").
  const isCustom =
    value !== null &&
    !SWATCHES.some((swatch) => swatch.value === value) &&
    !THEME_SWATCHES.some((swatch) => swatch.value === value);

  return (
    <div
      id={id}
      role="group"
      aria-label={groupLabel}
      aria-describedby={ariaDescribedBy}
      className={swatchContainer}
    >
      {allowNone && (
        <button
          type="button"
          aria-label="No colour"
          aria-pressed={value === null}
          onClick={() => onChange(null)}
          className={cx(
            swatchBase,
            'bg-surface-2 text-text/70 flex items-center justify-center',
            selectedRing(value === null),
          )}
        >
          <Ban aria-hidden className="size-3.5" />
        </button>
      )}
      {THEME_SWATCHES.map((swatch) => {
        const Glyph = THEME_GLYPHS[swatch.value];
        const glyphColor = resolvePaint(
          swatch.value === 'text' ? 'background' : 'text',
        );
        return (
          <button
            key={swatch.value}
            type="button"
            aria-label={swatch.label}
            title={swatch.label}
            aria-pressed={value === swatch.value}
            onClick={() => onChange(swatch.value)}
            style={{ backgroundColor: resolvePaint(swatch.value) }}
            className={cx(
              swatchBase,
              'flex items-center justify-center',
              selectedRing(value === swatch.value),
            )}
          >
            {Glyph && (
              <Glyph
                aria-hidden
                className="size-3"
                style={{ color: glyphColor }}
              />
            )}
          </button>
        );
      })}
      {SWATCHES.map((swatch) => (
        <button
          key={swatch.value}
          type="button"
          aria-label={swatch.label}
          aria-pressed={value === swatch.value}
          onClick={() => onChange(swatch.value)}
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
          onChange={(event) =>
            (onContinuousChange ?? onChange)(event.target.value)
          }
          // The picker reports every change as continuous under one coalesce
          // key; blur (the popup closing) ends that session so the next one is
          // its own undo step.
          onBlur={() => onContinuousEnd?.()}
          // Enlarged and offset so the native swatch fills the round button
          // rather than showing the browser's default bevelled chrome.
          className="absolute -inset-1 size-8 cursor-pointer border-0 bg-transparent p-0"
        />
      </label>
    </div>
  );
}

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

export function ColorControl({
  label,
  value,
  onCommit,
  allowNone = false,
}: ColorControlProps): ReactElement {
  return (
    <UnconnectedField
      label={label}
      name={label.toLowerCase().replaceAll(/\s+/g, '-')}
      component={ColorSwatchInput}
      value={value}
      allowNone={allowNone}
      groupLabel={label}
      onChange={(next) => onCommit(next, false)}
      onContinuousChange={(next: string) => onCommit(next, true)}
      onContinuousEnd={() => useEditorStore.getState().resetCoalescing()}
    />
  );
}
