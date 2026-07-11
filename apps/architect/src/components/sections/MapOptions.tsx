import type { ComponentType } from 'react';
import { compose } from 'react-recompose';

import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import withDisabledAPIKeyRequired from '~/components/enhancers/withDisabledAPIKeyRequired';
import withMapFormToProps from '~/components/enhancers/withMapFormToProps';
import { FrescoReduxField } from '~/components/Form';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';

import useVariablesFromExternalData from '../../hooks/useVariablesFromExternalData';
import { Row, Section } from '../EditorLayout';
import ExternalLink from '../ExternalLink';
import ColorPicker from '../Form/Fields/ColorPicker';
import GeoAPIKey from '../Form/Fields/Geospatial/GeoAPIKey';
import GeoDataSource from '../Form/Fields/Geospatial/GeoDataSource';
import { mapboxStyleOptions } from '../Form/Fields/Geospatial/mapboxConstants';
import MapSelection, {
  requiredMapView,
} from '../Form/Fields/Geospatial/MapSelection';
import Toggle from '../Form/Fields/Toggle';
import ValidatedField from '../Form/ValidatedField';

const FrescoNativeSelectField = NativeSelectField as ComponentType<
  Record<string, unknown>
>;

type MapOptionsProps = StageEditorSectionProps & {
  mapOptions?: {
    center?: number[];
    tokenAssetId?: string;
    initialZoom?: number;
    dataSourceAssetId?: string;
    color?: string;
    targetFeatureProperty?: string;
    style?: string;
    showTransit?: boolean;
    allowSearch?: boolean;
  };
  disabled: boolean;
};
const defaultMapOptions = {
  center: [0, 0],
  tokenAssetId: '',
  initialZoom: 0,
  dataSourceAssetId: '',
  color: '',
  targetFeatureProperty: '',
  style: '',
  showTransit: false,
  allowSearch: false,
};
const MapOptions = ({
  mapOptions = defaultMapOptions,
  disabled,
}: MapOptionsProps) => {
  const { variables: variableOptions } = useVariablesFromExternalData(
    mapOptions?.dataSourceAssetId,
    true,
    'geojson',
  );
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
            about Mapbox and retreiving an API Key, read our{' '}
            <ExternalLink href="https://documentation.networkcanvas.com/interface-documentation/geospatial/">
              documentation
            </ExternalLink>{' '}
            on the interface.
          </Paragraph>
        }
      >
        <div data-name="Map Options Mapbox Key" />
        <ValidatedField
          name="mapOptions.tokenAssetId"
          component={GeoAPIKey as React.ComponentType}
          validation={{ required: true }}
          componentProps={{
            label: 'Mapbox API Key',
          }}
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
        <Row>
          <div data-name="Layer data-source" />
          <ValidatedField
            component={GeoDataSource as React.ComponentType}
            name="mapOptions.dataSourceAssetId"
            validation={{ required: true }}
          />
        </Row>
        {variableOptions && variableOptions.length > 0 && (
          <Row>
            <ValidatedField
              name="mapOptions.targetFeatureProperty"
              label="Which property should be used for map selection?"
              component={FrescoReduxField}
              validation={{ required: true }}
              componentProps={{
                fieldComponent: FrescoNativeSelectField,
                options: variableOptions,
              }}
            />
          </Row>
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
        <ValidatedField
          component={ColorPicker as React.ComponentType}
          name="mapOptions.color"
          validation={{ required: true }}
          componentProps={{
            palette: paletteName,
            paletteRange: paletteSize,
            label:
              "Which color would you like to use for this stage's map outlines and selections?",
          }}
        />
        <ValidatedField
          label="Which mapbox style would you like to use for the map itself?"
          component={FrescoReduxField}
          name="mapOptions.style"
          validation={{ required: true }}
          componentProps={{
            fieldComponent: FrescoNativeSelectField,
            options: mapboxStyleOptions,
          }}
        />

        <Heading level="h4">Show Public Transit</Heading>
        <ValidatedField
          name="mapOptions.showTransit"
          component={Toggle as React.ComponentType}
          validation={{}}
          componentProps={{
            label: 'Show public transit routes and stations on the map.',
          }}
        />

        <Heading level="h4">Allow Location Search</Heading>
        <ValidatedField
          name="mapOptions.allowSearch"
          component={Toggle as React.ComponentType}
          validation={{}}
          componentProps={{
            label:
              'Allow participants to search the map for addresses, neighborhoods, and points of interest.',
          }}
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
        <ValidatedField
          name="mapOptions"
          component={MapSelection as React.ComponentType}
          validation={{ required: requiredMapView }}
          componentProps={{
            label: 'Initial Map View',
          }}
        />
      </Section>
    </>
  );
};
export default compose<MapOptionsProps, StageEditorSectionProps>(
  withMapFormToProps(['mapOptions']),
  withDisabledAPIKeyRequired,
)(MapOptions);
