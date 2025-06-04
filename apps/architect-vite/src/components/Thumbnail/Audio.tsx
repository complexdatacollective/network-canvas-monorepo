import Icon from "@codaco/legacy-ui/components/Icon";
import cx from "classnames";
import withAssetMeta from "~/components/Assets/withAssetMeta";

type AudioThumbnailProps = {
	id: string;
	meta?: {
		name?: string;
	};
};

const AudioThumbnail = ({ id, meta = { name: "" } }: AudioThumbnailProps) => (
	<div className={cx("thumbnail thumbnail--audio", { "thumbnail--existing": id === "existing" })}>
		<div className="thumbnail__icon">
			<Icon name="menu-custom-interface" />
		</div>
		<div className="thumbnail__label">{meta.name}</div>
	</div>
);

export default withAssetMeta(AudioThumbnail);
