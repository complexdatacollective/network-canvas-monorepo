import { useState, type ComponentType, type FocusEventHandler } from 'react';
import type { WrappedFieldProps } from 'redux-form';

import Button from '@codaco/fresco-ui/Button';
import FrescoReduxField from '~/components/Form/FrescoReduxField';
import APIKeyThumbnail from '~/components/Thumbnail/APIKey';
import { cx } from '~/utils/cva';

import APIKeyBrowser from './APIKeyBrowser';

type GeoAPIKeyControlProps = {
  'id'?: string;
  'name'?: string;
  'value'?: string;
  'onChange'?: (value: string) => void;
  'onBlur'?: FocusEventHandler;
  'onFocus'?: FocusEventHandler;
  'disabled'?: boolean;
  'readOnly'?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-labelledby'?: string;
};

const GeoAPIKeyControl = ({
  id,
  name,
  value = '',
  onChange,
  onBlur,
  onFocus,
  disabled = false,
  readOnly = false,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
}: GeoAPIKeyControlProps) => {
  const [showAPIKeyBrowser, setShowAPIKeyBrowser] = useState(false);

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
          'bg-input text-input-contrast flex w-full flex-col items-start gap-4 rounded border-2 border-transparent p-4',
          ariaInvalid && 'border-destructive',
          disabled && 'opacity-50',
          readOnly && 'opacity-70',
        )}
      >
        {value && <APIKeyThumbnail id={value} />}
        <Button
          onClick={() => setShowAPIKeyBrowser(true)}
          color="primary"
          disabled={disabled || readOnly}
        >
          {!value ? 'Select API key' : 'Update API key'}
        </Button>
      </fieldset>
      <APIKeyBrowser
        show={showAPIKeyBrowser}
        close={() => setShowAPIKeyBrowser(false)}
        onSelect={(keyId) => onChange?.(keyId)}
        selected={value}
      />
    </>
  );
};

type GeoAPIKeyProps = WrappedFieldProps & {
  label?: string;
  disabled?: boolean;
  readOnly?: boolean;
};

const FrescoGeoAPIKeyControl = GeoAPIKeyControl as ComponentType<
  Record<string, unknown>
>;
const ReduxFieldAdapter = FrescoReduxField as unknown as ComponentType<
  Record<string, unknown>
>;

const GeoAPIKeyBase = ({
  label = 'Mapbox API key',
  ...props
}: GeoAPIKeyProps) => (
  <ReduxFieldAdapter
    {...props}
    label={label}
    fieldComponent={FrescoGeoAPIKeyControl}
  />
);

const GeoAPIKey = GeoAPIKeyBase as unknown as ComponentType<
  Record<string, unknown>
>;

export default GeoAPIKey;
