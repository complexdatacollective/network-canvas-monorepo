import { useId, useState } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { geospatialMessages } from '../../sections/geospatial/geospatialMessages.ts';
import MapPreviewDialog from './MapPreviewDialog.tsx';
import { type MapCenter, resolveZoom } from './mapView.ts';

export type MapCenterFieldProps = CreateFormFieldProps<
  number[],
  'fieldset',
  {
    /**
     * The stage path holding the zoom this view is half of.
     *
     * Centre and zoom are two schema keys and therefore two fields, but one
     * gesture — panning a map — sets both. The map writes the zoom through the
     * stage form rather than through this field's own `onChange`, so the field
     * that owns `initialZoom` stays the only writer of its own key.
     */
    zoomFieldName: string;
    /** The stored key the map is drawn with. Never the key itself. */
    tokenAssetId?: string;
  }
>;

/** Which half of the pair a control holds. */
type CoordinateIndex = 0 | 1;

/** The text in both controls, and the centre those two readings were stored as. */
type CenterDraft = Readonly<{
  text: readonly [string, string];
  value: number[] | undefined;
}>;

const formatCoordinate = (value: unknown): string =>
  typeof value === 'number' && Number.isFinite(value) ? String(value) : '';

/** A stored centre as a pair of things, whatever the protocol actually holds. */
const coordinatesOf = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];

const centerText = (value: unknown): readonly [string, string] => {
  const coordinates = coordinatesOf(value);
  return [formatCoordinate(coordinates[0]), formatCoordinate(coordinates[1])];
};

/** The number one control's reading means, or nothing when it means none. */
const parseCoordinate = (text: string): number | undefined => {
  if (text.trim() === '') return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** Whether a draft still stands for the centre the form is holding. */
const standsFor = (drafted: number[] | undefined, held: unknown): boolean => {
  if (drafted === undefined) return held === undefined;
  const coordinates = coordinatesOf(held);
  return (
    coordinates.length === drafted.length &&
    drafted.every((coordinate, index) =>
      Object.is(coordinate, coordinates[index]),
    )
  );
};

/**
 * Where the map is centred when the stage opens.
 *
 * Two numbers, editable as two numbers — and settable by panning a map, for a
 * researcher who knows the place rather than its coordinates. The typed
 * controls are not a fallback for the map: they are the only way to set an
 * exact centre, and they keep working when the host cannot draw a map at all.
 *
 * Labelling of the pair belongs to the surrounding field; each control names
 * the coordinate it holds, because "longitude" and "latitude" cannot be told
 * apart by position.
 *
 * ## Why the text is kept, and why one draft covers both controls
 *
 * A coordinate is built one character at a time, and the first character of
 * half the world is a minus sign. A number input reports NOTHING for a reading
 * it cannot read as a number, so `-`, and `-` followed by a decimal point, and
 * every other half-finished coordinate, arrive here as the empty string. A
 * control rendered from the parsed number therefore rewrites itself under the
 * researcher's cursor: the minus sign of `-122.4` disappears as soon as the
 * first digit lands on it, and the stage saves a starting view in the wrong
 * hemisphere without anything on screen having said so.
 *
 * So the researcher's own text is what is SHOWN, and the numbers are what is
 * STORED. The draft is kept only while it still stands for the value the form
 * holds, so a centre set by the map — or by anything else in the editor —
 * replaces it rather than being overwritten by text the stage no longer has.
 *
 * ONE draft covers both controls because a centre is one value: an unreadable
 * longitude means the form is holding no centre at all, and a per-control
 * draft would then have nothing left to render the latitude from. Reading the
 * pair from one draft is what keeps a coordinate the researcher has already
 * finished on screen while they are still typing the other one.
 *
 * There is deliberately no settle-on-blur (which a single-valued numeric
 * control can afford): the two controls share a fieldset, so moving between
 * them is a blur, and settling there would take back the coordinate the
 * researcher had just entered. A half-entered pair is instead reported by the
 * field's own `required`, which is what the form holds while it is half
 * entered.
 */
export default function MapCenterField({
  id,
  name,
  value,
  onChange,
  onBlur,
  onFocus,
  zoomFieldName,
  tokenAssetId,
  disabled = false,
  readOnly = false,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
}: MapCenterFieldProps) {
  const intl = useAppIntl();
  const { storeApi } = useStageEditorForm();
  const controlId = useId();
  const [mapOpen, setMapOpen] = useState(false);
  const [draft, setDraft] = useState<CenterDraft | undefined>(undefined);
  const locked = disabled || readOnly;

  const text =
    draft !== undefined && standsFor(draft.value, value)
      ? draft.text
      : centerText(value);

  const setCoordinate = (
    index: CoordinateIndex,
    reading: string | number | undefined,
  ) => {
    if (locked) return;
    const entered = reading === undefined ? '' : String(reading);
    const next: [string, string] =
      index === 0 ? [entered, text[1]] : [text[0], entered];
    const longitude = parseCoordinate(next[0]);
    const latitude = parseCoordinate(next[1]);
    // Half a pair is not a centre, and zero is a real place — the Gulf of
    // Guinea — so an unreadable coordinate is never stood in for. The form
    // holds no centre until both controls read as numbers, and says so
    // through its own `required`.
    const center =
      longitude === undefined || latitude === undefined
        ? undefined
        : [longitude, latitude];
    setDraft({ text: next, value: center });
    onChange?.(center);
  };

  return (
    <fieldset
      id={id}
      data-name={name}
      disabled={disabled}
      aria-labelledby={
        ariaLabelledBy ?? (id === undefined ? undefined : `${id}-label`)
      }
      aria-describedby={ariaDescribedBy}
      aria-disabled={readOnly || undefined}
      onBlur={onBlur}
      onFocus={onFocus}
      className={cx(
        'bg-input text-input-contrast flex w-full flex-col gap-4 rounded border-2 border-transparent p-4',
        ariaInvalid && 'border-destructive',
        disabled && 'opacity-50',
        readOnly && 'opacity-70',
      )}
    >
      <div className="flex flex-wrap gap-4">
        <div className="flex min-w-40 flex-1 flex-col gap-1">
          <label htmlFor={`${controlId}-longitude`}>
            {intl.formatMessage(geospatialMessages.longitudeLabel)}
          </label>
          <InputField
            id={`${controlId}-longitude`}
            type="number"
            value={text[0]}
            readOnly={readOnly}
            aria-invalid={ariaInvalid}
            onChange={(next) => setCoordinate(0, next)}
            // The steppers are named for the coordinate they move. A screen
            // reader announces a button by its name alone, and the shared
            // field's "Increase value" is the same name on both halves of the
            // pair and on the zoom beside them.
            stepperLabels={{
              increase: intl.formatMessage(
                geospatialMessages.longitudeIncrease,
              ),
              decrease: intl.formatMessage(
                geospatialMessages.longitudeDecrease,
              ),
            }}
          />
        </div>
        <div className="flex min-w-40 flex-1 flex-col gap-1">
          <label htmlFor={`${controlId}-latitude`}>
            {intl.formatMessage(geospatialMessages.latitudeLabel)}
          </label>
          <InputField
            id={`${controlId}-latitude`}
            type="number"
            value={text[1]}
            readOnly={readOnly}
            aria-invalid={ariaInvalid}
            onChange={(next) => setCoordinate(1, next)}
            stepperLabels={{
              increase: intl.formatMessage(geospatialMessages.latitudeIncrease),
              decrease: intl.formatMessage(geospatialMessages.latitudeDecrease),
            }}
          />
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        disabled={locked}
        onClick={() => setMapOpen(true)}
      >
        {intl.formatMessage(geospatialMessages.openPreviewLabel)}
      </Button>

      {mapOpen && (
        <MapPreviewDialog
          tokenAssetId={tokenAssetId}
          center={value}
          zoom={resolveZoom(
            storeApi.getState().getValue(zoomFieldName) as unknown,
          )}
          onSave={(nextCenter: MapCenter, nextZoom: number) => {
            // The map is the other way of setting this value, so whatever the
            // researcher had half-typed here is no longer what the field is
            // showing them.
            setDraft(undefined);
            onChange?.([nextCenter[0], nextCenter[1]]);
            storeApi.getState().setFieldValue(zoomFieldName, nextZoom);
          }}
          onClose={() => setMapOpen(false)}
        />
      )}
    </fieldset>
  );
}
