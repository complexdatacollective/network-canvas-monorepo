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

type MapSelectionProps = CreateFormFieldProps<MapValue, 'fieldset'>;

/**
 * Opens the map editor to set a stage's initial map view. Labelling belongs to
 * the surrounding field — pass it through `ArchitectField`'s `label`/`hint`.
 */
const MapSelection = ({
  id,
  name,
  value = {},
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
            mapOptions={value}
            onChange={(nextValue) => onChange?.(nextValue)}
            close={() => setShowMap(false)}
          />,
          document.body,
        )}
    </>
  );
};

export default MapSelection;
