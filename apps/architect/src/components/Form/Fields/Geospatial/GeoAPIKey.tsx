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
  const [statusMessage, setStatusMessage] = useState('');

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
        {/*
          Mounted with the field, not with the message, and OUTSIDE the dialog
          it reports on. A region that arrives together with its first message
          is announced late or not at all; one created while the dialog is open
          would also be born inside the `inert` sweep the dialog put over the
          page, whose exempt set is computed once, when it opens.

          It describes whatever the field holds NOW: every route out of the
          browser rewrites it, so it can never be left asserting a key that was
          created earlier and has since been replaced.
        */}
        <div
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
          data-testid="api-key-status"
        >
          {statusMessage}
        </div>
      </fieldset>
      <APIKeyBrowser
        show={showAPIKeyBrowser}
        close={() => setShowAPIKeyBrowser(false)}
        onSelect={(selection) => {
          onChange?.(selection.id);
          setStatusMessage(
            selection.created
              ? `API key ${selection.name} created and selected.`
              : `API key ${selection.name} selected.`,
          );
        }}
        selected={value}
      />
    </>
  );
};

export default GeoAPIKey;
