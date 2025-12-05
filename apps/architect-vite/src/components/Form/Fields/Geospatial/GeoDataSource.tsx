import GeoJSONThumbnail from "~/components/Thumbnail/GeoJSON";
import File, { type FileInputPropsWithoutHOC } from "../File";

type GeoDataSourceProps = Omit<FileInputPropsWithoutHOC, "type" | "selected" | "children"> & {
	canUseExisting?: boolean;
};

const GeoDataSource = (props: GeoDataSourceProps) => {
	const { input } = props;
	return (
		<File
			type="geojson"
			selected={input.value}
			// eslint-disable-next-line react/jsx-props-no-spreading
			{...props}
		>
			{(id: string) => <GeoJSONThumbnail id={id} />}
		</File>
	);
};

export default GeoDataSource;
