import { useMemo, useRef, type ComponentType } from 'react';

import { createMessageError } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';

import AssetPickerField from '../../../fields/AssetPickerField.tsx';
import FeaturePropertyField from '../../../fields/geospatial/FeaturePropertyField.tsx';
import { geospatialMessages } from '../../../fields/geospatial/geospatialMessages.ts';
import { useGeoJsonFeatureProperties } from '../../../fields/geospatial/useGeoJsonFeatureProperties.ts';
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

const PROPERTY_MISSING = createMessageError(
  geospatialMessages.propertyMissingRefusal,
);

/**
 * The rule that refuses a property the chosen layer does not have.
 *
 * Both halves of the pairing are on this stage — the layer, and the property
 * every selection is recorded as — so a stage that holds one against the other
 * is a stage this section can refuse rather than report: the interview would
 * record nothing for every area the participant chose, and neither the
 * protocol schema nor anything else downstream reads the layer's bytes to
 * notice. It is the SAVE that has to stop, because swapping the layer is
 * exactly the move that breaks the pair, and the researcher has both controls
 * in front of them.
 *
 * Only against properties that were actually read. While the layer is still
 * loading, when the host could not serve it, and when the bytes are not
 * GeoJSON this can read, `names` is absent — and a gate that refused on absent
 * knowledge would trap a researcher behind a file it cannot see, over a
 * property that may well be there. Absence is left to the field's own
 * `required`, which is the same division `centerIssue` keeps.
 *
 * The rule is built once and reads the layer through a ref, as
 * `usePanelsValidation` does: a rule rebuilt whenever the read settles is a
 * new validator on a mounted field, and the form re-runs its rules on the
 * submit anyway — which is the moment this answer has to be current.
 */
function usePropertyValidation(names: readonly string[] | undefined) {
  const read = useRef<readonly string[] | undefined>(undefined);
  read.current = names;

  return useMemo(
    () => ({
      custom: messageRuleValidation([
        (value: unknown) => {
          const known = read.current;
          if (known === undefined) return undefined;
          if (typeof value !== 'string' || value === '') return undefined;
          return known.includes(value) ? undefined : PROPERTY_MISSING;
        },
      ]),
    }),
    [],
  );
}

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
  const layerAssetId =
    typeof dataSourceAssetId === 'string' ? dataSourceAssetId : undefined;
  // Read HERE, once, rather than inside the control: the same properties
  // decide what the control offers and what the save gate below will accept,
  // and two readers would fetch the layer twice to answer one question.
  const properties = useGeoJsonFeatureProperties(layerAssetId);
  const propertyValidation = usePropertyValidation(properties.names);

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
          dataSourceAssetId={layerAssetId}
          properties={properties}
          label={intl.formatMessage(geospatialMessages.propertyLabel)}
          hint={intl.formatMessage(geospatialMessages.propertyHint)}
          required={REQUIRED}
          {...propertyValidation}
        />
      </BuilderSection>
    </>
  );
}
