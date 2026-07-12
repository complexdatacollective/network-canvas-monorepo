import { useState, type ComponentType, type FocusEventHandler } from 'react';
import { createPortal } from 'react-dom';
import type { WrappedFieldProps } from 'redux-form';

import Button from '@codaco/fresco-ui/Button';
import FrescoReduxField from '~/components/Form/FrescoReduxField';
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

type MapSelectionControlProps = {
  'id'?: string;
  'name'?: string;
  'value'?: MapValue;
  'onChange'?: (value: MapValue) => void;
  'onBlur'?: FocusEventHandler;
  'onFocus'?: FocusEventHandler;
  'disabled'?: boolean;
  'readOnly'?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-labelledby'?: string;
};

const MapSelectionControl = ({
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
}: MapSelectionControlProps) => {
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

type MapSelectionProps = WrappedFieldProps & {
  label?: string;
  disabled?: boolean;
  readOnly?: boolean;
};

const FrescoMapSelectionControl = MapSelectionControl as ComponentType<
  Record<string, unknown>
>;
const ReduxFieldAdapter = FrescoReduxField as unknown as ComponentType<
  Record<string, unknown>
>;

const MapSelectionBase = ({
  label = 'Initial map view',
  ...props
}: MapSelectionProps) => (
  <ReduxFieldAdapter
    {...props}
    label={label}
    fieldComponent={FrescoMapSelectionControl}
  />
);

const MapSelection = MapSelectionBase as unknown as ComponentType<
  Record<string, unknown>
>;

export default MapSelection;
