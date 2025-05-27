import cx from "classnames";
import PropTypes from "prop-types";
import withAssetMeta from "~/components/Assets/withAssetMeta";
import Icon from "~/lib/legacy-ui/components/Icon";

const APIKeyThumbnail = ({ id, meta }) => (
	<div className={cx("thumbnail thumbnail--audio", { "thumbnail--existing": id === "existing" })}>
		<div className="thumbnail__icon">
			<Icon name="VpnKey" />
		</div>
		<div className="thumbnail__label">{meta.name}</div>
	</div>
);

APIKeyThumbnail.propTypes = {
	id: PropTypes.string.isRequired,
	// eslint-disable-next-line react/forbid-prop-types
	meta: PropTypes.object,
};

APIKeyThumbnail.defaultProps = {
	meta: {
		name: "",
	},
};

export default withAssetMeta(APIKeyThumbnail);
