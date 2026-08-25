import type { ComponentType } from 'react';

import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Section from '@codaco/fresco-ui/Section';
import { mapboxStyleOptions } from '~/config/mapboxConstants';
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

const FrescoNativeSelectField = NativeSelectField as ComponentType<
  Record<string, unknown>
>;

type MapOptionsValue = MapValue & {
  showTransit?: boolean;
  allowSearch?: boolean;
};

const NO_SELECTABLE_PROPERTIES_MESSAGE =
  'The selected GeoJSON has no feature properties available for map selection. Choose a GeoJSON file whose features include properties.';

const noSelectablePropertiesGuard = () => NO_SELECTABLE_PROPERTIES_MESSAGE;

const MapOptions = () => {
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
        title="Map access"
        description="Provide the Mapbox API key required to display the map."
      >
        <div data-name="Map Options Mapbox Key" />
        <ArchitectField
          name="mapOptions.tokenAssetId"
          component={GeoAPIKey}
          initialValue={initialMapOptions?.tokenAssetId}
          validation={{ required: true }}
          label="Mapbox API Key"
          hint={
            <>
              This interface requires an API key from Mapbox. For more
              information about Mapbox and retrieving an API key, read our{' '}
              <ExternalLink href={documentationLinks.geospatialInterface}>
                documentation
              </ExternalLink>{' '}
              on the interface.
            </>
          }
        />
      </Section>
      <Section
        title="Map layers"
        description="Select the GeoJSON source that provides selectable areas for prompts."
      >
        <div data-name="Layer data-source" />
        <ArchitectField
          component={GeoDataSource}
          name="mapOptions.dataSourceAssetId"
          initialValue={initialMapOptions?.dataSourceAssetId}
          validation={{ required: true }}
          label="Layer data source"
          hint="Choose a GeoJSON resource containing the geographic areas participants can select. Each feature should include a property that identifies the area, such as a census tract, ZIP code, or neighborhood; after selecting the resource, choose which property value to record below. Avoid very large files or features outside the study area, as they can slow map loading."
        />
        {Boolean(dataSourceAssetId) && !isVariablesLoading && (
          <ArchitectField
            name="mapOptions.targetFeatureProperty"
            label="Map selection property"
            component={FrescoNativeSelectField}
            initialValue={initialTargetFeatureProperty}
            validation={{
              required: noSelectableProperties
                ? noSelectablePropertiesGuard
                : true,
            }}
            options={variableOptions}
            disabled={noSelectableProperties}
            hint={
              noSelectableProperties
                ? NO_SELECTABLE_PROPERTIES_MESSAGE
                : undefined
            }
          />
        )}
      </Section>
      <Section
        title="Map appearance"
        description={
          disabled
            ? 'Provide a Mapbox API key before configuring the map appearance.'
            : 'Customize the colors, style, and features of the map.'
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
          label="Map outline and selection color"
        />
        <ArchitectField
          label="Mapbox style"
          component={FrescoNativeSelectField}
          name="mapOptions.style"
          initialValue={initialMapOptions?.style}
          validation={{ required: true }}
          options={mapboxStyleOptions}
        />

        <ArchitectField
          name="mapOptions.showTransit"
          label="Show public transit"
          hint="Show public transit routes and stations on the map."
          component={ToggleField}
          inline
          initialValue={initialShowTransit ?? false}
        />

        <ArchitectField
          name="mapOptions.allowSearch"
          label="Allow location search"
          hint="Allow participants to search the map for addresses, neighborhoods, and points of interest."
          component={ToggleField}
          inline
          initialValue={initialAllowSearch ?? false}
        />
      </Section>
      <Section
        title="Map starting position"
        description={
          disabled
            ? 'Provide a Mapbox API key before setting the initial map view.'
            : 'Set where the map is centered and how far it is zoomed when the stage opens.'
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
          validation={{ required: 'Required', completeMapView }}
          label="Initial map view"
          hint="Configure the initial map view to adjust where it will be centered and zoomed to."
          previewOptions={{ tokenAssetId, style }}
        />
      </Section>
    </>
  );
};
export default MapOptions;
