import { useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import APIKeyThumbnail from '~/components/Thumbnail/APIKey';
import { cx } from '~/utils/cva';

import APIKeyBrowser from './APIKeyBrowser';

type GeoAPIKeyProps = CreateFormFieldProps<string, 'fieldset'>;

/**
 * Picks a stored Mapbox API key. Labelling belongs to the surrounding field —
 * pass it through `ArchitectField`'s `label`/`hint`.
 */
const GeoAPIKey = ({
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
}: GeoAPIKeyProps) => {
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

export default GeoAPIKey;
