import GeoJSONThumbnail from '~/components/Thumbnail/GeoJSON';

import File, { type FileInputProps } from '../File';

type GeoDataSourceProps = Omit<
  FileInputProps,
  'type' | 'selected' | 'children'
> & {
  canUseExisting?: boolean;
};

// `canUseExisting` is accepted for call-site symmetry with `DataSource` but has
// no geospatial equivalent, so it is dropped rather than forwarded onto the DOM.
const GeoDataSource = ({
  canUseExisting: _canUseExisting,
  ...props
}: GeoDataSourceProps) => (
  <File type="geojson" {...props}>
    {(id: string) => <GeoJSONThumbnail id={id} />}
  </File>
);

export default GeoDataSource;
