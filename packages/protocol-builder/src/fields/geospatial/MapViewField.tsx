import { useId, useState } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Field from '@codaco/fresco-ui/form/Field/Field';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { REQUIRED } from '../../form/requiredField.ts';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { geospatialMessages } from './geospatialMessages.ts';
import MapPreviewDialog from './MapPreviewDialog.tsx';
import { type MapCenter, resolveZoom, zoomIssue } from './mapView.ts';
import MapZoomField from './MapZoomField.tsx';

export type MapViewFieldProps = CreateFormFieldProps<
  number[],
  'fieldset',
  {
    /**
     * The stage path the zoom is stored at. The protocol keeps it beside the
     * centre rather than inside it, and this field is registered on the centre
     * alone, so the zoom is read and written through the stage form.
     */
    zoomFieldName: string;
    /** The stored key the map is drawn with. Never the key itself. */
    tokenAssetId?: string;
    /**
     * The basemap the stage is configured to show. Passed through to the
     * preview so the view is framed on what the participant will see rather
     * than on whatever style the host credentialled for the key.
     */
    style?: string;
  }
>;

/**
 * Said under the control rather than left to the schema, which reports the
 * same range against a path once the save has already been refused.
 */
const zoomValidation = messageRuleValidation([zoomIssue]);

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
 * The view the map opens on: where it is centred, and how far in.
 *
 * One decision and therefore one field, as released Architect asked it —
 * three numbers and a map, inside one group. Architect offered the map alone;
 * the typed controls are the only way to set an exact view, and they keep
 * working when the host cannot draw a map at all, so they stay.
 *
 * The zoom is stored beside the centre rather than inside it, so it is read
 * and written through the stage form: this field is registered on
 * `mapOptions.center`, and a second registration over the same object is
 * something the form store cannot hold.
 *
 * ## Why the researcher's text is kept
 *
 * A number input reports NOTHING for a reading it cannot parse, so `-`, and
 * every other half-finished coordinate, arrives here as the empty string. A
 * control rendered from the parsed number therefore rewrites itself under the
 * cursor: the minus sign of `-122.4` disappears as soon as the first digit
 * lands on it, and the stage saves a starting view in the wrong hemisphere
 * with nothing on screen having said so. So the text is what is SHOWN and the
 * numbers are what is STORED, and the draft is dropped as soon as it stops
 * standing for the value the form holds.
 *
 * ONE draft covers both controls because a centre is one value: an unreadable
 * longitude means the form holds no centre at all, and a per-control draft
 * would have nothing left to render the latitude from.
 *
 * There is deliberately no settle-on-blur: the two controls share a fieldset,
 * so moving between them is a blur, and settling there would take back the
 * coordinate just entered. A half-entered pair is reported by the field's own
 * `required`.
 */
export default function MapViewField({
  id,
  name,
  value,
  onChange,
  onBlur,
  onFocus,
  zoomFieldName,
  tokenAssetId,
  style,
  disabled = false,
  readOnly = false,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
}: MapViewFieldProps) {
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
        <div className="flex min-w-40 flex-1 flex-col">
          {/*
            A registered field of its own, inside the group rather than beside
            it. The protocol stores the zoom next to the centre rather than
            within it, and the form store holds one field per path — so this is
            what keeps a zoom readable, writable and refusable where the
            researcher sets it, while the researcher still meets one decision
            with one name, as released Architect asked it.
          */}
          <Field<typeof MapZoomField>
            name={zoomFieldName}
            component={MapZoomField}
            label={intl.formatMessage(geospatialMessages.zoomLabel)}
            required={REQUIRED}
            custom={zoomValidation}
          />
        </div>
      </div>

      <Button
        type="button"
        color="primary"
        className="self-start"
        disabled={locked}
        onClick={() => setMapOpen(true)}
      >
        {intl.formatMessage(geospatialMessages.openPreviewLabel)}
      </Button>

      {mapOpen && (
        <MapPreviewDialog
          tokenAssetId={tokenAssetId}
          style={style}
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
