import Icon from "@codaco/ui/lib/components/Icon";
import cx from "classnames";
import PropTypes from "prop-types";
import withAssetMeta from "~/src/components/Assets/withAssetMeta";

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
	// eslint-disable-next-line react/forbid-prop-types
	meta: PropTypes.object,
};

GeoJSONThumbnail.defaultProps = {
	meta: {
		name: "",
	},
};

export default withAssetMeta(GeoJSONThumbnail);
