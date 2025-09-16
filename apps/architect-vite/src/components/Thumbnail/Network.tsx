import cx from "classnames";
import withAssetMeta from "~/components/Assets/withAssetMeta";
import Icon from "~/lib/legacy-ui/components/Icon";

type NetworkThumbnailProps = {
	id: string;
	meta?: {
		name: string;
	};
};

const NetworkThumbnail = ({ id, meta = { name: "" } }: NetworkThumbnailProps) => (
	<div className={cx("thumbnail thumbnail--network", { "thumbnail--existing": id === "existing" })}>
		<div className="thumbnail__icon">
			<Icon name="menu-sociogram" />
		</div>
		<div className="thumbnail__label">{meta.name}</div>
	</div>
);

export default withAssetMeta(NetworkThumbnail);
