import cx from "classnames";
import withAssetMeta from "~/components/Assets/withAssetMeta";
import Icon from "~/lib/legacy-ui/components/Icon";

type AudioThumbnailProps = {
	id: string;
	meta?: {
		name?: string;
	};
};

const AudioThumbnail = ({ id, meta = { name: "" } }: AudioThumbnailProps) => (
	<div
		className={cx("thumbnail thumbnail--audio", {
			"thumbnail--existing": id === "existing",
		})}
	>
		<div className="thumbnail__icon">
			<Icon name="menu-custom-interface" />
		</div>
		<div className="thumbnail__label">{meta.name}</div>
	</div>
);

export default withAssetMeta(AudioThumbnail);
