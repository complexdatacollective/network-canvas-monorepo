import { useState } from 'react';
import { createPortal } from 'react-dom';

import {
  createAppIntl,
  defineMessages,
  type IntlShape,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import { cx } from '~/utils/cva';

import MapView from './MapView';
const messages = defineMessages({
  editMapView: {
    id: 'architect.form.fields.geospatial.mapSelection.editMapView',
    defaultMessage: 'Edit map view',
    description:
      'Visible text in components / Form / Fields / Geospatial / MapSelection.',
  },
  setMapView: {
    id: 'architect.form.fields.geospatial.mapSelection.setMapView',
    defaultMessage: 'Set map view',
    description:
      'Visible text in components / Form / Fields / Geospatial / MapSelection.',
  },
});
const extraMessages = defineMessages({
  required: {
    id: 'architect.mapView.required',
    defaultMessage: 'Required',
    description: 'Researcher-facing Architect control or feedback.',
  },
});

export type MapValue = {
  center?: number[];
  tokenAssetId?: string;
  initialZoom?: number;
  dataSourceAssetId?: string;
  color?: string;
  targetFeatureProperty?: string;
  style?: string;
};

/**
 * Validates the part of a present map-options object that native `required`
 * cannot inspect. Absence is deliberately left to that native rule so the
 * field also carries the visible and semantic required cues.
 */
const defaultIntl = createAppIntl({ locale: 'en' });
export const completeMapView = (
  value: unknown,
  intl: IntlShape = defaultIntl,
) => {
  if (value === null || value === undefined) return undefined;

  if (!value || typeof value !== 'object' || !('center' in value)) {
    return intl.formatMessage(extraMessages.required);
  }

  const center = value.center;
  return Array.isArray(center) &&
    center.length === 2 &&
    center.every(
      (coordinate) =>
        typeof coordinate === 'number' && Number.isFinite(coordinate),
    )
    ? undefined
    : intl.formatMessage(extraMessages.required);
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
  const intl = useAppIntl();
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
          {value.center
            ? intl.formatMessage(messages.editMapView)
            : intl.formatMessage(messages.setMapView)}
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
