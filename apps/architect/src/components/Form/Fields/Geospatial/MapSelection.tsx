import { useState } from 'react';
import { createPortal } from 'react-dom';

import Button from '@codaco/fresco-ui/Button';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import { cx } from '~/utils/cva';

import MapView from './MapView';

export type MapValue = {
  center?: number[];
  tokenAssetId?: string;
  initialZoom?: number;
  dataSourceAssetId?: string;
  color?: string;
  targetFeatureProperty?: string;
  style?: string;
};

export const requiredMapView = (value: unknown) => {
  if (!value || typeof value !== 'object' || !('center' in value)) {
    return 'Required';
  }

  const center = value.center;
  return Array.isArray(center) &&
    center.length === 2 &&
    center.every(
      (coordinate) =>
        typeof coordinate === 'number' && Number.isFinite(coordinate),
    )
    ? undefined
    : 'Required';
};

type MapSelectionProps = CreateFormFieldProps<MapValue, 'fieldset'> & {
  /**
   * The LIVE values of the sibling `mapOptions.*` fields that the map preview
   * needs but this field does not own. Under redux-form every `mapOptions.*`
   * control wrote into one shared nested value tree, so this field's own
   * `value` always carried its siblings' latest edits; the form store keys
   * fields independently, so they have to be handed over explicitly or the
   * preview opens with no API key and no style.
   */
  previewOptions?: Pick<MapValue, 'tokenAssetId' | 'style'>;
};

/**
 * Opens the map editor to set a stage's initial map view. Labelling belongs to
 * the surrounding field — pass it through `ArchitectField`'s `label`/`hint`.
 */
const MapSelection = ({
  id,
  name,
  value = {},
  previewOptions,
  onChange,
  onBlur,
  onFocus,
  disabled = false,
  readOnly = false,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
}: MapSelectionProps) => {
  const [showMap, setShowMap] = useState(false);

  return (
    <>
      <fieldset
        id={id}
        aria-labelledby={ariaLabelledBy ?? (id ? `${id}-label` : undefined)}
        aria-describedby={ariaDescribedBy}
        aria-disabled={readOnly || undefined}
        disabled={disabled}
        data-name={name}
        onBlur={onBlur}
        onFocus={onFocus}
        className={cx(
          'bg-input text-input-contrast flex w-full items-center rounded border-2 border-transparent p-4',
          ariaInvalid && 'border-destructive',
          disabled && 'opacity-50',
          readOnly && 'opacity-70',
        )}
      >
        <Button
          onClick={() => setShowMap(true)}
          color="primary"
          disabled={disabled || readOnly}
        >
          {value.center ? 'Edit map view' : 'Set map view'}
        </Button>
      </fieldset>

      {showMap &&
        createPortal(
          <MapView
            mapOptions={{
              ...value,
              // A stage being re-edited seeds `value` from its committed
              // `mapOptions`, so these two keys can be present but stale —
              // the live sibling field wins whenever it has an answer.
              tokenAssetId: previewOptions?.tokenAssetId ?? value.tokenAssetId,
              style: previewOptions?.style ?? value.style,
            }}
            // Only the map view itself belongs to this field. Writing the
            // preview's copy of the sibling values back would put a second
            // writer on paths the sibling fields own.
            onChange={(nextValue) =>
              onChange?.({
                ...value,
                center: nextValue.center,
                initialZoom: nextValue.initialZoom,
              })
            }
            close={() => setShowMap(false)}
          />,
          document.body,
        )}
    </>
  );
};

export default MapSelection;
