import Icon from "@codaco/legacy-ui/components/Icon";
import cx from "classnames";
import withAssetMeta from "~/components/Assets/withAssetMeta";

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
