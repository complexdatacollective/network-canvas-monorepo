import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';
import { OrdinalColorSequence } from '@codaco/protocol-validation';

import FeaturePropertyField from '../../fields/geospatial/FeaturePropertyField.tsx';
import { MAP_STYLE_OPTIONS } from '../../fields/geospatial/mapboxStyles.ts';
import MapCenterField from '../../fields/geospatial/MapCenterField.tsx';
import {
  centerIssue,
  MAX_ZOOM,
  MIN_ZOOM,
} from '../../fields/geospatial/mapView.ts';
import MapZoomField from '../../fields/geospatial/MapZoomField.tsx';
import ProtocolField from '../../form/ProtocolField.tsx';
import { useStageValue } from '../../form/stageFormHooks.ts';
import ResourcePickerControl from '../../resources/components/ResourcePickerControl.tsx';
import BuilderSection from '../BuilderSection.tsx';

/** Every key the schema keeps a geospatial stage's map settings under. */
const TOKEN_FIELD = 'mapOptions.tokenAssetId';
const LAYER_FIELD = 'mapOptions.dataSourceAssetId';
const PROPERTY_FIELD = 'mapOptions.targetFeatureProperty';
const STYLE_FIELD = 'mapOptions.style';
const COLOR_FIELD = 'mapOptions.color';
const TRANSIT_FIELD = 'mapOptions.showTransit';
const SEARCH_FIELD = 'mapOptions.allowSearch';
const CENTER_FIELD = 'mapOptions.center';
const ZOOM_FIELD = 'mapOptions.initialZoom';

/**
 * The colours a selectable area can be drawn in.
 *
 * Named rather than only shown, because a colour has to be sayable: it is
 * chosen once here and then discussed, documented, and matched against the
 * basemap by people who are not looking at this control.
 */
const COLOR_OPTIONS = OrdinalColorSequence.map((value, index) => ({
  value,
  label: `Highlight colour ${index + 1}`,
}));

const centerValidation = {
  custom: messageRuleValidation([centerIssue]),
};

export type MapOptionsCopy = Readonly<{
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
  appearanceTitle: string;
  appearanceDescription: string;
  styleLabel: string;
  styleHint: string;
  colorLabel: string;
  colorHint: string;
  transitLabel: string;
  transitHint: string;
  searchLabel: string;
  searchHint: string;
  viewTitle: string;
  viewDescription: string;
  centerLabel: string;
  centerHint: string;
  zoomLabel: string;
  zoomHint: string;
}>;

const DEFAULT_COPY: MapOptionsCopy = {
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
  appearanceTitle: 'Map appearance',
  appearanceDescription: 'Choose how the map looks to the participant.',
  styleLabel: 'Basemap',
  styleHint:
    'The map drawn beneath the selectable areas. Check that place names on it stay readable under the highlight colour.',
  colorLabel: 'Highlight colour',
  colorHint:
    'Selectable areas are outlined in this colour, and the area a participant chooses is filled with it.',
  transitLabel: 'Show public transport',
  transitHint: 'Draw transit routes and stations on the map.',
  searchLabel: 'Allow searching the map',
  searchHint:
    'Let participants search for an address, a neighbourhood, or a landmark instead of panning to it.',
  viewTitle: 'Starting map view',
  viewDescription:
    'Where the map is centred, and how far in it is zoomed, when the stage opens.',
  centerLabel: 'Starting centre',
  centerHint:
    'Enter the coordinates, or set them by panning a map. Longitude runs from -180 to 180, latitude from -90 to 90.',
  zoomLabel: 'Starting zoom',
  zoomHint: `${MIN_ZOOM} shows the whole world; ${MAX_ZOOM} is street level.`,
};

export type MapOptionsSectionProps = Readonly<{
  copy?: Partial<MapOptionsCopy>;
}>;

/**
 * Everything about the map a geospatial stage shows.
 *
 * Four sections rather than one, because they are four decisions a researcher
 * makes at different times and can each be finished independently: the key
 * that lets a map be drawn at all, the layer that says what can be chosen, how
 * the map looks, and where it opens. The outline reports on each of them
 * separately for the same reason.
 *
 * The key and the layer are both stored resources, chosen through the
 * package's own resource picker: the field holds an asset id and nothing else,
 * so no file, URL, or key value is ever typed into a stage. A key's value in
 * particular cannot reach this editor — the resource gateway consumes it and
 * hands back only an id — which is why the map preview asks the host to
 * resolve the map for that id rather than asking for the key.
 */
export default function MapOptionsSection({ copy }: MapOptionsSectionProps) {
  const words = { ...DEFAULT_COPY, ...copy };
  const tokenAssetId = useStageValue(TOKEN_FIELD);
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

      <BuilderSection
        title={words.appearanceTitle}
        description={words.appearanceDescription}
      >
        <ProtocolField<typeof NativeSelectField>
          name={STYLE_FIELD}
          component={NativeSelectField}
          options={[...MAP_STYLE_OPTIONS]}
          label={words.styleLabel}
          hint={words.styleHint}
          required
        />
        <ProtocolField<typeof RadioGroupField>
          name={COLOR_FIELD}
          component={RadioGroupField}
          options={COLOR_OPTIONS}
          label={words.colorLabel}
          hint={words.colorHint}
          required
        />
        <ProtocolField<typeof ToggleField>
          name={TRANSIT_FIELD}
          component={ToggleField}
          label={words.transitLabel}
          hint={words.transitHint}
        />
        <ProtocolField<typeof ToggleField>
          name={SEARCH_FIELD}
          component={ToggleField}
          label={words.searchLabel}
          hint={words.searchHint}
        />
      </BuilderSection>

      <BuilderSection
        title={words.viewTitle}
        description={words.viewDescription}
      >
        <ProtocolField<typeof MapCenterField>
          name={CENTER_FIELD}
          component={MapCenterField}
          zoomFieldName={ZOOM_FIELD}
          tokenAssetId={
            typeof tokenAssetId === 'string' ? tokenAssetId : undefined
          }
          label={words.centerLabel}
          hint={words.centerHint}
          required
          {...centerValidation}
        />
        <ProtocolField<typeof MapZoomField>
          name={ZOOM_FIELD}
          component={MapZoomField}
          label={words.zoomLabel}
          hint={words.zoomHint}
          required
          minValue={MIN_ZOOM}
          maxValue={MAX_ZOOM}
        />
      </BuilderSection>
    </>
  );
}
