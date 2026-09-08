import {
  type IntlShape,
  createAppIntl,
  defineMessages,
} from '@codaco/app-i18n/messages';

const defaultIntl = createAppIntl({ locale: 'en' });
import type { ComponentType } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Section from '@codaco/fresco-ui/Section';
import { mapboxStyleOptions } from '~/config/mapboxConstants';
import { formatConfig } from '~/i18n/formatConfig';
import { documentationLinks } from '~/utils/documentationLinks';

import useVariablesFromExternalData from '../../hooks/useVariablesFromExternalData';
import ExternalLink from '../ExternalLink';
import ArchitectField from '../Form/ArchitectField';
import ColorPicker from '../Form/Fields/ColorPicker';
import GeoAPIKey from '../Form/Fields/Geospatial/GeoAPIKey';
import GeoDataSource from '../Form/Fields/Geospatial/GeoDataSource';
import MapSelection, {
  completeMapView,
  type MapValue,
} from '../Form/Fields/Geospatial/MapSelection';
import {
  useStageFormValue,
  useStageInitialValue,
} from '../StageEditor/stageFormHooks';
const additionalMessages = defineMessages({
  thisInterfaceRequiresAnAPIKey: {
    id: 'architect.additional.sections.mapOptions.thisInterfaceRequiresAnAPIKey',
    defaultMessage:
      'This interface requires an API key from Mapbox. For more information about Mapbox and retrieving an API key, read our <ExternalLink> documentation </ExternalLink> on the interface.',
    description: 'Visible text in components / sections / MapOptions.',
  },
});
const messages = defineMessages({
  mapAccess: {
    id: 'architect.sections.mapOptions.mapAccess',
    defaultMessage: 'Map access',
    description: 'The title text in components / sections / MapOptions.',
  },
  provideTheMapboxAPIKeyRequired: {
    id: 'architect.sections.mapOptions.provideTheMapboxAPIKeyRequired',
    defaultMessage: 'Provide the Mapbox API key required to display the map.',
    description: 'The description text in components / sections / MapOptions.',
  },
  mapboxAPIKey: {
    id: 'architect.sections.mapOptions.mapboxAPIKey',
    defaultMessage: 'Mapbox API Key',
    description: 'The label text in components / sections / MapOptions.',
  },
  mapLayers: {
    id: 'architect.sections.mapOptions.mapLayers',
    defaultMessage: 'Map layers',
    description: 'The title text in components / sections / MapOptions.',
  },
  selectTheGeoJSONSourceThatProvides: {
    id: 'architect.sections.mapOptions.selectTheGeoJSONSourceThatProvides',
    defaultMessage:
      'Select the GeoJSON source that provides selectable areas for prompts.',
    description: 'The description text in components / sections / MapOptions.',
  },
  layerDataSource: {
    id: 'architect.sections.mapOptions.layerDataSource',
    defaultMessage: 'Layer data source',
    description: 'The label text in components / sections / MapOptions.',
  },
  chooseAGeoJSONResourceContainingThe: {
    id: 'architect.sections.mapOptions.chooseAGeoJSONResourceContainingThe',
    defaultMessage:
      'Choose a GeoJSON resource containing the geographic areas participants can select. Each feature should include a property that identifies the area, such as a census tract, ZIP code, or neighborhood; after selecting the resource, choose which property value to record below. Avoid very large files or features outside the study area, as they can slow map loading.',
    description: 'The hint text in components / sections / MapOptions.',
  },
  mapSelectionProperty: {
    id: 'architect.sections.mapOptions.mapSelectionProperty',
    defaultMessage: 'Map selection property',
    description: 'The label text in components / sections / MapOptions.',
  },
  mapAppearance: {
    id: 'architect.sections.mapOptions.mapAppearance',
    defaultMessage: 'Map appearance',
    description: 'The title text in components / sections / MapOptions.',
  },
  provideAMapboxAPIKeyBefore: {
    id: 'architect.sections.mapOptions.provideAMapboxAPIKeyBefore',
    defaultMessage:
      'Provide a Mapbox API key before configuring the map appearance.',
    description: 'The description text in components / sections / MapOptions.',
  },
  customizeTheColorsStyleAndFeatures: {
    id: 'architect.sections.mapOptions.customizeTheColorsStyleAndFeatures',
    defaultMessage: 'Customize the colors, style, and features of the map.',
    description: 'The description text in components / sections / MapOptions.',
  },
  mapOutlineAndSelectionColor: {
    id: 'architect.sections.mapOptions.mapOutlineAndSelectionColor',
    defaultMessage: 'Map outline and selection color',
    description: 'The label text in components / sections / MapOptions.',
  },
  chooseTheColorUsedToOutline: {
    id: 'architect.sections.mapOptions.chooseTheColorUsedToOutline',
    defaultMessage:
      'Choose the color used to outline selectable GeoJSON areas and highlight the area a participant selects. Use a color that remains easy to distinguish from the chosen Mapbox style.',
    description: 'The hint text in components / sections / MapOptions.',
  },
  mapboxStyle: {
    id: 'architect.sections.mapOptions.mapboxStyle',
    defaultMessage: 'Mapbox style',
    description: 'The label text in components / sections / MapOptions.',
  },
  chooseTheMapboxBasemapDisplayedBeneath: {
    id: 'architect.sections.mapOptions.chooseTheMapboxBasemapDisplayedBeneath',
    defaultMessage:
      'Choose the Mapbox basemap displayed beneath the selectable GeoJSON areas. Consider the contrast between the basemap, the configured outline color, and any place labels participants need to read.',
    description: 'The hint text in components / sections / MapOptions.',
  },
  showPublicTransit: {
    id: 'architect.sections.mapOptions.showPublicTransit',
    defaultMessage: 'Show public transit',
    description: 'The label text in components / sections / MapOptions.',
  },
  showPublicTransitRoutesAndStations: {
    id: 'architect.sections.mapOptions.showPublicTransitRoutesAndStations',
    defaultMessage: 'Show public transit routes and stations on the map.',
    description: 'The hint text in components / sections / MapOptions.',
  },
  allowLocationSearch: {
    id: 'architect.sections.mapOptions.allowLocationSearch',
    defaultMessage: 'Allow location search',
    description: 'The label text in components / sections / MapOptions.',
  },
  allowParticipantsToSearchTheMap: {
    id: 'architect.sections.mapOptions.allowParticipantsToSearchTheMap',
    defaultMessage:
      'Allow participants to search the map for addresses, neighborhoods, and points of interest.',
    description: 'The hint text in components / sections / MapOptions.',
  },
  mapStartingPosition: {
    id: 'architect.sections.mapOptions.mapStartingPosition',
    defaultMessage: 'Map starting position',
    description: 'The title text in components / sections / MapOptions.',
  },
  provideAMapboxAPIKeyBefore103d9: {
    id: 'architect.sections.mapOptions.provideAMapboxAPIKeyBefore103d9',
    defaultMessage:
      'Provide a Mapbox API key before setting the initial map view.',
    description: 'The description text in components / sections / MapOptions.',
  },
  setWhereTheMapIsCentered: {
    id: 'architect.sections.mapOptions.setWhereTheMapIsCentered',
    defaultMessage:
      'Set where the map is centered and how far it is zoomed when the stage opens.',
    description: 'The description text in components / sections / MapOptions.',
  },
  initialMapView: {
    id: 'architect.sections.mapOptions.initialMapView',
    defaultMessage: 'Initial map view',
    description: 'The label text in components / sections / MapOptions.',
  },
  configureTheInitialMapViewTo: {
    id: 'architect.sections.mapOptions.configureTheInitialMapViewTo',
    defaultMessage:
      'Configure the initial map view to adjust where it will be centered and zoomed to.',
    description: 'The hint text in components / sections / MapOptions.',
  },
});

const FrescoNativeSelectField = NativeSelectField as ComponentType<
  Record<string, unknown>
>;

type MapOptionsValue = MapValue & {
  showTransit?: boolean;
  allowSearch?: boolean;
};

const NO_SELECTABLE_PROPERTIES_MESSAGE = defineMessages({
  message: {
    id: 'architect.constants.components.sections.mapoptions.noSelectablePropertiesMessage',
    defaultMessage:
      'The selected GeoJSON has no feature properties available for map selection. Choose a GeoJSON file whose features include properties.',
    description:
      'Researcher-facing status or validation message. Context: components/sections/MapOptions.tsx.',
  },
}).message;
const MAP_SELECTION_PROPERTY_HINT = defineMessages({
  message: {
    id: 'architect.constants.components.sections.mapoptions.mapSelectionPropertyHint',
    defaultMessage:
      "Choose the feature property whose value will identify a selected area and be stored in each prompt's location attribute. Use a property with a unique, non-empty value for every feature, such as a census tract ID, ZIP code, or neighborhood name.",
    description:
      'Researcher-facing status or validation message. Context: components/sections/MapOptions.tsx.',
  },
}).message;

const noSelectablePropertiesGuard = (intl: IntlShape = defaultIntl) =>
  intl.formatMessage(NO_SELECTABLE_PROPERTIES_MESSAGE);

const MapOptions = () => {
  const intl = useAppIntl();
  // Read the two gating values from their OWN leaf paths, not the parent
  // `mapOptions` path: `mapOptions` is itself a separately registered field
  // (bound whole-object to `MapSelection` below) — once it registers,
  // `useStageFormValue('mapOptions')` would return only that field's own
  // tracked value rather than the live assembled object, so it would miss
  // edits made through these sibling leaf fields.
  const dataSourceAssetId = useStageFormValue<string | undefined>(
    'mapOptions.dataSourceAssetId',
  );
  const tokenAssetId = useStageFormValue<string | undefined>(
    'mapOptions.tokenAssetId',
  );
  // Read for the same reason: the map preview `MapSelection` opens renders a
  // real Mapbox map, which needs the key and style the sibling fields hold.
  const style = useStageFormValue<string | undefined>('mapOptions.style');
  const initialMapOptions = useStageInitialValue<MapOptionsValue>('mapOptions');
  const initialTargetFeatureProperty = useStageInitialValue<string>(
    'mapOptions.targetFeatureProperty',
  );
  const initialShowTransit = useStageInitialValue<boolean>(
    'mapOptions.showTransit',
  );
  const initialAllowSearch = useStageInitialValue<boolean>(
    'mapOptions.allowSearch',
  );
  const disabled = !tokenAssetId;
  const { variables: variableOptions, isVariablesLoading } =
    useVariablesFromExternalData(dataSourceAssetId, true, 'geojson');
  const noSelectableProperties =
    Boolean(dataSourceAssetId) &&
    !isVariablesLoading &&
    variableOptions.length === 0;
  const { paletteName, paletteSize } = {
    paletteName: 'ord-color-seq',
    paletteSize: 8,
  };
  return (
    <>
      <Section
        title={intl.formatMessage(messages.mapAccess)}
        description={intl.formatMessage(
          messages.provideTheMapboxAPIKeyRequired,
        )}
      >
        <div data-name="Map Options Mapbox Key" />
        <ArchitectField
          name="mapOptions.tokenAssetId"
          component={GeoAPIKey}
          initialValue={initialMapOptions?.tokenAssetId}
          validation={{ required: true }}
          label={intl.formatMessage(messages.mapboxAPIKey)}
          hint={
            <>
              {intl.formatMessage(
                additionalMessages.thisInterfaceRequiresAnAPIKey,
                {
                  ExternalLink: (chunks) => (
                    <ExternalLink href={documentationLinks.geospatialInterface}>
                      {chunks}
                    </ExternalLink>
                  ),
                },
              )}
            </>
          }
        />
      </Section>
      <Section
        title={intl.formatMessage(messages.mapLayers)}
        description={intl.formatMessage(
          messages.selectTheGeoJSONSourceThatProvides,
        )}
      >
        <div data-name="Layer data-source" />
        <ArchitectField
          component={GeoDataSource}
          name="mapOptions.dataSourceAssetId"
          initialValue={initialMapOptions?.dataSourceAssetId}
          validation={{ required: true }}
          label={intl.formatMessage(messages.layerDataSource)}
          hint={intl.formatMessage(
            messages.chooseAGeoJSONResourceContainingThe,
          )}
        />
        {Boolean(dataSourceAssetId) && !isVariablesLoading && (
          <ArchitectField
            name="mapOptions.targetFeatureProperty"
            label={intl.formatMessage(messages.mapSelectionProperty)}
            component={FrescoNativeSelectField}
            initialValue={initialTargetFeatureProperty}
            validation={{
              required: noSelectableProperties
                ? () => noSelectablePropertiesGuard(intl)
                : true,
            }}
            options={variableOptions}
            disabled={noSelectableProperties}
            hint={
              noSelectableProperties
                ? intl.formatMessage(NO_SELECTABLE_PROPERTIES_MESSAGE)
                : intl.formatMessage(MAP_SELECTION_PROPERTY_HINT)
            }
          />
        )}
      </Section>
      <Section
        title={intl.formatMessage(messages.mapAppearance)}
        description={
          disabled
            ? intl.formatMessage(messages.provideAMapboxAPIKeyBefore)
            : intl.formatMessage(messages.customizeTheColorsStyleAndFeatures)
        }
        disabled={disabled}
      >
        <ArchitectField
          component={ColorPicker}
          name="mapOptions.color"
          initialValue={initialMapOptions?.color}
          validation={{ required: true }}
          palette={paletteName}
          paletteRange={paletteSize}
          label={intl.formatMessage(messages.mapOutlineAndSelectionColor)}
          hint={intl.formatMessage(messages.chooseTheColorUsedToOutline)}
        />
        <ArchitectField
          label={intl.formatMessage(messages.mapboxStyle)}
          hint={intl.formatMessage(
            messages.chooseTheMapboxBasemapDisplayedBeneath,
          )}
          component={FrescoNativeSelectField}
          name="mapOptions.style"
          initialValue={initialMapOptions?.style}
          validation={{ required: true }}
          options={formatConfig(mapboxStyleOptions, intl)}
        />

        <ArchitectField
          name="mapOptions.showTransit"
          label={intl.formatMessage(messages.showPublicTransit)}
          hint={intl.formatMessage(messages.showPublicTransitRoutesAndStations)}
          component={ToggleField}
          inline
          initialValue={initialShowTransit ?? false}
        />

        <ArchitectField
          name="mapOptions.allowSearch"
          label={intl.formatMessage(messages.allowLocationSearch)}
          hint={intl.formatMessage(messages.allowParticipantsToSearchTheMap)}
          component={ToggleField}
          inline
          initialValue={initialAllowSearch ?? false}
        />
      </Section>
      <Section
        title={intl.formatMessage(messages.mapStartingPosition)}
        description={
          disabled
            ? intl.formatMessage(messages.provideAMapboxAPIKeyBefore103d9)
            : intl.formatMessage(messages.setWhereTheMapIsCentered)
        }
        disabled={disabled}
      >
        {/*
          NOTE: this registers a SEPARATE field at the parent `mapOptions`
          path, alongside the `mapOptions.*` leaf fields above — inherited
          from the pre-migration field layout, and kept because the map view
          is two values (`center` + `initialZoom`) set by one control.
          `getFormValues()` writes container paths before the leaves inside
          them, so the leaf fields above always win their own keys no matter
          what order the fields registered in; this field effectively
          contributes only `center`/`initialZoom`. `previewOptions` hands it
          the sibling values its map preview needs to render.
        */}
        <ArchitectField
          name="mapOptions"
          component={MapSelection}
          initialValue={initialMapOptions}
          validation={{
            required: true,
            completeMapView: (value: unknown) => completeMapView(value, intl),
          }}
          label={intl.formatMessage(messages.initialMapView)}
          hint={intl.formatMessage(messages.configureTheInitialMapViewTo)}
          previewOptions={{ tokenAssetId, style }}
        />
      </Section>
    </>
  );
};
export default MapOptions;
