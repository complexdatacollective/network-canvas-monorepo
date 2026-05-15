import withAssetMeta from "~/components/Assets/withAssetMeta";
import Icon from "~/lib/legacy-ui/components/Icon";
import { cx } from "~/utils/cva";
import {
	thumbnailBase,
	thumbnailExisting,
	thumbnailFullWidth,
	thumbnailIcon,
	thumbnailInteractive,
	thumbnailLabel,
} from "./styles";

type AudioThumbnailProps = {
	id: string;
	meta?: {
		name?: string;
	};
	interactive?: boolean;
	fullWidth?: boolean;
};

const AudioThumbnail = ({ id, meta = { name: "" }, interactive, fullWidth }: AudioThumbnailProps) => (
	<div
		className={cx(
			thumbnailBase,
			id === "existing" && thumbnailExisting,
			fullWidth && thumbnailFullWidth,
			interactive && thumbnailInteractive,
		)}
	>
		<div className={thumbnailIcon}>
			<Icon name="menu-custom-interface" />
		</div>
		<div className={thumbnailLabel}>{meta.name}</div>
	</div>
);

export default withAssetMeta(AudioThumbnail);
