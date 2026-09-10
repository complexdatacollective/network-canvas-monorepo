import type { ComponentType } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';

import AssetPickerField from '../../../fields/AssetPickerField.tsx';
import FeaturePropertyField from '../../../fields/geospatial/FeaturePropertyField.tsx';
import { geospatialMessages } from '../../../fields/geospatial/geospatialMessages.ts';
import { REQUIRED } from '../../../form/requiredField.ts';
import { useStageValue } from '../../../form/stageFormHooks.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import {
  LAYER_FIELD,
  PROPERTY_FIELD,
  TOKEN_FIELD,
} from './mapOptionsFields.ts';

/** The picker takes an open prop bag from the field wrapper. */
const ResourcePicker = AssetPickerField as ComponentType<
  Record<string, unknown>
>;

/**
 * What the map IS: the key that lets one be drawn, and the layer that says
 * which areas can be chosen.
 *
 * Two sections rather than one, because they are two decisions a researcher
 * finishes independently and the outline reports on each of them. Both come
 * before the prompts: the property recorded here is what every prompt's answer
 * is stored as.
 *
 * Both are stored resources chosen through the package's own picker, so the
 * field holds an asset id and nothing else. A key's value cannot reach this
 * editor at all — the contract's resource procedures consume it and hand back
 * only an id — which is why the map behind the starting view asks the host to
 * resolve a map for that id rather than asking for the key.
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
        <Field<typeof ResourcePicker>
          name={TOKEN_FIELD}
          component={ResourcePicker}
          kind="apikey"
          label={intl.formatMessage(geospatialMessages.tokenLabel)}
          hint={intl.formatMessage(geospatialMessages.tokenHint)}
          required={REQUIRED}
        />
      </BuilderSection>

      <BuilderSection
        title={intl.formatMessage(geospatialMessages.layerTitle)}
        description={intl.formatMessage(geospatialMessages.layerDescription)}
      >
        <Field<typeof ResourcePicker>
          name={LAYER_FIELD}
          component={ResourcePicker}
          kind="geojson"
          label={intl.formatMessage(geospatialMessages.layerLabel)}
          hint={intl.formatMessage(geospatialMessages.layerHint)}
          required={REQUIRED}
        />
        {/* Read from the LAYER field rather than handed down: the properties
            on offer are the chosen layer's own, and a layer chosen a moment
            ago has to change them without this section being told. */}
        <Field<typeof FeaturePropertyField>
          name={PROPERTY_FIELD}
          component={FeaturePropertyField}
          dataSourceAssetId={
            typeof dataSourceAssetId === 'string'
              ? dataSourceAssetId
              : undefined
          }
          label={intl.formatMessage(geospatialMessages.propertyLabel)}
          hint={intl.formatMessage(geospatialMessages.propertyHint)}
          required={REQUIRED}
        />
      </BuilderSection>
    </>
  );
}
