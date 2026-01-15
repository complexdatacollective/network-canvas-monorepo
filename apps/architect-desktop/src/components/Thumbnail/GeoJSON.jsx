import Icon from "@codaco/ui/lib/components/Icon";
import withAssetMeta from "@components/Assets/withAssetMeta";
import cx from "classnames";
import PropTypes from "prop-types";

const GeoJSONThumbnail = ({ id, meta }) => (
	<div className={cx("thumbnail thumbnail--audio", { "thumbnail--existing": id === "existing" })}>
		<div className="thumbnail__icon">
			<Icon name="Map" />
		</div>
		<div className="thumbnail__label">{meta.name}</div>
	</div>
);

GeoJSONThumbnail.propTypes = {
	id: PropTypes.string.isRequired,
	meta: PropTypes.object,
};

GeoJSONThumbnail.defaultProps = {
	meta: {
		name: "",
	},
};

export default withAssetMeta(GeoJSONThumbnail);
