import cx from "classnames";
import withAssetMeta from "~/components/Assets/withAssetMeta";
import Icon from "~/lib/legacy-ui/components/Icon";
import { thumbnailBase, thumbnailExisting, thumbnailIcon, thumbnailLabel } from "./styles";

type AudioThumbnailProps = {
	id: string;
	meta?: {
		name?: string;
	};
};

const AudioThumbnail = ({ id, meta = { name: "" } }: AudioThumbnailProps) => (
	<div className={cx(thumbnailBase, id === "existing" && thumbnailExisting)}>
		<div className={thumbnailIcon}>
			<Icon name="menu-custom-interface" />
		</div>
		<div className={thumbnailLabel}>{meta.name}</div>
	</div>
);

export default withAssetMeta(AudioThumbnail);
