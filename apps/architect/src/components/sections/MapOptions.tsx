import type { ComponentType } from 'react';

import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { mapboxStyleOptions } from '~/config/mapboxConstants';
import { documentationLinks } from '~/utils/documentationLinks';

import useVariablesFromExternalData from '../../hooks/useVariablesFromExternalData';
import { Section } from '../EditorLayout';
import ExternalLink from '../ExternalLink';
import ArchitectField from '../Form/ArchitectField';
import ColorPicker from '../Form/Fields/ColorPicker';
import GeoAPIKey from '../Form/Fields/Geospatial/GeoAPIKey';
import GeoDataSource from '../Form/Fields/Geospatial/GeoDataSource';
import MapSelection, {
  requiredMapView,
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
        title="API Key"
        summary={
          <Paragraph>
            This interface requires an API key from Mapbox. For more information
            about Mapbox and retrieving an API key, read our{' '}
            <ExternalLink href={documentationLinks.geospatialInterface}>
              documentation
            </ExternalLink>{' '}
            on the interface.
          </Paragraph>
        }
      >
        <div data-name="Map Options Mapbox Key" />
        <ArchitectField
          name="mapOptions.tokenAssetId"
          component={GeoAPIKey}
          initialValue={initialMapOptions?.tokenAssetId}
          validation={{ required: true }}
          label="Mapbox API Key"
        />
      </Section>
      <Section
        title="Data source for map layers"
        summary={
          <Paragraph>
            This interface requires a GeoJSON source for map layers. These
            provide selectable areas for prompts. Select a GeoJSON file to use.
          </Paragraph>
        }
      >
        <>
          <div data-name="Layer data-source" />
          <ArchitectField
            component={GeoDataSource}
            name="mapOptions.dataSourceAssetId"
            initialValue={initialMapOptions?.dataSourceAssetId}
            validation={{ required: true }}
            label="Layer data source"
          />
        </>
        {Boolean(dataSourceAssetId) && !isVariablesLoading && (
          <>
            <ArchitectField
              name="mapOptions.targetFeatureProperty"
              label="Which property should be used for map selection?"
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
          </>
        )}
      </Section>
      <Section
        title="Map Style"
        summary={
          <Paragraph>
            Customize the colors, style, and features of the map.
          </Paragraph>
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
          label="Which color would you like to use for this stage's map outlines and selections?"
        />
        <ArchitectField
          label="Which mapbox style would you like to use for the map itself?"
          component={FrescoNativeSelectField}
          name="mapOptions.style"
          initialValue={initialMapOptions?.style}
          validation={{ required: true }}
          options={mapboxStyleOptions}
        />

        <ArchitectField
          name="mapOptions.showTransit"
          label="Show Public Transit"
          hint="Show public transit routes and stations on the map."
          component={ToggleField}
          inline
          initialValue={initialShowTransit ?? false}
        />

        <ArchitectField
          name="mapOptions.allowSearch"
          label="Allow Location Search"
          hint="Allow participants to search the map for addresses, neighborhoods, and points of interest."
          component={ToggleField}
          inline
          initialValue={initialAllowSearch ?? false}
        />
      </Section>
      <Section
        title="Initial Map View"
        summary={
          <Paragraph>
            Configure the initial map view to adjust where it will be centered
            and zoomed to.
          </Paragraph>
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
          validation={{ required: requiredMapView }}
          label="Map center and zoom"
          previewOptions={{ tokenAssetId, style }}
        />
      </Section>
    </>
  );
};
export default MapOptions;
