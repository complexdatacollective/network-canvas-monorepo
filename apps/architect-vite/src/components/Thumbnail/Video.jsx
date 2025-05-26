import Icon from "@codaco/ui/lib/components/Icon";
import cx from "classnames";
import PropTypes from "prop-types";
import withAssetMeta from "~/src/components/Assets/withAssetMeta";

const VideoThumbnail = ({ id, meta }) => (
	<div className={cx("thumbnail thumbnail--video", { "thumbnail--existing": id === "existing" })}>
		<div className="thumbnail__icon">
			<Icon name="menu-custom-interface" />
		</div>
		<div className="thumbnail__label">{meta.name}</div>
	</div>
);

VideoThumbnail.propTypes = {
	id: PropTypes.string.isRequired,
	// eslint-disable-next-line react/forbid-prop-types
	meta: PropTypes.object,
};

VideoThumbnail.defaultProps = {
	meta: {
		name: "",
	},
};

export { VideoThumbnail };

export default withAssetMeta(VideoThumbnail);
