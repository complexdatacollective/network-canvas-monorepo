import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';
import { OrdinalColorSequence } from '@codaco/protocol-validation';

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
import BuilderSection from '../BuilderSection.tsx';
import {
  CENTER_FIELD,
  COLOR_FIELD,
  SEARCH_FIELD,
  STYLE_FIELD,
  TOKEN_FIELD,
  TRANSIT_FIELD,
  ZOOM_FIELD,
} from './mapOptionsFields.ts';

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

export type MapAppearanceCopy = Readonly<{
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

const DEFAULT_COPY: MapAppearanceCopy = {
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

export type MapAppearanceSectionProps = Readonly<{
  copy?: Partial<MapAppearanceCopy>;
}>;

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
export default function MapAppearanceSection({
  copy,
}: MapAppearanceSectionProps) {
  const words = { ...DEFAULT_COPY, ...copy };
  const tokenAssetId = useStageValue(TOKEN_FIELD);

  return (
    <>
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
