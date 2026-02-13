import GeoJSONThumbnail from "@components/Thumbnail/GeoJSON";
import PropTypes from "prop-types";
import { withState } from "recompose";
import { fieldPropTypes } from "redux-form";
import File from "../File";

const withSelectGeoAsset = withState("selectGeoAsset", "setSelectGeoAsset", false);

const GeoDataSource = (props) => {
	const { input } = props;
	return (
		<File type="geojson" selected={input.value} {...props}>
			{(id) => <GeoJSONThumbnail id={id} />}
		</File>
	);
};

GeoDataSource.propTypes = {
	...fieldPropTypes,
	canUseExisting: PropTypes.bool,
};

GeoDataSource.defaultProps = {
	canUseExisting: false,
};

export default withSelectGeoAsset(GeoDataSource);
