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

type VideoThumbnailProps = {
	id: string;
	meta?: {
		name?: string;
	};
	interactive?: boolean;
	fullWidth?: boolean;
};

const VideoThumbnail = ({ id, meta = { name: "" }, interactive, fullWidth }: VideoThumbnailProps) => (
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

export default withAssetMeta(VideoThumbnail);
