import type React from "react";
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

type NetworkThumbnailProps = {
	id: string;
	meta?: {
		name: string;
	};
	interactive?: boolean;
	fullWidth?: boolean;
};

const NetworkThumbnail = ({ id, meta = { name: "" }, interactive, fullWidth }: NetworkThumbnailProps) => (
	<div
		className={cx(
			thumbnailBase,
			id === "existing" && thumbnailExisting,
			fullWidth && thumbnailFullWidth,
			interactive && thumbnailInteractive,
		)}
	>
		<div className={thumbnailIcon}>
			<Icon name="menu-sociogram" />
		</div>
		<div className={thumbnailLabel}>{meta.name}</div>
	</div>
);

export default withAssetMeta(NetworkThumbnail) as React.ComponentType<{
	id: string;
	interactive?: boolean;
	fullWidth?: boolean;
}>;
