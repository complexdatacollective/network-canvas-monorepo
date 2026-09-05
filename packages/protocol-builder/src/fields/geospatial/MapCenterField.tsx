import { useId, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { useStageEditorForm } from '../../form/stageEditorContext.ts';
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

const coordinate = (value: unknown): string =>
  typeof value === 'number' && Number.isFinite(value) ? String(value) : '';

const parseCoordinate = (text: string | number | undefined): number | null => {
  if (text === undefined || text === '') return null;
  const parsed = typeof text === 'number' ? text : Number(text);
  return Number.isFinite(parsed) ? parsed : null;
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
  const { storeApi } = useStageEditorForm();
  const controlId = useId();
  const [mapOpen, setMapOpen] = useState(false);
  const locked = disabled || readOnly;

  const longitude = value?.[0];
  const latitude = value?.[1];

  const setCoordinate = (index: 0 | 1, next: number | null) => {
    if (locked) return;
    const other = index === 0 ? latitude : longitude;
    if (next === null && (other === undefined || !Number.isFinite(other))) {
      onChange?.(undefined);
      return;
    }
    const pair: number[] = [longitude ?? 0, latitude ?? 0];
    pair[index] = next ?? 0;
    onChange?.(pair);
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
          <label htmlFor={`${controlId}-longitude`}>Longitude</label>
          <InputField
            id={`${controlId}-longitude`}
            type="number"
            value={coordinate(longitude)}
            readOnly={readOnly}
            aria-invalid={ariaInvalid}
            onChange={(next) => setCoordinate(0, parseCoordinate(next))}
          />
        </div>
        <div className="flex min-w-40 flex-1 flex-col gap-1">
          <label htmlFor={`${controlId}-latitude`}>Latitude</label>
          <InputField
            id={`${controlId}-latitude`}
            type="number"
            value={coordinate(latitude)}
            readOnly={readOnly}
            aria-invalid={ariaInvalid}
            onChange={(next) => setCoordinate(1, parseCoordinate(next))}
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
        Set the starting view on a map
      </Button>

      {mapOpen && (
        <MapPreviewDialog
          tokenAssetId={tokenAssetId}
          center={value}
          zoom={resolveZoom(
            storeApi.getState().getValue(zoomFieldName) as unknown,
          )}
          onSave={(nextCenter: MapCenter, nextZoom: number) => {
            onChange?.([nextCenter[0], nextCenter[1]]);
            storeApi.getState().setFieldValue(zoomFieldName, nextZoom);
          }}
          onClose={() => setMapOpen(false)}
        />
      )}
    </fieldset>
  );
}
