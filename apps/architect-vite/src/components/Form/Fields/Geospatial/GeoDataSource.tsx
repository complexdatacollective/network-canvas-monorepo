import { withState } from "recompose";
import GeoJSONThumbnail from "~/components/Thumbnail/GeoJSON";
import File from "../File";

const withSelectGeoAsset = withState("selectGeoAsset", "setSelectGeoAsset", false);

type GeoDataSourceProps = {
	input: {
		value: string;
	};
	canUseExisting?: boolean;
} & Record<string, unknown>;

const GeoDataSource = (props: GeoDataSourceProps) => {
	const { input } = props;
	return (
		<File
			type="geojson"
			selected={input.value}
			// eslint-disable-next-line react/jsx-props-no-spreading
			{...props}
		>
			{(id) => <GeoJSONThumbnail id={id} />}
		</File>
	);
};

export default withSelectGeoAsset(GeoDataSource);
