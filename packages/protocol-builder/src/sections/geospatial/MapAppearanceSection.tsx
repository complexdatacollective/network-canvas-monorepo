import { useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';
import { OrdinalColorSequence } from '@codaco/protocol-validation';

import { mapStyleOptions } from '../../fields/geospatial/mapboxStyles.ts';
import MapCenterField from '../../fields/geospatial/MapCenterField.tsx';
import {
  centerIssue,
  MAX_ZOOM,
  MIN_ZOOM,
} from '../../fields/geospatial/mapView.ts';
import MapZoomField from '../../fields/geospatial/MapZoomField.tsx';
import ProtocolField from '../../form/ProtocolField.tsx';
import { useStageValue } from '../../form/stageFormHooks.ts';
import BuilderSection from '../BuilderSection.tsx';
import { geospatialMessages } from './geospatialMessages.ts';
import {
  CENTER_FIELD,
  COLOR_FIELD,
  SEARCH_FIELD,
  STYLE_FIELD,
  TOKEN_FIELD,
  TRANSIT_FIELD,
  ZOOM_FIELD,
} from './mapOptionsFields.ts';

const centerValidation = {
  custom: messageRuleValidation([centerIssue]),
};

/**
 * How the map LOOKS, and where it opens.
 *
 * Two more sections of the same `mapOptions` object `MapSourceSection` starts,
 * and they come after the prompts rather than beside it: a researcher settles
 * the basemap, the highlight colour and the opening view once they know what
 * they are asking the participant to point at, and the starting view in
 * particular is usually chosen to frame the answer.
 *
 * The preview behind the starting centre asks the host to resolve a map for
 * the key's asset id. This editor never sees the key itself.
 */
export default function MapAppearanceSection() {
  const intl = useAppIntl();
  const tokenAssetId = useStageValue(TOKEN_FIELD);

  const styleOptions = useMemo(() => mapStyleOptions(intl), [intl]);

  /**
   * The colours a selectable area can be drawn in.
   *
   * Named rather than only shown, because a colour has to be sayable: it is
   * chosen once here and then discussed, documented, and matched against the
   * basemap by people who are not looking at this control. The stored value is
   * a position in the theme's ordinal palette, so the position is what the
   * name is built from.
   */
  const colorOptions = useMemo(
    () =>
      OrdinalColorSequence.map((value, index) => ({
        value,
        label: intl.formatMessage(geospatialMessages.colorOptionLabel, {
          position: index + 1,
        }),
      })),
    [intl],
  );

  return (
    <>
      <BuilderSection
        title={intl.formatMessage(geospatialMessages.appearanceTitle)}
        description={intl.formatMessage(
          geospatialMessages.appearanceDescription,
        )}
      >
        <ProtocolField<typeof NativeSelectField>
          name={STYLE_FIELD}
          component={NativeSelectField}
          options={styleOptions}
          label={intl.formatMessage(geospatialMessages.styleLabel)}
          hint={intl.formatMessage(geospatialMessages.styleHint)}
          required
        />
        <ProtocolField<typeof RadioGroupField>
          name={COLOR_FIELD}
          component={RadioGroupField}
          options={colorOptions}
          label={intl.formatMessage(geospatialMessages.colorLabel)}
          hint={intl.formatMessage(geospatialMessages.colorHint)}
          required
        />
        <ProtocolField<typeof ToggleField>
          name={TRANSIT_FIELD}
          component={ToggleField}
          label={intl.formatMessage(geospatialMessages.transitLabel)}
          hint={intl.formatMessage(geospatialMessages.transitHint)}
        />
        <ProtocolField<typeof ToggleField>
          name={SEARCH_FIELD}
          component={ToggleField}
          label={intl.formatMessage(geospatialMessages.searchLabel)}
          hint={intl.formatMessage(geospatialMessages.searchHint)}
        />
      </BuilderSection>

      <BuilderSection
        title={intl.formatMessage(geospatialMessages.viewTitle)}
        description={intl.formatMessage(geospatialMessages.viewDescription)}
      >
        <ProtocolField<typeof MapCenterField>
          name={CENTER_FIELD}
          component={MapCenterField}
          zoomFieldName={ZOOM_FIELD}
          tokenAssetId={
            typeof tokenAssetId === 'string' ? tokenAssetId : undefined
          }
          label={intl.formatMessage(geospatialMessages.centerLabel)}
          hint={intl.formatMessage(geospatialMessages.centerHint)}
          required
          {...centerValidation}
        />
        <ProtocolField<typeof MapZoomField>
          name={ZOOM_FIELD}
          component={MapZoomField}
          label={intl.formatMessage(geospatialMessages.zoomLabel)}
          hint={intl.formatMessage(geospatialMessages.zoomHint, {
            min: MIN_ZOOM,
            max: MAX_ZOOM,
          })}
          required
          minValue={MIN_ZOOM}
          maxValue={MAX_ZOOM}
        />
      </BuilderSection>
    </>
  );
}
