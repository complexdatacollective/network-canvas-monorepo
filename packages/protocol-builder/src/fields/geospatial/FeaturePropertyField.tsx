import { useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import ResourceFailureNotice from '../../resources/components/ResourceFailureNotice.tsx';
import { geospatialMessages } from './geospatialMessages.ts';
import type { GeoJsonPropertiesState } from './useGeoJsonFeatureProperties.ts';

export type FeaturePropertyFieldProps = CreateFormFieldProps<
  string,
  'div',
  {
    /** The chosen map layer, whose features carry the properties offered. */
    dataSourceAssetId?: string;
    /**
     * What that layer's features carry, read by the SECTION rather than here.
     *
     * The same read decides what this control offers and whether the section's
     * save gate refuses what it holds, so the two cannot disagree about a
     * layer — and the file is fetched once for both.
     */
    properties: GeoJsonPropertiesState;
  }
>;

/**
 * Which property of a selected area is recorded as the participant's answer.
 *
 * The list comes from the layer itself, so it names properties that are
 * actually there — a control that let a researcher type one would let them
 * record something no feature carries, and the interview would then store
 * nothing for every selection.
 *
 * A property the stage already records is KEPT and shown even when the current
 * layer has no such property, and even when the layer could not be read at
 * all: blanking it would hide the very mismatch the researcher has to resolve,
 * and would then save the blank over it. Refusing that mismatch belongs to the
 * section's own save gate, which is the only thing a save passes through —
 * see `MapSourceSection`.
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
  properties,
  disabled = false,
  readOnly = false,
  className,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
  'aria-required': ariaRequired,
}: FeaturePropertyFieldProps) {
  const intl = useAppIntl();
  const { names, busy, failure, retry, unreadable } = properties;

  const selected = value === '' ? undefined : value;
  const noLayerChosen =
    dataSourceAssetId === undefined || dataSourceAssetId === '';
  const isMissing =
    selected !== undefined && names !== undefined && !names.includes(selected);

  const options = useMemo(() => {
    // No layer, nothing to offer — not even what the stage records. The
    // property is meaningless without a layer to read it from, and a control
    // holding the last one would read as an answer the researcher can keep.
    if (noLayerChosen) return [];
    const listed = (names ?? []).map((property) => ({
      value: property,
      label: property,
    }));
    if (selected === undefined || names?.includes(selected) === true) {
      return listed;
    }
    // Offered last, as the current choice, so a stale reference is visible
    // without sitting among the properties the layer really has. Offered while
    // the layer is unread too — that is the one state where nothing else could
    // say what this stage records.
    return [
      ...listed,
      {
        value: selected,
        label: isMissing
          ? intl.formatMessage(geospatialMessages.propertyMissingOptionLabel, {
              property: selected,
            })
          : selected,
      },
    ];
  }, [intl, isMissing, names, noLayerChosen, selected]);

  // Only ever what is true right now. A layer that is still being read, or one
  // the host could not serve, is NOT "no layer chosen": saying so contradicts
  // the failure notice above it and sends the researcher back to a control
  // they have already answered.
  const note = noLayerChosen
    ? intl.formatMessage(geospatialMessages.propertyNoLayer)
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
          {note}
        </Paragraph>
      ) : (
        <>
          {note !== undefined && (
            <Paragraph margin="none" emphasis="muted">
              {note}
            </Paragraph>
          )}
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
        </>
      )}
    </div>
  );
}
