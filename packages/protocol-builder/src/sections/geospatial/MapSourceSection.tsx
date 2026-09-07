import { useAppIntl } from '@codaco/app-i18n/react';

import FeaturePropertyField from '../../fields/geospatial/FeaturePropertyField.tsx';
import ProtocolField from '../../form/ProtocolField.tsx';
import { useStageValue } from '../../form/stageFormHooks.ts';
import ResourcePickerControl from '../../resources/components/ResourcePickerControl.tsx';
import BuilderSection from '../BuilderSection.tsx';
import { geospatialMessages } from './geospatialMessages.ts';
import {
  LAYER_FIELD,
  PROPERTY_FIELD,
  TOKEN_FIELD,
} from './mapOptionsFields.ts';

/**
 * What the map IS: the key that lets one be drawn, and the layer that says
 * which areas can be chosen.
 *
 * Two sections rather than one, because they are two decisions a researcher
 * makes at different times and can each be finished independently — the
 * outline reports on each of them separately for the same reason. Both come
 * before the prompts: nothing can be asked about a map that does not exist
 * yet, and the property recorded here is what every prompt's answer is stored
 * as.
 *
 * The key and the layer are both stored resources, chosen through the
 * package's own resource picker: the field holds an asset id and nothing else,
 * so no file, URL, or key value is ever typed into a stage. A key's value in
 * particular cannot reach this editor — the resource gateway consumes it and
 * hands back only an id — which is why the map preview in
 * `MapAppearanceSection` asks the host to resolve the map for that id rather
 * than asking for the key.
 */
export default function MapSourceSection() {
  const intl = useAppIntl();
  const dataSourceAssetId = useStageValue(LAYER_FIELD);

  return (
    <>
      <BuilderSection
        title={intl.formatMessage(geospatialMessages.accessTitle)}
        description={intl.formatMessage(geospatialMessages.accessDescription)}
      >
        <ProtocolField<typeof ResourcePickerControl>
          name={TOKEN_FIELD}
          component={ResourcePickerControl}
          kind="apikey"
          label={intl.formatMessage(geospatialMessages.tokenLabel)}
          hint={intl.formatMessage(geospatialMessages.tokenHint)}
          required
        />
      </BuilderSection>

      <BuilderSection
        title={intl.formatMessage(geospatialMessages.layerTitle)}
        description={intl.formatMessage(geospatialMessages.layerDescription)}
      >
        <ProtocolField<typeof ResourcePickerControl>
          name={LAYER_FIELD}
          component={ResourcePickerControl}
          kind="geojson"
          label={intl.formatMessage(geospatialMessages.layerLabel)}
          hint={intl.formatMessage(geospatialMessages.layerHint)}
          required
        />
        <ProtocolField<typeof FeaturePropertyField>
          name={PROPERTY_FIELD}
          component={FeaturePropertyField}
          dataSourceAssetId={
            typeof dataSourceAssetId === 'string'
              ? dataSourceAssetId
              : undefined
          }
          label={intl.formatMessage(geospatialMessages.propertyLabel)}
          hint={intl.formatMessage(geospatialMessages.propertyHint)}
          required
        />
      </BuilderSection>
    </>
  );
}
