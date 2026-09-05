import FeaturePropertyField from '../../fields/geospatial/FeaturePropertyField.tsx';
import ProtocolField from '../../form/ProtocolField.tsx';
import { useStageValue } from '../../form/stageFormHooks.ts';
import ResourcePickerControl from '../../resources/components/ResourcePickerControl.tsx';
import BuilderSection from '../BuilderSection.tsx';
import {
  LAYER_FIELD,
  PROPERTY_FIELD,
  TOKEN_FIELD,
} from './mapOptionsFields.ts';

export type MapSourceCopy = Readonly<{
  accessTitle: string;
  accessDescription: string;
  tokenLabel: string;
  tokenHint: string;
  layerTitle: string;
  layerDescription: string;
  layerLabel: string;
  layerHint: string;
  propertyLabel: string;
  propertyHint: string;
}>;

const DEFAULT_COPY: MapSourceCopy = {
  accessTitle: 'Map access',
  accessDescription:
    'This stage draws a Mapbox map, which needs an API key from your Mapbox account.',
  tokenLabel: 'Mapbox API key',
  tokenHint:
    'The key is stored with the protocol and is never shown again once it is saved.',
  layerTitle: 'Map layer',
  layerDescription:
    'The areas a participant can choose between come from a GeoJSON layer.',
  layerLabel: 'Map layer',
  layerHint:
    'Each feature in the layer is one area a participant can select. Large layers, and areas outside the study region, make the map slow to open.',
  propertyLabel: 'Recorded property',
  propertyHint:
    'The value of this property is what gets stored when a participant selects an area, so choose one that is filled in and unique for every feature — a census tract, a postcode, or a neighbourhood name.',
};

export type MapSourceSectionProps = Readonly<{
  copy?: Partial<MapSourceCopy>;
}>;

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
export default function MapSourceSection({ copy }: MapSourceSectionProps) {
  const words = { ...DEFAULT_COPY, ...copy };
  const dataSourceAssetId = useStageValue(LAYER_FIELD);

  return (
    <>
      <BuilderSection
        title={words.accessTitle}
        description={words.accessDescription}
      >
        <ProtocolField<typeof ResourcePickerControl>
          name={TOKEN_FIELD}
          component={ResourcePickerControl}
          kind="apikey"
          label={words.tokenLabel}
          hint={words.tokenHint}
          required
        />
      </BuilderSection>

      <BuilderSection
        title={words.layerTitle}
        description={words.layerDescription}
      >
        <ProtocolField<typeof ResourcePickerControl>
          name={LAYER_FIELD}
          component={ResourcePickerControl}
          kind="geojson"
          label={words.layerLabel}
          hint={words.layerHint}
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
          label={words.propertyLabel}
          hint={words.propertyHint}
          required
        />
      </BuilderSection>
    </>
  );
}
