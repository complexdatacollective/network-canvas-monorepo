import { useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import ResourceFailureNotice from '../../resources/components/ResourceFailureNotice.tsx';
import { geospatialMessages } from '../../sections/geospatial/geospatialMessages.ts';
import { useGeoJsonFeatureProperties } from './useGeoJsonFeatureProperties.ts';

export type FeaturePropertyFieldProps = CreateFormFieldProps<
  string,
  'div',
  {
    /** The chosen map layer, whose features carry the properties offered. */
    dataSourceAssetId?: string;
  }
>;

/**
 * Which property of a selected area is recorded as the participant's answer.
 *
 * The list comes from the layer itself, so it names properties that are
 * actually there. A property the stage already records is kept and shown even
 * when the current layer has no such property: blanking it would hide the very
 * mismatch the researcher has to resolve, and would then save the blank over
 * it.
 *
 * Labelling belongs to the surrounding field.
 */
export default function FeaturePropertyField({
  id,
  name,
  value,
  onChange,
  onBlur,
  onFocus,
  dataSourceAssetId,
  disabled = false,
  readOnly = false,
  className,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
  'aria-required': ariaRequired,
}: FeaturePropertyFieldProps) {
  const intl = useAppIntl();
  const { names, busy, failure, retry, unreadable } =
    useGeoJsonFeatureProperties(dataSourceAssetId);

  const selected = value === '' ? undefined : value;
  const isMissing =
    selected !== undefined && names !== undefined && !names.includes(selected);

  const options = useMemo(() => {
    const listed = (names ?? []).map((property) => ({
      value: property,
      label: property,
    }));
    // Offered last, as the current choice, so a stale reference is visible
    // without sitting among the properties the layer really has.
    return isMissing && selected !== undefined
      ? [
          ...listed,
          {
            value: selected,
            label: intl.formatMessage(
              geospatialMessages.propertyMissingOptionLabel,
              { property: selected },
            ),
          },
        ]
      : listed;
  }, [intl, isMissing, names, selected]);

  const noLayer = intl.formatMessage(geospatialMessages.propertyNoLayer);
  const note =
    dataSourceAssetId === undefined || dataSourceAssetId === ''
      ? noLayer
      : unreadable
        ? intl.formatMessage(geospatialMessages.propertyUnreadable)
        : names !== undefined && names.length === 0
          ? intl.formatMessage(geospatialMessages.propertyNoProperties)
          : undefined;

  return (
    <div
      data-name={name}
      className={className}
      onBlur={onBlur}
      onFocus={onFocus}
    >
      {busy && (
        <output className="sr-only">
          {intl.formatMessage(geospatialMessages.propertyLoading)}
        </output>
      )}

      {failure !== undefined && (
        <ResourceFailureNotice
          failure={failure}
          onRetry={retry}
          retryLabel={intl.formatMessage(geospatialMessages.propertyRetryLabel)}
          busy={busy}
        />
      )}

      {options.length === 0 ? (
        <Paragraph
          id={id}
          margin="none"
          emphasis="muted"
          aria-describedby={ariaDescribedBy}
        >
          {note ?? noLayer}
        </Paragraph>
      ) : (
        <>
          <NativeSelectField
            id={id}
            name={name}
            value={value ?? ''}
            options={options}
            disabled={disabled}
            readOnly={readOnly}
            onChange={(next) => {
              if (disabled || readOnly) return;
              onChange?.(typeof next === 'string' ? next : String(next ?? ''));
            }}
            aria-describedby={ariaDescribedBy}
            aria-invalid={ariaInvalid}
            aria-labelledby={ariaLabelledBy}
            aria-required={ariaRequired}
          />
          {isMissing && (
            <p className="text-destructive mt-2 text-sm">
              {intl.formatMessage(geospatialMessages.propertyMissingRefusal)}
            </p>
          )}
        </>
      )}
    </div>
  );
}
